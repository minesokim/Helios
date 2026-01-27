'use client'

import { useState, useEffect } from 'react'
import {
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  RefreshCw,
} from 'lucide-react'

interface ClientPL {
  revenue: number
  expenses: number
  profit: number
  margin: number
}

interface Client {
  id: string
  name: string
  status: string
  contact_email: string | null
  contact_name: string | null
  monthly_retainer: number | null
  notes: string | null
  pl: ClientPL
}

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

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [totals, setTotals] = useState<Totals>({ revenue: 0, expenses: 0, profit: 0, margin: 0 })
  const [loading, setLoading] = useState(true)
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients')
      if (res.ok) {
        const data = await res.json()
        setClients(data.clients || [])
        setTotals(data.totals || { revenue: 0, expenses: 0, profit: 0, margin: 0 })
      }
    } catch (e) {
      console.error('Failed to fetch clients:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [])

  const handleAddClient = async () => {
    if (!newClientName.trim()) return

    setSaving(true)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName }),
      })

      if (res.ok) {
        setNewClientName('')
        setShowAddClient(false)
        fetchClients()
      }
    } catch (e) {
      console.error('Failed to add client:', e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light text-white text-display tracking-tight">Clients</h1>
          <p className="text-white/50 text-sm mt-1">Noctworks client P&L (Last 12 months)</p>
        </div>
        <button
          onClick={() => setShowAddClient(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-white text-sm transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Client
        </button>
      </div>

      {/* Add Client Modal */}
      {showAddClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="mercury-card p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-medium text-white mb-4">Add Client</h2>
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Client name"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-500/50 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddClient(false)}
                className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-white/70 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddClient}
                disabled={saving || !newClientName.trim()}
                className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* P&L Summary Cards */}
      {clients.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="mercury-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-400" />
              </div>
              <span className="text-xs uppercase tracking-wider text-white/40">Revenue</span>
            </div>
            <p className="text-2xl font-light text-white">{formatCurrency(totals.revenue)}</p>
          </div>

          <div className="mercury-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-red-400" />
              </div>
              <span className="text-xs uppercase tracking-wider text-white/40">Expenses</span>
            </div>
            <p className="text-2xl font-light text-white">{formatCurrency(totals.expenses)}</p>
          </div>

          <div className="mercury-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-cyan-400" />
              </div>
              <span className="text-xs uppercase tracking-wider text-white/40">Net Profit</span>
            </div>
            <p className={`text-2xl font-light ${totals.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(totals.profit)}
            </p>
          </div>

          <div className="mercury-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                {totals.margin >= 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-purple-400" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-purple-400" />
                )}
              </div>
              <span className="text-xs uppercase tracking-wider text-white/40">Margin</span>
            </div>
            <p className={`text-2xl font-light ${totals.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totals.margin}%
            </p>
          </div>
        </div>
      )}

      {/* Client List */}
      {clients.length === 0 ? (
        <div className="mercury-card p-12 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4 border border-white/10">
            <Building2 className="h-8 w-8 text-cyan-400" />
          </div>
          <h2 className="text-lg font-medium text-white mb-2">No clients yet</h2>
          <p className="text-white/50 text-sm mb-6">Add your first client to start tracking P&L</p>
          <button
            onClick={() => setShowAddClient(true)}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors"
          >
            Add First Client
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <div
              key={client.id}
              className="mercury-card p-5 hover:bg-white/[0.06] transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                    <Building2 className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{client.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        client.status === 'active' ? 'bg-green-500/20 text-green-400' :
                        client.status === 'paused' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-white/10 text-white/50'
                      }`}>
                        {client.status}
                      </span>
                      {client.monthly_retainer && (
                        <span className="text-xs text-white/40">
                          {formatCurrency(client.monthly_retainer)}/mo retainer
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  {/* P&L Mini Display */}
                  <div className="hidden md:flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-xs text-white/40 mb-0.5">Revenue</p>
                      <p className="text-white font-medium">{formatCurrency(client.pl.revenue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/40 mb-0.5">Expenses</p>
                      <p className="text-white font-medium">{formatCurrency(client.pl.expenses)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/40 mb-0.5">Profit</p>
                      <p className={`font-medium ${client.pl.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(client.pl.profit)}
                      </p>
                    </div>
                    <div className="text-right min-w-[50px]">
                      <p className="text-xs text-white/40 mb-0.5">Margin</p>
                      <p className={`font-medium ${client.pl.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {client.pl.margin}%
                      </p>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-white/40 transition-colors" />
                </div>
              </div>

              {/* Mobile P&L Display */}
              <div className="md:hidden mt-4 pt-4 border-t border-white/5">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Revenue</p>
                    <p className="text-sm text-white font-medium">{formatCurrency(client.pl.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Expenses</p>
                    <p className="text-sm text-white font-medium">{formatCurrency(client.pl.expenses)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Profit</p>
                    <p className={`text-sm font-medium ${client.pl.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(client.pl.profit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-1">Margin</p>
                    <p className={`text-sm font-medium ${client.pl.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {client.pl.margin}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
