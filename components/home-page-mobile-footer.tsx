'use client'

import { Button } from '@/components/ui/button'
import { GitHubIcon } from '@/components/icons/github-icon'
import { VERCEL_DEPLOY_URL } from '@/lib/constants'
import { formatAbbreviatedNumber } from '@/lib/utils/format-number'

const GITHUB_REPO_URL = 'https://github.com/vercel-labs/coding-agent-template'

interface HomePageMobileFooterProps {
  initialStars?: number
}

export function HomePageMobileFooter({ initialStars = 1200 }: HomePageMobileFooterProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-20">
      <div className="flex items-center justify-center gap-3 p-4">
        {/* GitHub Stars Button */}
        <Button asChild variant="ghost" size="default">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2"
          >
            <GitHubIcon className="h-4 w-4" />
            <span className="text-sm font-medium">{formatAbbreviatedNumber(initialStars)}</span>
          </a>
        </Button>

        {/* Deploy to Vercel Button */}
        <Button
          asChild
          variant="default"
          size="default"
          className="bg-black text-white border-black hover:bg-black/90 dark:bg-white dark:text-black dark:border-white dark:hover:bg-white/90"
        >
          <a
            href={VERCEL_DEPLOY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 76 65" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
            <span className="text-sm font-medium">Deploy Your Own</span>
          </a>
        </Button>
      </div>
    </div>
  )
}
