import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github/client'

export async function GET(request: NextRequest, context: { params: Promise<{ owner: string; repo: string }> }) {
  try {
    const { owner, repo } = await context.params

    const octokit = await getOctokit()

    if (!octokit.auth) {
      return NextResponse.json({ error: 'GitHub authentication required' }, { status: 401 })
    }

    // Fetch projects using GraphQL API for Projects V2
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          projectsV2(first: 30) {
            nodes {
              id
              title
              shortDescription
              number
              closed
              url
              createdAt
              updatedAt
              creator {
                login
                ... on User {
                  avatarUrl
                }
              }
            }
          }
        }
      }
    `

    const response: any = await octokit.graphql(query, {
      owner,
      repo,
    })

    const projects = response.repository?.projectsV2?.nodes || []

    return NextResponse.json({ projects })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}
