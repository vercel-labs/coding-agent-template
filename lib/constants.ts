// Rate limiting configuration
export const MAX_MESSAGES_PER_DAY = parseInt(process.env.MAX_MESSAGES_PER_DAY || '5', 10)

// Sandbox configuration (in minutes)
export const MAX_SANDBOX_DURATION = parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)

// Vercel deployment configuration
export const VERCEL_DEPLOY_URL =
  'https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fcoding-agent-template&env=SANDBOX_VERCEL_TEAM_ID,SANDBOX_VERCEL_PROJECT_ID,SANDBOX_VERCEL_TOKEN,JWE_SECRET,ENCRYPTION_KEY&envDescription=Required+environment+variables+for+the+coding+agent+template.+You+must+also+configure+at+least+one+OAuth+provider+(GitHub+or+Vercel)+after+deployment.+Optional+API+keys+can+be+added+later.&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D&project-name=coding-agent-template&repository-name=coding-agent-template'

// Vercel button URL for markdown
export const VERCEL_DEPLOY_BUTTON_URL = `[![Deploy with Vercel](https://vercel.com/button)](${VERCEL_DEPLOY_URL})`
