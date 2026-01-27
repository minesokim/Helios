'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VoicePoweredOrb } from '@/components/ui/voice-powered-orb'

// Modern, detailed icons as SVG components
const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6a1 1 0 00-1-1h-4a1 1 0 00-1 1v6H4a1 1 0 01-1-1V9.5z" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 21v-6a1 1 0 011-1h4a1 1 0 011 1v6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const FinanceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const BridgeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
    <rect x="3" y="3" width="7" height="7" rx="1" strokeLinecap="round"/>
    <rect x="14" y="3" width="7" height="7" rx="1" strokeLinecap="round"/>
    <rect x="3" y="14" width="7" height="7" rx="1" strokeLinecap="round"/>
    <rect x="14" y="14" width="7" height="7" rx="1" strokeLinecap="round"/>
  </svg>
)

const ClientsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
    <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round"/>
    <path d="M9 10h6M9 14h4" strokeLinecap="round"/>
    <circle cx="6" cy="10" r="1" fill="currentColor" stroke="none"/>
    <circle cx="6" cy="14" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

const DriveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
    <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 18V8" strokeLinecap="round"/>
  </svg>
)

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5">
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const leftNavItems = [
  { name: 'Home', href: '/dashboard', icon: HomeIcon },
  { name: 'Clients', href: '/dashboard/workstreams', icon: ClientsIcon },
  { name: 'Finance', href: '/dashboard/finance', icon: FinanceIcon },
]

const rightNavItems = [
  { name: 'Bridge', href: '/dashboard/bridge', icon: BridgeIcon },
  { name: 'Chat', href: '/dashboard/chat', icon: ChatIcon },
  { name: 'Drive', href: '/dashboard/drive', icon: DriveIcon },
]

interface DockNavProps {
  onOrbClick?: () => void
}

export function DockNav({ onOrbClick }: DockNavProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav className="dock-nav">
      {/* Left items */}
      {leftNavItems.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className={`dock-item-wrapper ${isActive(item.href) ? 'active' : ''}`}
        >
          <div className={isActive(item.href) ? 'dock-item-active' : 'dock-item'}>
            <item.icon />
          </div>
          <span className="dock-label">{item.name}</span>
        </Link>
      ))}

      {/* Center AI Orb - Opens quick chat popover */}
      <button
        className="dock-orb-wrapper -mt-4"
        onClick={onOrbClick}
        title="Quick chat with Jorkel"
      >
        <div className="w-16 h-16 rounded-full overflow-hidden shadow-lg shadow-cyan-500/30">
          <VoicePoweredOrb
            enableVoiceControl={false}
            voiceSensitivity={2.0}
            maxRotationSpeed={1.5}
            maxHoverIntensity={0.9}
            className="w-full h-full"
          />
        </div>
      </button>

      {/* Right items */}
      {rightNavItems.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          className={`dock-item-wrapper ${isActive(item.href) ? 'active' : ''}`}
        >
          <div className={isActive(item.href) ? 'dock-item-active' : 'dock-item'}>
            <item.icon />
          </div>
          <span className="dock-label">{item.name}</span>
        </Link>
      ))}
    </nav>
  )
}
