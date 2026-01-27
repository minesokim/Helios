'use client'

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, RefreshCw, Trash2, CreditCard, Landmark, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Database } from '@/types/database'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']

interface AccountCardProps {
  account: BankAccount
  onSync?: () => void
  onDisconnect?: () => void
}

export function AccountCard({ account, onSync, onDisconnect }: AccountCardProps) {
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await fetch('/api/banking/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      onSync?.()
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect this account? Transaction history will be preserved.')) {
      return
    }

    setIsDisconnecting(true)
    try {
      await fetch(`/api/banking/accounts?id=${account.id}`, {
        method: 'DELETE',
      })
      onDisconnect?.()
    } catch (error) {
      console.error('Disconnect error:', error)
    } finally {
      setIsDisconnecting(false)
    }
  }

  const formatCurrencyParts = (amount: number | null) => {
    if (amount === null) return { dollars: 'N/A', cents: '' }
    const abs = Math.abs(amount)
    const dollars = Math.floor(abs).toLocaleString('en-US')
    const cents = (abs % 1).toFixed(2).substring(2)
    const sign = amount < 0 ? '-' : ''
    return { sign, dollars, cents }
  }

  const Icon = account.account_type === 'credit' ? CreditCard : Landmark
  const isNegative = (account.current_balance ?? 0) < 0
  const balanceParts = formatCurrencyParts(account.current_balance)
  const hasError = account.sync_status === 'error'

  return (
    <div className={`glass-card p-5 transition-all ${hasError ? 'ring-1 ring-rose-200' : ''}`}>
      {/* Header Row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center border ${
            account.account_type === 'credit'
              ? 'bg-gradient-to-br from-violet-50 to-violet-100/50 border-violet-100'
              : 'bg-gradient-to-br from-slate-50 to-slate-100/50 border-slate-100'
          }`}>
            <Icon className={`h-5 w-5 ${
              account.account_type === 'credit' ? 'text-violet-600' : 'text-slate-600'
            }`} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">
              {account.account_name}
            </p>
            <p className="text-xs text-slate-400">
              {account.institution_name}
              {account.account_number_last4 && ` ••••${account.account_number_last4}`}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
              <MoreVertical className="h-4 w-4 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="rounded-xl p-1.5 min-w-[160px] bg-white border border-slate-100 shadow-xl shadow-slate-200/50"
          >
            <DropdownMenuItem
              onClick={handleSync}
              disabled={isSyncing}
              className="rounded-lg px-3 py-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 focus:bg-slate-50"
            >
              <RefreshCw className={`mr-2.5 h-4 w-4 text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="rounded-lg px-3 py-2 text-sm text-rose-600 cursor-pointer hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-600"
            >
              <Trash2 className="mr-2.5 h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Balance Display */}
      <div className="mb-4">
        <p className={`text-2xl font-semibold tracking-tight ${isNegative ? 'text-rose-600' : 'text-slate-800'}`}>
          {balanceParts.sign}${balanceParts.dollars}
          {balanceParts.cents && (
            <span className="text-base text-slate-400 font-normal">.{balanceParts.cents}</span>
          )}
        </p>
        {account.available_balance !== null &&
          account.available_balance !== account.current_balance && (
            <p className="text-xs text-slate-400 mt-1">
              ${Math.abs(account.available_balance).toLocaleString('en-US', { minimumFractionDigits: 2 })} available
            </p>
          )}
      </div>

      {/* Status Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {account.sync_status === 'success' && (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">Synced</span>
            </>
          )}
          {account.sync_status === 'error' && (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-xs text-rose-600 font-medium">Sync failed</span>
            </>
          )}
          {account.sync_status === 'syncing' && (
            <>
              <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
              <span className="text-xs text-blue-600 font-medium">Syncing...</span>
            </>
          )}
          {(!account.sync_status || account.sync_status === 'pending') && (
            <>
              <div className="h-3.5 w-3.5 rounded-full bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">Pending</span>
            </>
          )}
        </div>

        {account.last_sync_at && (
          <p className="text-xs text-slate-400">
            {formatDistanceToNow(new Date(account.last_sync_at), { addSuffix: true })}
          </p>
        )}
      </div>

      {/* Error Message */}
      {account.sync_error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-100">
          <p className="text-xs text-rose-600">{account.sync_error}</p>
        </div>
      )}
    </div>
  )
}
