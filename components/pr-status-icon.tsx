import { GitPullRequest } from 'lucide-react'

interface PRStatusIconProps {
  status: 'open' | 'closed' | 'merged'
  className?: string
}

export function PRStatusIcon({ status, className = 'h-3 w-3' }: PRStatusIconProps) {
  if (status === 'merged') {
    return (
      <svg className={`${className} flex-shrink-0 text-purple-500`} viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 3.254V3.25v.005a.75.75 0 110-.005v.004zm.45 1.9a2.25 2.25 0 10-1.95.218v5.256a2.25 2.25 0 101.5 0V7.123A5.735 5.735 0 009.25 9h1.378a2.251 2.251 0 100-1.5H9.25a4.25 4.25 0 01-3.8-2.346zM12.75 9a.75.75 0 100-1.5.75.75 0 000 1.5zm-8.5 4.5a.75.75 0 100-1.5.75.75 0 000 1.5z" />
      </svg>
    )
  }

  if (status === 'closed') {
    return <GitPullRequest className={`${className} flex-shrink-0 text-red-500`} />
  }

  // open
  return (
    <svg className={`${className} flex-shrink-0 text-green-500`} viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 3.25a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zm5.677-.177L9.573.677A.25.25 0 0110 .854V2.5h1A2.5 2.5 0 0113.5 5v5.628a2.251 2.251 0 11-1.5 0V5a1 1 0 00-1-1h-1v1.646a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm0 9.5a.75.75 0 100 1.5.75.75 0 000-1.5zm8.25.75a.75.75 0 101.5 0 .75.75 0 00-1.5 0z" />
    </svg>
  )
}
