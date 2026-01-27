'use client'

import { useEffect, useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'

declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: TellerConnectConfig) => TellerConnectInstance
    }
  }
}

interface TellerConnectConfig {
  applicationId: string
  environment: 'sandbox' | 'development' | 'production'
  onSuccess: (enrollment: TellerEnrollment) => void
  onExit?: () => void
  onFailure?: (error: { message: string }) => void
}

interface TellerConnectInstance {
  open: () => void
}

interface TellerEnrollment {
  accessToken: string
  enrollment: {
    id: string
    institution: {
      name: string
    }
  }
}

interface TellerConnectButtonProps {
  onSuccess?: () => void
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

export function TellerConnectButton({
  onSuccess,
  variant = 'default',
  size = 'default',
  className,
}: TellerConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)

  // Load Teller Connect script
  useEffect(() => {
    if (document.getElementById('teller-connect-script')) {
      setIsScriptLoaded(true)
      return
    }

    const script = document.createElement('script')
    script.id = 'teller-connect-script'
    script.src = 'https://cdn.teller.io/connect/connect.js'
    script.async = true
    script.onload = () => setIsScriptLoaded(true)
    document.body.appendChild(script)

    return () => {
      // Don't remove script on unmount, it can be reused
    }
  }, [])

  const handleConnect = useCallback(async () => {
    if (!window.TellerConnect) {
      console.error('Teller Connect not loaded')
      return
    }

    const applicationId = process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID
    if (!applicationId) {
      console.error('Teller Application ID not configured')
      return
    }

    const tellerConnect = window.TellerConnect.setup({
      applicationId,
      environment: (process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
      onSuccess: async (enrollment: TellerEnrollment) => {
        setIsLoading(true)
        try {
          const response = await fetch('/api/banking/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: enrollment.accessToken,
              enrollment: enrollment.enrollment,
            }),
          })

          if (!response.ok) {
            throw new Error('Failed to save bank connection')
          }

          // Trigger initial sync
          await fetch('/api/banking/sync', { method: 'POST' })

          onSuccess?.()
        } catch (error) {
          console.error('Connection error:', error)
        } finally {
          setIsLoading(false)
        }
      },
      onExit: () => {
        // User closed without completing
      },
      onFailure: (error) => {
        console.error('Teller Connect error:', error)
      },
    })

    tellerConnect.open()
  }, [onSuccess])

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleConnect}
      disabled={!isScriptLoaded || isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Plus className="mr-2 h-4 w-4" />
          Connect Bank
        </>
      )}
    </Button>
  )
}
