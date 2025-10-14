import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOctokit } from '@/lib/github/client'

// Helper function to convert Vercel feedback URL to actual deployment URL
function convertFeedbackUrlToDeploymentUrl(url: string): string {
  const feedbackMatch = url.match(/vercel\.live\/open-feedback\/(.+)/)
  if (feedbackMatch) {
    return `https://${feedbackMatch[1]}`
  }
  return url
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params

    // Get task from database
    const taskResult = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .limit(1)

    const task = taskResult[0]

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Return cached preview URL if available
    if (task.previewUrl) {
      const previewUrl = convertFeedbackUrlToDeploymentUrl(task.previewUrl)

      // If the URL was converted, update it in the database
      if (previewUrl !== task.previewUrl) {
        await db.update(tasks).set({ previewUrl }).where(eq(tasks.id, taskId))
      }

      return NextResponse.json({
        success: true,
        data: {
          hasDeployment: true,
          previewUrl,
          cached: true,
        },
      })
    }

    // Return early if no branch or repo
    if (!task.branchName || !task.repoUrl) {
      return NextResponse.json({
        success: true,
        data: {
          hasDeployment: false,
          message: 'Task does not have branch or repository information',
        },
      })
    }

    // Parse GitHub repository URL to get owner and repo
    const githubMatch = task.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
    if (!githubMatch) {
      return NextResponse.json({
        success: true,
        data: {
          hasDeployment: false,
          message: 'Invalid GitHub repository URL',
        },
      })
    }

    const [, owner, repo] = githubMatch

    try {
      const octokit = await getOctokit()

      // Check if user has GitHub connected
      if (!octokit.auth) {
        return NextResponse.json({
          success: true,
          data: {
            hasDeployment: false,
            message: 'GitHub account not connected',
          },
        })
      }

      // First, get the latest commit on the branch to check for deployment checks
      let latestCommitSha: string | null = null
      try {
        const { data: branch } = await octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: task.branchName,
        })
        latestCommitSha = branch.commit.sha
      } catch (branchError) {
        if (branchError && typeof branchError === 'object' && 'status' in branchError && branchError.status === 404) {
          return NextResponse.json({
            success: true,
            data: {
              hasDeployment: false,
              message: 'Branch not found',
            },
          })
        }
        throw branchError
      }

      // Check for Vercel deployment via GitHub Checks API (most common)
      if (latestCommitSha) {
        try {
          const { data: checkRuns } = await octokit.rest.checks.listForRef({
            owner,
            repo,
            ref: latestCommitSha,
            per_page: 100,
          })

          // Helper function to extract preview URL from check output
          const extractPreviewUrl = (check: {
            output?: { summary?: string | null; text?: string | null } | null
          }): string | null => {
            // Check output summary for deployment URL
            if (check.output?.summary) {
              const summary = check.output.summary
              // Look for URLs in the format https://[deployment]-[hash].vercel.app or other Vercel domains
              const urlMatch = summary.match(/https?:\/\/[^\s\)\]<]+\.vercel\.app/i)
              if (urlMatch) {
                return urlMatch[0]
              }
            }

            // Check output text as well
            if (check.output?.text) {
              const text = check.output.text
              const urlMatch = text.match(/https?:\/\/[^\s\)\]<]+\.vercel\.app/i)
              if (urlMatch) {
                return urlMatch[0]
              }
            }

            return null
          }

          // Look for Vercel check runs - try Preview Comments first as it's more likely to have the URL
          const vercelPreviewCheck = checkRuns.check_runs.find(
            (check) =>
              check.app?.slug === 'vercel' && check.name === 'Vercel Preview Comments' && check.status === 'completed',
          )

          const vercelDeploymentCheck = checkRuns.check_runs.find(
            (check) =>
              check.app?.slug === 'vercel' &&
              check.name === 'Vercel' &&
              check.conclusion === 'success' &&
              check.status === 'completed',
          )

          // Try to get preview URL from either check
          let previewUrl: string | null = null

          if (vercelPreviewCheck) {
            previewUrl = extractPreviewUrl(vercelPreviewCheck)
          }

          if (!previewUrl && vercelDeploymentCheck) {
            previewUrl = extractPreviewUrl(vercelDeploymentCheck)
          }

          // Fallback to details_url if no preview URL found
          if (!previewUrl && vercelDeploymentCheck?.details_url) {
            // Convert feedback URL to actual deployment URL if needed
            previewUrl = convertFeedbackUrlToDeploymentUrl(vercelDeploymentCheck.details_url)
          }

          if (previewUrl) {
            // Store the preview URL in the database
            await db.update(tasks).set({ previewUrl }).where(eq(tasks.id, taskId))

            return NextResponse.json({
              success: true,
              data: {
                hasDeployment: true,
                previewUrl,
                checkId: vercelDeploymentCheck?.id || vercelPreviewCheck?.id,
                createdAt: vercelDeploymentCheck?.completed_at || vercelPreviewCheck?.completed_at,
              },
            })
          }
        } catch (checksError) {
          console.error('Error checking GitHub Checks:', checksError)
          // Continue to try other methods
        }
      }

      // Fallback: Check GitHub Deployments API
      try {
        const { data: deployments } = await octokit.rest.repos.listDeployments({
          owner,
          repo,
          ref: task.branchName,
          per_page: 10,
        })

        if (deployments && deployments.length > 0) {
          // Find the most recent Vercel deployment
          for (const deployment of deployments) {
            // Check if this is a Vercel deployment
            if (
              deployment.environment === 'Preview' ||
              deployment.environment === 'preview' ||
              deployment.description?.toLowerCase().includes('vercel')
            ) {
              // Get deployment status
              const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
                owner,
                repo,
                deployment_id: deployment.id,
                per_page: 1,
              })

              if (statuses && statuses.length > 0) {
                const status = statuses[0]
                if (status.state === 'success') {
                  let previewUrl = status.environment_url || status.target_url
                  if (previewUrl) {
                    // Convert feedback URL to actual deployment URL if needed
                    previewUrl = convertFeedbackUrlToDeploymentUrl(previewUrl)
                    // Store the preview URL in the database
                    await db.update(tasks).set({ previewUrl }).where(eq(tasks.id, taskId))

                    return NextResponse.json({
                      success: true,
                      data: {
                        hasDeployment: true,
                        previewUrl,
                        deploymentId: deployment.id,
                        createdAt: deployment.created_at,
                      },
                    })
                  }
                }
              }
            }
          }
        }
      } catch (deploymentsError) {
        console.error('Error checking GitHub Deployments:', deploymentsError)
        // Continue to final fallback
      }

      // Final fallback: Check commit statuses
      if (latestCommitSha) {
        try {
          const { data: statuses } = await octokit.rest.repos.listCommitStatusesForRef({
            owner,
            repo,
            ref: latestCommitSha,
            per_page: 100,
          })

          const vercelStatus = statuses.find(
            (status) =>
              status.context?.toLowerCase().includes('vercel') && status.state === 'success' && status.target_url,
          )

          if (vercelStatus && vercelStatus.target_url) {
            // Convert feedback URL to actual deployment URL if needed
            const previewUrl = convertFeedbackUrlToDeploymentUrl(vercelStatus.target_url)
            // Store the preview URL in the database
            await db.update(tasks).set({ previewUrl }).where(eq(tasks.id, taskId))

            return NextResponse.json({
              success: true,
              data: {
                hasDeployment: true,
                previewUrl,
                createdAt: vercelStatus.created_at,
              },
            })
          }
        } catch (statusError) {
          console.error('Error checking commit statuses:', statusError)
        }
      }

      // No deployment found
      return NextResponse.json({
        success: true,
        data: {
          hasDeployment: false,
          message: 'No successful Vercel deployment found',
        },
      })
    } catch (error) {
      console.error('Error fetching deployment status:', error)

      // Return graceful response for common errors
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return NextResponse.json({
          success: true,
          data: {
            hasDeployment: false,
            message: 'Branch or repository not found',
          },
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          hasDeployment: false,
          message: 'Failed to fetch deployment status',
        },
      })
    }
  } catch (error) {
    console.error('Error in deployment API:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
