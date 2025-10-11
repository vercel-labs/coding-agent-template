// Vercel deployment configuration
export const VERCEL_DEPLOY_URL =
  'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fcoding-agent-template&env=POSTGRES_URL,VERCEL_TEAM_ID,VERCEL_PROJECT_ID,VERCEL_TOKEN&envDescription=Required+environment+variables+for+the+coding+agent+template.+Optional+variables+(ANTHROPIC_API_KEY,+GITHUB_TOKEN,+AI_GATEWAY_API_KEY,+CURSOR_API_KEY,+NPM_TOKEN)+can+be+added+later+in+your+Vercel+project+settings.&project-name=coding-agent-template&repository-name=coding-agent-template'

// Vercel button URL for markdown
export const VERCEL_DEPLOY_BUTTON_URL = `[![Deploy with Vercel](https://vercel.com/button)](${VERCEL_DEPLOY_URL})`
