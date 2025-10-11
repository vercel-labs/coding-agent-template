import type { VercelTeam, BillingPlan } from './types'

interface PlanInfo {
  plan: BillingPlan
  team: VercelTeam | null
}

/**
 * Find the team listed in the user teams with the highest account level
 * that is currently active.
 */
export function getHighestAccountLevel(allTeams: VercelTeam[]): PlanInfo {
  let highest: PlanInfo = {
    plan: 'hobby',
    team: null,
  }

  if (!allTeams?.length) {
    return highest
  }

  const activeTeams = allTeams.filter((team) => team.billing?.plan && team.billing.status === 'active')

  for (const team of activeTeams) {
    if (team.billing?.plan === 'enterprise') {
      return {
        plan: 'enterprise',
        team,
      }
    }

    if (team.billing?.plan === 'pro') {
      highest = {
        plan: 'pro',
        team,
      }
    }
  }

  return highest
}
