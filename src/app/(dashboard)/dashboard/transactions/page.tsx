'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Search,
  Filter,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  CreditCard,
  Calendar,
  DollarSign,
  Trash2,
  Star,
  AlertCircle,
  EyeOff,
} from 'lucide-react'
import { format } from 'date-fns'
import { usePrivacyStore, mockFinancialData } from '@/stores/privacy-store'
import type { Database } from '@/types/database'

type Transaction = Database['public']['Tables']['transactions']['Row'] & {
  bank_account: { id: string; account_name: string; institution_name: string } | null
  category: { id: string; name: string; slug: string; icon: string | null; color: string | null } | null
}

type Category = Database['public']['Tables']['transaction_categories']['Row']

interface TransactionsResponse {
  transactions: Transaction[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface Subscription {
  id: string
  merchant_name: string
  amount: number
  frequency: string
  status: string
  next_expected_at: string | null
  is_essential: boolean
  category: {
    id: string
    name: string
    color: string | null
  } | null
}

interface SubscriptionSummary {
  total: number
  active: number
  monthlyTotal: number
  yearlyTotal: number
}

// Mock transactions for privacy mode
const mockTransactionsData: TransactionsResponse = {
  transactions: mockFinancialData.recentTransactions.map((tx, i) => ({
    id: tx.id,
    user_id: 'mock-user',
    bank_account_id: 'mock-account',
    teller_transaction_id: `teller-tx-${i}`,
    date: tx.date,
    description: tx.description,
    merchant_name: tx.merchant_name,
    amount: tx.amount,
    currency: 'USD',
    status: 'posted',
    type: tx.amount > 0 ? 'credit' : 'debit',
    category_id: null,
    category_confidence: null,
    category_source: null,
    notes: null,
    is_hidden: false,
    is_recurring: false,
    is_flagged: false,
    is_reviewed: false,
    tags: null,
    raw_data: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    bank_account: { id: 'mock-1', account_name: 'Premium Checking', institution_name: 'First National Bank' },
    category: tx.category ? { id: 'mock-cat', name: tx.category.name, slug: tx.category.name.toLowerCase(), icon: null, color: tx.category.color } : null,
  })) as Transaction[],
  pagination: {
    page: 1,
    limit: 50,
    total: mockFinancialData.recentTransactions.length,
    totalPages: 1,
  },
}

// Mock subscriptions for privacy mode
const mockSubscriptionsData: Subscription[] = [
  { id: 'sub-1', merchant_name: 'Netflix', amount: 15.99, frequency: 'monthly', status: 'active', next_expected_at: new Date(Date.now() + 7 * 86400000).toISOString(), is_essential: true, category: { id: 'cat-1', name: 'Entertainment', color: '#8b5cf6' } },
  { id: 'sub-2', merchant_name: 'Spotify', amount: 10.99, frequency: 'monthly', status: 'active', next_expected_at: new Date(Date.now() + 14 * 86400000).toISOString(), is_essential: true, category: { id: 'cat-1', name: 'Entertainment', color: '#8b5cf6' } },
  { id: 'sub-3', merchant_name: 'Adobe Creative Cloud', amount: 54.99, frequency: 'monthly', status: 'active', next_expected_at: new Date(Date.now() + 21 * 86400000).toISOString(), is_essential: true, category: { id: 'cat-2', name: 'Software', color: '#3b82f6' } },
  { id: 'sub-4', merchant_name: 'Planet Fitness', amount: 24.99, frequency: 'monthly', status: 'active', next_expected_at: new Date(Date.now() + 5 * 86400000).toISOString(), is_essential: false, category: { id: 'cat-3', name: 'Health', color: '#22c55e' } },
]

const mockSubscriptionSummary: SubscriptionSummary = {
  total: 4,
  active: 4,
  monthlyTotal: 106.96,
  yearlyTotal: 1283.52,
}

export default function TransactionsPage() {
  // Privacy mode
  const privacyMode = usePrivacyStore((state) => state.privacyMode)
  const privacyHydrated = usePrivacyStore((state) => state._hasHydrated)
  const isPrivacyMode = privacyHydrated && privacyMode

  // Tab state
  const [activeTab, setActiveTab] = useState<'transactions' | 'subscriptions'>('transactions')

  // Transactions state
  const [data, setData] = useState<TransactionsResponse | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCategorizing, setIsCategorizing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null)
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '50' })
      if (search) params.set('search', search)
      if (selectedCategory) params.set('categoryId', selectedCategory)

      const response = await fetch(`/api/transactions?${params}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [page, search, selectedCategory])

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/categories')
      if (response.ok) {
        const result = await response.json()
        setCategories(result.categories)
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }, [])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const [categorizeResult, setCategorizeResult] = useState<string | null>(null)

  const handleCategorize = async () => {
    setIsCategorizing(true)
    setCategorizeResult(null)
    try {
      // First, check if we have enough categories - if not, seed them
      if (categories.length < 20) {
        setCategorizeResult('Setting up categories...')
        const seedRes = await fetch('/api/categories/seed', { method: 'POST' })
        if (seedRes.ok) {
          await fetchCategories() // Refresh categories
        }
      }

      setCategorizeResult('Categorizing...')
      const response = await fetch('/api/transactions/categorize', { method: 'POST' })
      const result = await response.json()

      if (!response.ok) {
        setCategorizeResult(`Error: ${result.error || 'Failed to categorize'}`)
        return
      }

      if (result.categorized === 0) {
        setCategorizeResult('No uncategorized transactions found')
      } else {
        setCategorizeResult(`Categorized ${result.categorized} transaction${result.categorized !== 1 ? 's' : ''}`)
      }

      await fetchTransactions()
    } catch (error) {
      console.error('Categorization error:', error)
      setCategorizeResult('Error: Failed to connect to server')
    } finally {
      setIsCategorizing(false)
      // Clear message after 5 seconds
      setTimeout(() => setCategorizeResult(null), 5000)
    }
  }

  const handleUpdateCategory = async (transactionId: string, categoryId: string) => {
    try {
      await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transactionId, category_id: categoryId }),
      })
      await fetchTransactions()
    } catch (error) {
      console.error('Update error:', error)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchTransactions()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount))
  }

  // Subscription functions
  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions')
      const data = await res.json()
      setSubscriptions(data.subscriptions || [])
      setSubscriptionSummary(data.summary || null)
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error)
    } finally {
      setSubscriptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscriptions()
  }, [fetchSubscriptions])

  const detectSubscriptions = async () => {
    setDetecting(true)
    try {
      const res = await fetch('/api/subscriptions/detect', { method: 'POST' })
      const data = await res.json()
      if (data.created > 0) {
        await fetchSubscriptions()
      }
    } catch (error) {
      console.error('Detection failed:', error)
    } finally {
      setDetecting(false)
    }
  }

  const toggleEssential = async (id: string, current: boolean) => {
    try {
      await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_essential: !current }),
      })
      setSubscriptions(subs =>
        subs.map(s => (s.id === id ? { ...s, is_essential: !current } : s))
      )
    } catch (error) {
      console.error('Failed to update subscription:', error)
    }
  }

  const cancelSubscription = async (id: string) => {
    try {
      await fetch('/api/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'cancelled' }),
      })
      setSubscriptions(subs =>
        subs.map(s => (s.id === id ? { ...s, status: 'cancelled' } : s))
      )
    } catch (error) {
      console.error('Failed to cancel subscription:', error)
    }
  }

  const deleteSubscription = async (id: string) => {
    if (!confirm('Delete this subscription?')) return
    try {
      await fetch(`/api/subscriptions?id=${id}`, { method: 'DELETE' })
      setSubscriptions(subs => subs.filter(s => s.id !== id))
    } catch (error) {
      console.error('Failed to delete subscription:', error)
    }
  }

  const formatFrequency = (freq: string) => {
    return freq.charAt(0).toUpperCase() + freq.slice(1)
  }

  const formatSubDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-[600px]" />
      </div>
    )
  }

  // Use mock data in privacy mode
  const displayData = isPrivacyMode ? mockTransactionsData : data
  const displaySubscriptions = isPrivacyMode ? mockSubscriptionsData : subscriptions
  const displaySubscriptionSummary = isPrivacyMode ? mockSubscriptionSummary : subscriptionSummary

  const transactions = displayData?.transactions || []
  const pagination = displayData?.pagination || { page: 1, totalPages: 1, total: 0 }
  const uncategorizedCount = transactions.filter((t) => !t.category_id).length

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Activity</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {isPrivacyMode
              ? 'Demo mode active'
              : activeTab === 'transactions'
                ? `${pagination.total} transactions${uncategorizedCount > 0 ? ` (${uncategorizedCount} uncategorized)` : ''}`
                : `${displaySubscriptionSummary?.total || 0} subscriptions (${displaySubscriptionSummary?.active || 0} active)`}
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
          {!isPrivacyMode && activeTab === 'transactions' ? (
            <>
              {categorizeResult && (
                <span className={`text-sm ${categorizeResult.startsWith('Error') ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {categorizeResult}
                </span>
              )}
              <Button
                onClick={handleCategorize}
                disabled={isCategorizing}
                className="h-9 px-4 bg-primary hover:bg-primary/90 rounded-xl"
              >
                <Sparkles className={`mr-2 h-4 w-4 ${isCategorizing ? 'animate-pulse' : ''}`} />
                {isCategorizing ? 'Categorizing...' : 'Auto-Categorize'}
              </Button>
            </>
          ) : !isPrivacyMode && activeTab === 'subscriptions' ? (
            <Button
              onClick={detectSubscriptions}
              disabled={detecting}
              className="h-9 px-4 bg-primary hover:bg-primary/90 rounded-xl"
            >
              <Sparkles className={`mr-2 h-4 w-4 ${detecting ? 'animate-pulse' : ''}`} />
              {detecting ? 'Detecting...' : 'Detect Subscriptions'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'transactions'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Transactions
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'subscriptions'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Subscriptions
        </button>
      </div>

      {activeTab === 'subscriptions' ? (
        <SubscriptionsContent
          subscriptions={displaySubscriptions}
          summary={displaySubscriptionSummary}
          loading={subscriptionsLoading && !isPrivacyMode}
          formatCurrency={formatCurrency}
          formatFrequency={formatFrequency}
          formatSubDate={formatSubDate}
          toggleEssential={toggleEssential}
          cancelSubscription={cancelSubscription}
          deleteSubscription={deleteSubscription}
        />
      ) : (
        <>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-all dark:text-slate-200"
            />
          </div>
          <Button type="submit" variant="secondary" className="h-10 px-4 rounded-xl shrink-0">
            Search
          </Button>
        </form>

        {/* Category Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-10 px-4 rounded-xl glass-button text-sm font-medium flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 shrink-0">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="truncate max-w-[120px] sm:max-w-none">
                {selectedCategory
                  ? selectedCategory === 'uncategorized'
                    ? 'Uncategorized'
                    : categories.find(c => c.id === selectedCategory)?.name || 'Category'
                  : 'All Categories'}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56 max-h-80 overflow-hidden rounded-2xl p-0 glass-card border-white/60"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-slate-100/50 bg-white/50 sticky top-0 z-10 backdrop-blur-sm">
              <p className="text-xs font-medium text-slate-400">Filter by category</p>
            </div>
            {/* Scrollable list */}
            <div className="overflow-y-auto max-h-64 py-1 px-1">
              <DropdownMenuItem
                onClick={() => { setSelectedCategory(''); setPage(1); }}
                className="rounded-xl px-3 py-2.5 cursor-pointer hover:bg-indigo-50/50 focus:bg-indigo-50/50"
              >
                <span className="text-sm text-slate-600">All Categories</span>
                {!selectedCategory && <Check className="ml-auto h-4 w-4 text-indigo-500" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setSelectedCategory('uncategorized'); setPage(1); }}
                className="rounded-xl px-3 py-2.5 cursor-pointer hover:bg-indigo-50/50 focus:bg-indigo-50/50"
              >
                <span className="mr-3 h-2.5 w-2.5 rounded-full bg-slate-300 shadow-sm" />
                <span className="text-sm text-slate-600">Uncategorized</span>
                {selectedCategory === 'uncategorized' && <Check className="ml-auto h-4 w-4 text-indigo-500" />}
              </DropdownMenuItem>
              <div className="h-px bg-slate-100/50 my-1 mx-2" />
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  onClick={() => { setSelectedCategory(category.id); setPage(1); }}
                  className="rounded-xl px-3 py-2.5 cursor-pointer hover:bg-indigo-50/50 focus:bg-indigo-50/50"
                >
                  <span
                    className="mr-3 h-2.5 w-2.5 rounded-full shadow-sm"
                    style={{ backgroundColor: category.color || '#94a3b8' }}
                  />
                  <span className="text-sm text-slate-600">{category.name}</span>
                  {selectedCategory === category.id && <Check className="ml-auto h-4 w-4 text-indigo-500" />}
                </DropdownMenuItem>
              ))}
            </div>
            {/* Scroll fade */}
            <div className="h-4 bg-gradient-to-t from-white/80 to-transparent pointer-events-none sticky bottom-0" />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Transaction List */}
      <div className="card-premium overflow-hidden">
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground text-sm">No transactions found</p>
          </div>
        ) : (
          <div>
            {transactions.map((transaction, idx) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                categories={categories}
                onUpdateCategory={handleUpdateCategory}
                formatCurrency={formatCurrency}
                isLast={idx === transactions.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="h-9 px-4 rounded-xl bg-secondary/50 hover:bg-secondary text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="h-9 px-4 rounded-xl bg-secondary/50 hover:bg-secondary text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}

// Subscriptions Content Component
function SubscriptionsContent({
  subscriptions,
  summary,
  loading,
  formatCurrency,
  formatFrequency,
  formatSubDate,
  toggleEssential,
  cancelSubscription,
  deleteSubscription,
}: {
  subscriptions: Subscription[]
  summary: SubscriptionSummary | null
  loading: boolean
  formatCurrency: (amount: number) => string
  formatFrequency: (freq: string) => string
  formatSubDate: (dateStr: string | null) => string
  toggleEssential: (id: string, current: boolean) => void
  cancelSubscription: (id: string) => void
  deleteSubscription: (id: string) => void
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid gap-5 md:grid-cols-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">Total</p>
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 flex items-center justify-center border border-indigo-100">
                <CreditCard className="h-4 w-4 text-indigo-500" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-slate-700">{summary.total}</div>
            <p className="text-xs text-slate-400 mt-1">
              {summary.active} active
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">Monthly</p>
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100/50 flex items-center justify-center border border-rose-100">
                <DollarSign className="h-4 w-4 text-rose-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-rose-600">
              {formatCurrency(summary.monthlyTotal)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Recurring each month
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">Yearly</p>
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 flex items-center justify-center border border-amber-100">
                <Calendar className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-amber-600">
              {formatCurrency(summary.yearlyTotal)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Total annual spend
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-500">Essential</p>
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-yellow-50 to-yellow-100/50 flex items-center justify-center border border-yellow-100">
                <Star className="h-4 w-4 text-yellow-600" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-slate-700">
              {subscriptions.filter(s => s.is_essential).length}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Marked as essential
            </p>
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100/50">
          <h2 className="text-sm font-medium text-slate-500">All Subscriptions</h2>
        </div>
        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 flex items-center justify-center mb-4 border border-white/60">
              <AlertCircle className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="text-base font-medium text-slate-700">No subscriptions found</h3>
            <p className="text-sm text-slate-400 mt-1">
              Click &quot;Detect Subscriptions&quot; to find recurring charges
            </p>
          </div>
        ) : (
          <div className="p-2">
            {subscriptions.map((sub, idx) => (
              <div
                key={sub.id}
                className={`flex items-center justify-between px-4 py-4 rounded-xl hover:bg-white/50 transition-colors ${
                  sub.status === 'cancelled' ? 'opacity-50' : ''
                } ${idx !== subscriptions.length - 1 ? 'mb-1' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleEssential(sub.id, sub.is_essential)}
                    className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors ${
                      sub.is_essential
                        ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 text-yellow-500'
                        : 'glass-button text-slate-400 hover:text-yellow-500'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${sub.is_essential ? 'fill-current' : ''}`} />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{sub.merchant_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{formatFrequency(sub.frequency)}</span>
                      {sub.category && (
                        <Badge
                          variant="secondary"
                          className="text-xs h-5 px-2 border-0"
                          style={{
                            backgroundColor: sub.category.color ? `${sub.category.color}15` : 'rgba(99, 102, 241, 0.1)',
                            color: sub.category.color || '#6366f1',
                          }}
                        >
                          {sub.category.name}
                        </Badge>
                      )}
                      {sub.status === 'cancelled' && (
                        <Badge variant="secondary" className="text-xs h-5 px-2 bg-rose-100 text-rose-600 border-0">
                          Cancelled
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-rose-600 tabular-nums">
                      {formatCurrency(sub.amount)}
                    </p>
                    {sub.next_expected_at && sub.status === 'active' && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Next: {formatSubDate(sub.next_expected_at)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {sub.status === 'active' && (
                      <button
                        onClick={() => cancelSubscription(sub.id)}
                        className="h-8 px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white/80 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => deleteSubscription(sub.id)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-white/80 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TransactionRow({
  transaction,
  categories,
  onUpdateCategory,
  formatCurrency,
  isLast,
}: {
  transaction: Transaction
  categories: Category[]
  onUpdateCategory: (transactionId: string, categoryId: string) => void
  formatCurrency: (amount: number) => string
  isLast: boolean
}) {
  const isIncome = transaction.amount > 0

  return (
    <div className={`flex items-center justify-between px-6 py-4 rounded-xl hover:bg-white/50 transition-colors mx-2 ${!isLast ? 'mb-1' : ''}`}>
      <div className="flex items-center gap-4">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            isIncome
              ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-600'
              : 'bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-600'
          }`}
        >
          {isIncome ? (
            <ArrowDownLeft className="h-4 w-4" />
          ) : (
            <ArrowUpRight className="h-4 w-4" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {transaction.merchant_name || transaction.description}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{format(new Date(transaction.date), 'MMM d, yyyy')}</span>
            {transaction.bank_account && (
              <>
                <span>·</span>
                <span>{transaction.bank_account.account_name}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Category Badge */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-auto p-1.5 rounded-xl glass-button hover:bg-white/80 transition-colors">
              {transaction.category ? (
                <Badge
                  variant="secondary"
                  className="border-0 font-medium"
                  style={{
                    backgroundColor: transaction.category.color
                      ? `${transaction.category.color}15`
                      : 'rgba(99, 102, 241, 0.1)',
                    color: transaction.category.color || '#6366f1',
                  }}
                >
                  {transaction.category.name}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-slate-400 bg-slate-100/80 border-0">
                  Uncategorized
                </Badge>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 max-h-80 overflow-hidden rounded-2xl p-0 glass-card border-white/60"
          >
            {/* Scroll indicator header */}
            <div className="px-3 py-2 border-b border-slate-100/50 bg-white/50 sticky top-0 z-10 backdrop-blur-sm">
              <p className="text-xs font-medium text-slate-400">Select category</p>
            </div>
            {/* Scrollable category list */}
            <div className="overflow-y-auto max-h-64 py-1 px-1">
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category.id}
                  onClick={() => onUpdateCategory(transaction.id, category.id)}
                  className="rounded-xl px-3 py-2.5 cursor-pointer hover:bg-indigo-50/50 focus:bg-indigo-50/50"
                >
                  <span
                    className="mr-3 h-2.5 w-2.5 rounded-full shadow-sm"
                    style={{ backgroundColor: category.color || '#94a3b8' }}
                  />
                  <span className="text-sm text-slate-600">{category.name}</span>
                  {transaction.category_id === category.id && (
                    <Check className="ml-auto h-4 w-4 text-indigo-500" />
                  )}
                </DropdownMenuItem>
              ))}
            </div>
            {/* Scroll fade indicator */}
            <div className="h-4 bg-gradient-to-t from-white/80 to-transparent pointer-events-none sticky bottom-0" />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Amount */}
        <p
          className={`min-w-[100px] text-right text-sm font-semibold tabular-nums ${
            isIncome ? 'text-emerald-600' : 'text-foreground'
          }`}
        >
          {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
        </p>
      </div>
    </div>
  )
}
