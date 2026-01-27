'use client'

import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, ExternalLink, Search, ChevronDown, Filter } from 'lucide-react'

interface EmailSummary {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
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

export default function GmailPage() {
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [unreadCounts, setUnreadCounts] = useState<AccountUnread[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  const fetchEmails = useCallback(async () => {
    try {
      const response = await fetch('/api/gmail/check')
      if (!response.ok) {
        throw new Error('Failed to fetch emails')
      }
      const data = await response.json()

      setEmails(data.emails || [])
      setUnreadCounts(data.unreadByAccount || [])
      setTotalUnread(data.totalUnread || 0)
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
  }, [fetchEmails])

  // Filter emails
  const filteredEmails = emails.filter(email => {
    // Account filter
    if (selectedAccount && email.accountId !== selectedAccount) return false

    // Unread filter
    if (showUnreadOnly && !email.isUnread) return false

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        email.subject.toLowerCase().includes(query) ||
        email.from.toLowerCase().includes(query) ||
        email.snippet.toLowerCase().includes(query)
      )
    }

    return true
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(hours / 24)

    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'Yesterday'
    if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' })
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatSender = (from: string) => {
    const match = from.match(/^([^<]+)/)
    return match ? match[1].trim() : from
  }

  const extractEmail = (from: string) => {
    const match = from.match(/<([^>]+)>/)
    return match ? match[1] : from
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-slate-800">Gmail</h1>
          <p className="text-slate-400 text-sm mt-1">Loading your emails...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 text-slate-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-medium text-slate-800">Gmail</h1>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-slate-800">Gmail</h1>
            <p className="text-slate-400 text-sm mt-1">
              {totalUnread} unread across {unreadCounts.length} account{unreadCounts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={fetchEmails}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Account Stats */}
      {unreadCounts.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {unreadCounts.map(account => (
            <button
              key={account.accountId}
              onClick={() => setSelectedAccount(
                selectedAccount === account.accountId ? null : account.accountId
              )}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                selectedAccount === account.accountId
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <span className="text-sm font-medium">{account.accountLabel}</span>
              <span className="text-xs text-slate-400">{account.googleEmail}</span>
              {account.count > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  selectedAccount === account.accountId
                    ? 'bg-blue-200 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {account.count}
                </span>
              )}
            </button>
          ))}
          {selectedAccount && (
            <button
              onClick={() => setSelectedAccount(null)}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
            showUnreadOnly
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          <Filter className="h-4 w-4" />
          <span className="text-sm">Unread only</span>
        </button>
      </div>

      {/* Email List */}
      <div className="glass-card divide-y divide-slate-100">
        {filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Mail className="h-8 w-8 text-slate-300 mb-3" />
            <p className="text-slate-500">No emails found</p>
          </div>
        ) : (
          filteredEmails.map(email => (
            <a
              key={email.id}
              href={`https://mail.google.com/mail/u/0/#inbox/${email.threadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`block p-4 hover:bg-slate-50 transition-colors group ${
                email.isUnread ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Unread indicator */}
                <div className="pt-1.5">
                  {email.isUnread ? (
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-transparent" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm truncate ${email.isUnread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                        {formatSender(email.from)}
                      </span>
                      {unreadCounts.length > 1 && (
                        <span className="text-xs text-slate-400 shrink-0">[{email.accountLabel}]</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400">{formatDate(email.date)}</span>
                      <ExternalLink className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <p className={`text-sm truncate ${email.isUnread ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                    {email.subject}
                  </p>
                  <p className="text-sm text-slate-400 truncate mt-1">{email.snippet}</p>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  )
}
