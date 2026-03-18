import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-4xl font-bold">
          H
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight">Project Helios</h1>
        <p className="mb-8 text-lg text-muted-foreground">
          Your personal AI financial assistant. Track finances, search documents,
          manage clients, and get daily briefings.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link href="/auth/login">Sign in</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/auth/signup">Create account</Link>
          </Button>
        </div>
      </div>

      <footer className="absolute bottom-8 text-sm text-muted-foreground">
        Built for Noctworks
      </footer>
    </div>
  )
}
