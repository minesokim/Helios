'use client'

import { useState, useEffect } from 'react'
import { Mail, RefreshCw, Plus, Trash2, Edit2, Check, X, AlertCircle } from 'lucide-react'

interface GoogleAccount {
  id: string
  google_email: string
  account_label: string
  is_active: boolean
  last_sync_at: string | null
  sync_error: string | null
  created_at: string
}

export function GoogleAccountsSection() {
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  async function fetchAccounts() {
    try {
      const response = await fetch('/api/google/accounts')
      if (!response.ok) throw new Error('Failed to fetch accounts')
      const data = await response.json()
      setAccounts(data.accounts || [])
      setError(null)
    } catch (e) {
      console.error('Error fetching accounts:', e)
      setError('Unable to load accounts')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const response = await fetch('/api/google/connect')
      if (!response.ok) throw new Error('Failed to start connection')
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (e) {
      console.error('Connect error:', e)
      setError('Failed to start Google connection')
    } finally {
      setConnecting(false)
    }
  }

  async function handleReconnect(accountId: string) {
    setConnecting(true)
    try {
      const response = await fetch(`/api/google/connect?intent=reconnect&accountId=${accountId}`)
      if (!response.ok) throw new Error('Failed to start reconnection')
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (e) {
      console.error('Reconnect error:', e)
      setError('Failed to start reconnection')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm('Are you sure you want to disconnect this Google account?')) {
      return
    }

    setDisconnecting(accountId)
    try {
      const response = await fetch(`/api/google/accounts?accountId=${accountId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to disconnect')
      setAccounts(accounts.filter(a => a.id !== accountId))
    } catch (e) {
      console.error('Disconnect error:', e)
      setError('Failed to disconnect account')
    } finally {
      setDisconnecting(null)
    }
  }

  async function handleUpdateLabel(accountId: string) {
    if (!editLabel.trim()) {
      setEditingId(null)
      return
    }

    try {
      const response = await fetch('/api/google/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, label: editLabel.trim() }),
      })
      if (!response.ok) throw new Error('Failed to update label')

      setAccounts(accounts.map(a =>
        a.id === accountId ? { ...a, account_label: editLabel.trim() } : a
      ))
      setEditingId(null)
    } catch (e) {
      console.error('Update label error:', e)
      setError('Failed to update label')
    }
  }

  function startEditing(account: GoogleAccount) {
    setEditingId(account.id)
    setEditLabel(account.account_label)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditLabel('')
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 flex items-center justify-center border border-red-100">
            <Mail className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h2 className="font-medium text-slate-800">Connected Google Accounts</h2>
            <p className="text-sm text-slate-400">Loading accounts...</p>
          </div>
        </div>
        <div className="flex justify-center py-4">
          <RefreshCw className="h-5 w-5 text-slate-400 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-50 to-red-100/50 flex items-center justify-center border border-red-100">
            <Mail className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h2 className="font-medium text-slate-800">Connected Google Accounts</h2>
            <p className="text-sm text-slate-400">
              {accounts.length === 0
                ? 'Connect your Google account for Gmail, Photos, and Drive'
                : `${accounts.length} account${accounts.length === 1 ? '' : 's'} connected`}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Account List */}
      <div className="space-y-3 mb-4">
        {accounts.map(account => (
          <div
            key={account.id}
            className={`p-4 rounded-xl border ${
              account.sync_error
                ? 'bg-amber-50/50 border-amber-200'
                : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${
                  account.sync_error ? 'bg-amber-400' : account.is_active ? 'bg-green-400' : 'bg-slate-300'
                }`} />
                <div>
                  <div className="flex items-center gap-2">
                    {editingId === account.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={e => setEditLabel(e.target.value)}
                          className="px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleUpdateLabel(account.id)
                            if (e.key === 'Escape') cancelEditing()
                          }}
                        />
                        <button
                          onClick={() => handleUpdateLabel(account.id)}
                          className="p-1 text-green-500 hover:bg-green-50 rounded"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-medium text-slate-700">{account.account_label}</span>
                        <button
                          onClick={() => startEditing(account)}
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{account.google_email}</p>
                  {account.sync_error && (
                    <p className="text-xs text-amber-600 mt-1">{account.sync_error}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    Last sync: {formatDate(account.last_sync_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReconnect(account.id)}
                  disabled={connecting}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    account.sync_error
                      ? 'text-amber-600 bg-amber-100 hover:bg-amber-200'
                      : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                  }`}
                  title="Reconnect to refresh permissions"
                >
                  {account.sync_error ? 'Reconnect' : 'Refresh'}
                </button>
                <button
                  onClick={() => handleDisconnect(account.id)}
                  disabled={disconnecting === account.id}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Disconnect account"
                >
                  {disconnecting === account.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Account Button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
      >
        {connecting ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            <span>Add Google Account</span>
          </>
        )}
      </button>

      <p className="text-xs text-slate-400 text-center mt-3">
        Connect multiple accounts for Gmail, Google Photos, and Drive access
      </p>
    </div>
  )
}
