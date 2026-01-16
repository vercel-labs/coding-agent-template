import { getServerSession } from '@/lib/session/get-server-session'
import { redirect } from 'next/navigation'
import { ApiTokens } from '@/components/api-tokens'

export default async function SettingsPage() {
  const session = await getServerSession()

  if (!session?.user) {
    redirect('/')
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold">Settings</h1>
        <section>
          <h2 className="mb-4 text-xl font-semibold">API Tokens</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Create API tokens to access the coding agent from external applications. Tokens are shown only once when
            created.
          </p>
          <ApiTokens />
        </section>
      </div>
    </div>
  )
}
