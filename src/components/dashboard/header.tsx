'use client'

import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bell, Search, Command } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

interface HeaderProps {
  user: User
}

export function Header({ user }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = user.user_metadata?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || user.email?.[0].toUpperCase() || 'U'

  return (
    <header className="flex h-16 items-center justify-between glass-header px-6">
      {/* Left - can add breadcrumbs later */}
      <div className="w-48" />

      {/* Center - Liquid Glass Search */}
      <div className="flex-1 max-w-xl hidden sm:block">
        <button className="w-full glass-input flex items-center gap-3 px-5 py-3 text-left group">
          <Search className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:text-indigo-500 transition-colors" />
          <span className="flex-1 text-sm text-slate-400 dark:text-slate-500 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors truncate">Search or jump to...</span>
          <kbd className="hidden md:inline-flex items-center gap-1 rounded-lg bg-white/70 dark:bg-white/10 px-2.5 py-1 text-xs text-slate-400 dark:text-slate-500 border border-white/50 dark:border-white/10 shadow-sm shrink-0">
            <Command className="h-3 w-3" />
            <span>K</span>
          </kbd>
        </button>
      </div>

      {/* Mobile Search Icon */}
      <div className="sm:hidden">
        <button className="h-10 w-10 rounded-xl glass-button flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200">
          <Search className="h-5 w-5" />
        </button>
      </div>

      {/* Right - Actions */}
      <div className="flex items-center justify-end gap-2 w-48">
        <ThemeToggle />
        <button className="h-10 w-10 rounded-xl glass-button flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200">
          <Bell className="h-5 w-5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-10 w-10 rounded-xl glass-button p-0.5 flex items-center justify-center">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.user_metadata?.avatar_url} alt={user.email || ''} />
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-medium text-sm shadow-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 rounded-2xl p-2 glass-card border-white/60" align="end" forceMount>
            <DropdownMenuLabel className="font-normal px-3 py-2">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium text-slate-800">
                  {user.user_metadata?.full_name || 'User'}
                </p>
                <p className="text-xs text-slate-500">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-2 bg-slate-100" />
            <DropdownMenuItem
              onClick={() => router.push('/dashboard/settings')}
              className="rounded-xl cursor-pointer px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-indigo-50/50"
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-2 bg-slate-100" />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="rounded-xl cursor-pointer px-3 py-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50/50"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
