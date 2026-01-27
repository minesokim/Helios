'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  RefreshCw,
  Sparkles,
  Search,
  Filter,
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from 'lucide-react'
import { ClientCard, ClientData } from '@/components/clients/client-card'
import { SuggestionsDrawer, Suggestion } from '@/components/clients/suggestions-drawer'
import { AddClientForm } from '@/components/clients/add-client-form'

interface Totals {
  revenue: number
  expenses: number
  profit: number
  margin: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function WorkstreamsPage() {
  const [clients, setClients] = useState<ClientData[]>([])
  const [totals, setTotals] = useState<Totals>({ revenue: 0, expenses: 0, profit: 0, margin: 0 })
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  // UI state
  const [showAddClient, setShowAddClient] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Fetch clients
  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients')
      if (res.ok) {
        const data = await res.json()
        setClients(data.clients || [])
        setTotals(data.totals || { revenue: 0, expenses: 0, profit: 0, margin: 0 })
      }
    } catch (e) {
      console.error('Failed to fetch clients:', e)
    }
  }, [])

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/clients/suggestions')
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (e) {
      console.error('Failed to fetch suggestions:', e)
    }
  }, [])

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchClients(), fetchSuggestions()])
      setLoading(false)
    }
    load()
  }, [fetchClients, fetchSuggestions])

  // Run analysis
  const [analysisDebug, setAnalysisDebug] = useState<string | null>(null)

  const runAnalysis = async () => {
    setAnalyzing(true)
    setAnalysisDebug(null)
    try {
      const res = await fetch('/api/clients/analyze', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        console.log('Analysis complete:', data.summary, data.debug)

        // Build debug message for user
        if (data.debug) {
          const debugMessages: string[] = []
          if (data.debug.emailDebug) debugMessages.push(`Email: ${data.debug.emailDebug}`)
          if (data.debug.docDebug) debugMessages.push(`Docs: ${data.debug.docDebug}`)
          if (data.debug.convDebug) debugMessages.push(`Chat: ${data.debug.convDebug}`)
          if (data.debug.calDebug) debugMessages.push(`Calendar: ${data.debug.calDebug}`)

          if (data.summary.detected === 0) {
            setAnalysisDebug(debugMessages.join(' | '))
          }
        }

        await fetchSuggestions()
        if (data.summary.newSuggestions > 0) {
          setShowSuggestions(true)
        }
      } else {
        const errorData = await res.json()
        setAnalysisDebug(errorData.details || 'Analysis failed')
      }
    } catch (e) {
      console.error('Analysis failed:', e)
      setAnalysisDebug('Network error during analysis')
    } finally {
      setAnalyzing(false)
    }
  }

  // Add client
  const handleAddClient = async (data: {
    name: string
    company?: string
    email?: string
    type: 'company' | 'individual'
    status: string
    monthly_retainer?: number
    notes?: string
  }) => {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (res.ok) {
      await fetchClients()
    }
  }

  // Approve suggestion
  const handleApproveSuggestion = async (id: string, overrides?: { name?: string; company?: string }) => {
    const res = await fetch('/api/clients/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId: id, action: 'approve', overrides }),
    })

    if (res.ok) {
      await Promise.all([fetchClients(), fetchSuggestions()])
    }
  }

  // Reject suggestion
  const handleRejectSuggestion = async (id: string) => {
    const res = await fetch('/api/clients/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId: id, action: 'reject' }),
    })

    if (res.ok) {
      await fetchSuggestions()
    }
  }

  // Merge suggestion
  const handleMergeSuggestion = async (id: string, targetClientId: string) => {
    const res = await fetch('/api/clients/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId: id, action: 'merge', targetClientId }),
    })

    if (res.ok) {
      await fetchSuggestions()
    }
  }

  // Filter clients
  const filteredClients = clients.filter((client) => {
    // Status filter
    if (statusFilter !== 'all' && client.status !== statusFilter) return false

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        client.name.toLowerCase().includes(query) ||
        client.company?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query)
      )
    }

    return true
  })

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-white text-display tracking-tight">Clients</h1>
          <p className="text-white/50 text-sm mt-1">Manage your client relationships</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-400 text-sm transition-colors disabled:opacity-50"
          >
            {analyzing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analyzing ? 'Analyzing...' : 'Detect Clients'}
          </button>
          <button
            onClick={() => setShowAddClient(true)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </button>
        </div>
      </div>

      {/* Analysis Debug Info */}
      {analysisDebug && (
        <div className="mb-6 p-4 mercury-card bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-amber-400 mt-0.5" />
            <div>
              <p className="text-white font-medium text-sm">No clients detected</p>
              <p className="text-white/60 text-xs mt-1">{analysisDebug}</p>
              <p className="text-white/40 text-xs mt-2">
                Detection works best with connected Google accounts, indexed Drive files, and AI chat history.
              </p>
            </div>
            <button
              onClick={() => setAnalysisDebug(null)}
              className="text-white/40 hover:text-white/60 ml-auto"
            >
              <span className="text-lg">&times;</span>
            </button>
          </div>
        </div>
      )}

      {/* Suggestions Banner */}
      {suggestions.length > 0 && (
        <button
          onClick={() => setShowSuggestions(true)}
          className="w-full mb-6 p-4 mercury-card bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 hover:border-purple-500/40 transition-colors text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-white font-medium">
                  {suggestions.length} potential client{suggestions.length !== 1 ? 's' : ''} detected
                </p>
                <p className="text-white/50 text-sm">
                  Click to review AI suggestions from your emails and documents
                </p>
              </div>
            </div>
            <span className="text-purple-400 text-sm group-hover:underline">
              Review
            </span>
          </div>
        </button>
      )}

      {/* Summary Cards */}
      {clients.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="mercury-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-white/40">Total Clients</span>
            </div>
            <p className="text-2xl font-light text-white">{clients.length}</p>
          </div>

          <div className="mercury-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              <span className="text-xs text-white/40">Revenue (12mo)</span>
            </div>
            <p className="text-2xl font-light text-white">{formatCurrency(totals.revenue)}</p>
          </div>

          <div className="mercury-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              <span className="text-xs text-white/40">Expenses (12mo)</span>
            </div>
            <p className="text-2xl font-light text-white">{formatCurrency(totals.expenses)}</p>
          </div>

          <div className="mercury-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-white/40">Net Profit</span>
            </div>
            <p className={`text-2xl font-light ${totals.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(totals.profit)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clients..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer [&>option]:bg-[#1a1a24] [&>option]:text-white min-w-[140px]"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="lead">Leads</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="churned">Churned</option>
          </select>
        </div>
      </div>

      {/* Client List */}
      {filteredClients.length === 0 ? (
        <div className="mercury-card p-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4 border border-white/10">
            <Building2 className="h-8 w-8 text-cyan-400" />
          </div>
          <h2 className="text-lg font-medium text-white mb-2">
            {searchQuery || statusFilter !== 'all' ? 'No matching clients' : 'No clients yet'}
          </h2>
          <p className="text-white/50 text-sm mb-6">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Add your first client or let AI detect them from your data'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setShowAddClient(true)}
              className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors"
            >
              Add Client
            </button>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-purple-400 font-medium transition-colors disabled:opacity-50"
            >
              {analyzing ? 'Analyzing...' : 'Detect from Data'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}

      {/* Modals/Drawers */}
      <AddClientForm
        isOpen={showAddClient}
        onClose={() => setShowAddClient(false)}
        onSubmit={handleAddClient}
      />

      <SuggestionsDrawer
        isOpen={showSuggestions}
        onClose={() => setShowSuggestions(false)}
        suggestions={suggestions}
        existingClients={clients.map((c) => ({ id: c.id, name: c.name }))}
        onApprove={handleApproveSuggestion}
        onReject={handleRejectSuggestion}
        onMerge={handleMergeSuggestion}
      />
    </div>
  )
}
