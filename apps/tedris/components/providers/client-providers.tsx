'use client'

import { SessionProvider } from 'next-auth/react'
import { Toaster } from '@medaris/ui/components/sonner'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  )
}
