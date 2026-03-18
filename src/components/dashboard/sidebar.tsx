'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CreditCard,
  FileText,
  Users,
  Mic,
  Receipt,
  Calendar,
  Settings,
  RefreshCw,
  HardDrive,
} from 'lucide-react'

const navigation = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Accounts', href: '/dashboard/accounts', icon: CreditCard },
  { name: 'Transactions', href: '/dashboard/transactions', icon: Receipt },
  { name: 'Subscriptions', href: '/dashboard/subscriptions', icon: RefreshCw },
  { name: 'Drive', href: '/dashboard/drive', icon: HardDrive },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'Clients', href: '/dashboard/clients', icon: Users },
  { name: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
  { name: 'Voice', href: '/dashboard/voice', icon: Mic },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="hidden w-64 flex-shrink-0 glass-sidebar md:block">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-semibold text-lg shadow-lg shadow-indigo-500/20">
              H
            </div>
            <span className="text-xl font-semibold tracking-tight bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Helios</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.name}
                href={item.href}
                className={isActive ? 'nav-item-active' : 'nav-item'}
              >
                <item.icon className={`h-5 w-5 ${isActive ? 'text-primary' : ''}`} />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4">
          <div className="rounded-2xl px-4 py-3 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 border border-white/60">
            <p className="text-sm font-medium text-slate-700">Project Helios</p>
            <p className="text-xs text-slate-500 mt-0.5">Personal Finance Assistant</p>
          </div>
        </div>
      </div>
    </div>
  )
}
