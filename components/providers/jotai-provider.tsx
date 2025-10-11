'use client'

import { Provider } from 'jotai'
import { ReactNode } from 'react'

export function JotaiProvider({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>
}
