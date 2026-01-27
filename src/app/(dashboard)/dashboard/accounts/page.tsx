'use client'

import { useEffect, useState, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { TellerConnectButton } from '@/components/banking/teller-connect'
import { AccountCard } from '@/components/banking/account-card'
import { RefreshCw, DollarSign, CreditCard, TrendingUp, EyeOff, Trash2 } from 'lucide-react'
import { usePrivacyStore, mockFinancialData } from '@/stores/privacy-store'
import type { Database } from '@/types/database'

type BankAccount = Database['public']['Tables']['bank_accounts']['Row']

interface AccountsResponse {
  accounts: BankAccount[]
  totals: {
    cash: number
    credit: number
    net: number
  }
}

// Mock accounts data with full bank account structure
const mockAccountsData: AccountsResponse = {
  accounts: mockFinancialData.accounts.map(acc => ({
    id: acc.id,
    user_id: 'mock-user',
    teller_account_id: `teller-${acc.id}`,
    teller_enrollment_id: 'mock-enrollment',
    teller_access_token: null,
    institution_id: 'mock-inst',
    institution_name: acc.institution_name,
    institution_logo_url: null,
    account_name: acc.account_name,
    account_type: acc.account_type,
    account_subtype: acc.account_type === 'credit' ? 'credit_card' : acc.account_type,
    account_number_last4: acc.account_number_last4,
    current_balance: acc.current_balance,
    available_balance: acc.available_balance,
    balance_updated_at: acc.last_sync_at,
    currency: 'USD',
    sync_status: acc.sync_status,
    sync_error: null,
    last_sync_at: acc.last_sync_at,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  })) as BankAccount[],
  totals: {
    cash: 127734.67,
    credit: -1887.35,
    net: 125847.32,
  },
}

export default function AccountsPage() {
  const [data, setData] = useState<AccountsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)

  // Privacy mode
  const privacyMode = usePrivacyStore((state) => state.privacyMode)
  const privacyHydrated = usePrivacyStore((state) => state._hasHydrated)

  const fetchAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/banking/accounts')
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const handleSyncAll = async () => {
    setIsSyncing(true)
    try {
      await fetch('/api/banking/sync', { method: 'POST' })
      await fetchAccounts()
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleCleanupAll = async () => {
    if (!confirm('This will DELETE all your bank accounts and transactions. You will need to reconnect your bank. Continue?')) {
      return
    }
    setIsCleaning(true)
    try {
      const response = await fetch('/api/banking/cleanup', { method: 'DELETE' })
      const result = await response.json()
      if (response.ok) {
        alert(`Cleanup complete. Deleted ${result.deleted.accounts} accounts and ${result.deleted.transactions} transactions. Please reconnect your bank.`)
        await fetchAccounts()
      } else {
        alert('Cleanup failed: ' + result.error)
      }
    } catch (error) {
      console.error('Cleanup error:', error)
      alert('Cleanup failed')
    } finally {
      setIsCleaning(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    )
  }

  // Use mock data in privacy mode
  const isPrivacyMode = privacyHydrated && privacyMode
  const displayData = isPrivacyMode ? mockAccountsData : data
  const accounts = displayData?.accounts || []
  const totals = displayData?.totals || { cash: 0, credit: 0, net: 0 }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Accounts</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {isPrivacyMode ? 'Demo mode active' : 'Manage your connected bank accounts'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Privacy mode indicator */}
          {isPrivacyMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
              <EyeOff className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-xs font-medium text-violet-600">Demo Mode</span>
            </div>
          )}
          {/* Hide sync/connect buttons in privacy mode */}
          {!isPrivacyMode && accounts.length > 0 && (
            <>
              <button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="h-9 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-600 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync All
              </button>
              <button
                onClick={handleCleanupAll}
                disabled={isCleaning}
                className="h-9 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-sm font-medium text-rose-600 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Trash2 className={`h-4 w-4 ${isCleaning ? 'animate-pulse' : ''}`} />
                Clear All
              </button>
            </>
          )}
          {!isPrivacyMode && <TellerConnectButton onSuccess={fetchAccounts} />}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-500">Cash</p>
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 flex items-center justify-center border border-emerald-100">
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-emerald-600">
            {formatCurrency(totals.cash)}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Checking and savings accounts
          </p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-500">Credit</p>
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/50 flex items-center justify-center border border-violet-100">
              <CreditCard className="h-4 w-4 text-violet-600" />
            </div>
          </div>
          <div className={`text-2xl font-semibold ${totals.credit < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {formatCurrency(totals.credit)}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Credit card balances
          </p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-500">Net Worth</p>
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center border ${totals.net >= 0 ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-100' : 'bg-gradient-to-br from-rose-50 to-rose-100/50 border-rose-100'}`}>
              <TrendingUp className={`h-4 w-4 ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
            </div>
          </div>
          <div className={`text-2xl font-semibold ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formatCurrency(totals.net)}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cash minus credit balances
          </p>
        </div>
      </div>

      {/* Account List */}
      {accounts.length === 0 && !isPrivacyMode ? (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 flex items-center justify-center mb-4 border border-slate-100">
            <DollarSign className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No accounts connected</h3>
          <p className="text-sm text-slate-400 mb-4 max-w-sm">
            Connect your bank accounts to start tracking your finances
          </p>
          <TellerConnectButton onSuccess={fetchAccounts} />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onSync={fetchAccounts}
              onDisconnect={fetchAccounts}
            />
          ))}
        </div>
      )}
    </div>
  )
}
