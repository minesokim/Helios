'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, ExternalLink, ChevronDown } from 'lucide-react'

interface EmailSummary {
  id: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
  isUnread: boolean
  accountId: string
  accountLabel: string
  googleEmail: string
}

interface AccountUnread {
  accountId: string
  accountLabel: string
  googleEmail: string
  count: number
}

interface GmailWidgetProps {
  className?: string
  compact?: boolean
}

const POLL_INTERVAL = 30000 // 30 seconds

export function GmailWidget({ className = '', compact = false }: GmailWidgetProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [unreadCounts, setUnreadCounts] = useState<AccountUnread[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  const fetchEmails = useCallback(async () => {
    try {
      const response = await fetch('/api/gmail/check')
      const data = await response.json()

      // API now returns data even on partial failures
      setEmails(data.emails || [])
      setUnreadCounts(data.unreadByAccount || [])
      setTotalUnread(data.totalUnread || 0)

      // Show error if there was one but still show whatever data we got
      if (data.error) {
        console.warn('Gmail API warning:', data.error)
      }
      setError(null)
    } catch (e) {
      console.error('Gmail fetch error:', e)
      setError('Unable to load emails')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmails()

    // Set up polling
    const interval = setInterval(fetchEmails, POLL_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchEmails])

  // Filter emails by selected account
  const filteredEmails = selectedAccount
    ? emails.filter(e => e.accountId === selectedAccount)
    : emails

  const displayEmails = compact ? filteredEmails.slice(0, 3) : filteredEmails.slice(0, 8)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (hours < 48) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatSender = (from: string) => {
    // Extract name from "Name <email>" format
    const match = from.match(/^([^<]+)/)
    return match ? match[1].trim() : from
  }

  if (loading) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-white/40" />
          <span className="text-xs uppercase tracking-wider text-white/50">Gmail</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <RefreshCw className="h-4 w-4 text-white/30 animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-white/40" />
          <span className="text-xs uppercase tracking-wider text-white/50">Gmail</span>
        </div>
        <p className="text-xs text-white/30 text-center py-4">{error}</p>
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-wider text-white/50">Gmail</span>
          {totalUnread > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-cyan-500/20 text-cyan-400 rounded-full">
              {totalUnread}
            </span>
          )}
        </div>

        {/* Account Selector */}
        {unreadCounts.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
            >
              {selectedAccount
                ? unreadCounts.find(a => a.accountId === selectedAccount)?.accountLabel || 'Account'
                : 'All'}
              <ChevronDown className="h-3 w-3" />
            </button>

            {showAccountDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-white/10 rounded-lg shadow-lg z-10 min-w-[140px]">
                <button
                  onClick={() => {
                    setSelectedAccount(null)
                    setShowAccountDropdown(false)
                  }}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${!selectedAccount ? 'text-cyan-400' : 'text-white/60'}`}
                >
                  All Accounts
                </button>
                {unreadCounts.map(account => (
                  <button
                    key={account.accountId}
                    onClick={() => {
                      setSelectedAccount(account.accountId)
                      setShowAccountDropdown(false)
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-white/5 ${selectedAccount === account.accountId ? 'text-cyan-400' : 'text-white/60'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{account.accountLabel}</span>
                      {account.count > 0 && (
                        <span className="text-[10px] text-cyan-400">{account.count}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unread badges per account (compact view) */}
      {!compact && unreadCounts.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {unreadCounts.map(account => (
            <div
              key={account.accountId}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 text-[10px]"
            >
              <span className="text-white/40">{account.accountLabel}</span>
              {account.count > 0 && (
                <span className="text-cyan-400 font-medium">{account.count}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Email List */}
      {displayEmails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <Mail className="h-5 w-5 text-white/20 mb-2" />
          <p className="text-xs text-white/40">No emails</p>
        </div>
      ) : (
        <div className="space-y-1">
          {displayEmails.map(email => (
            <a
              key={email.id}
              href={`https://mail.google.com/mail/u/0/#inbox/${email.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-2 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    {email.isUnread && (
                      <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                    )}
                    <p className={`text-xs truncate ${email.isUnread ? 'text-white font-medium' : 'text-white/70'}`}>
                      {formatSender(email.from)}
                    </p>
                    {unreadCounts.length > 1 && (
                      <span className="text-[9px] text-white/30 shrink-0">[{email.accountLabel}]</span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${email.isUnread ? 'text-white/80' : 'text-white/50'}`}>
                    {email.subject}
                  </p>
                  {!compact && (
                    <p className="text-[10px] text-white/30 truncate mt-0.5">{email.snippet}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-white/30">{formatDate(email.date)}</span>
                  <ExternalLink className="h-3 w-3 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* View all link */}
      {!compact && emails.length > 8 && (
        <a
          href="/dashboard/gmail"
          className="block text-center text-xs text-cyan-400 hover:text-cyan-300 mt-3 transition-colors"
        >
          View all emails
        </a>
      )}
    </div>
  )
}
