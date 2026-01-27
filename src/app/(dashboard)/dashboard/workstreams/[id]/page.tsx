'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  Globe,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  Edit2,
  Trash2,
  Calendar,
  Tag,
} from 'lucide-react'

interface Client {
  id: string
  name: string
  company: string | null
  email: string | null
  emails: string[] | null
  phone: string | null
  website: string | null
  industry: string | null
  service_type: string | null
  type: string | null
  status: string
  source: string | null
  monthly_retainer: number | null
  hourly_rate: number | null
  total_revenue: number | null
  total_expenses: number | null
  started_at: string | null
  ended_at: string | null
  notes: string | null
  tags: string[] | null
  created_at: string
}

interface LinkedEmail {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  accountLabel: string
}

interface LinkedDocument {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  webViewLink: string
}

interface LinkedConversation {
  id: string
  title: string
  snippet: string
  date: string
}

interface RevenueEntry {
  id: string
  description: string
  amount: number
  category: string
  revenue_date: string
  invoice_number: string | null
  paid: boolean
}

interface ExpenseEntry {
  id: string
  description: string
  amount: number
  category: string
  expense_date: string
  vendor: string | null
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  churned: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmail[]>([])
  const [linkedDocuments, setLinkedDocuments] = useState<LinkedDocument[]>([])
  const [linkedConversations, setLinkedConversations] = useState<LinkedConversation[]>([])
  const [revenue, setRevenue] = useState<RevenueEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'activity'>('overview')

  const fetchClientData = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/linked`)
      if (res.ok) {
        const data = await res.json()
        setClient(data.client)
        setLinkedEmails(data.linked?.emails || [])
        setLinkedDocuments(data.linked?.documents || [])
        setLinkedConversations(data.linked?.conversations || [])
        setRevenue(data.financials?.revenue || [])
        setExpenses(data.financials?.expenses || [])
      } else if (res.status === 404) {
        router.push('/dashboard/workstreams')
      }
    } catch (e) {
      console.error('Failed to fetch client:', e)
    } finally {
      setLoading(false)
    }
  }, [clientId, router])

  useEffect(() => {
    fetchClientData()
  }, [fetchClientData])

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-white/40 animate-spin" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <p className="text-white/50">Client not found</p>
        <Link href="/dashboard/workstreams" className="text-cyan-400 hover:underline mt-2 inline-block">
          Back to clients
        </Link>
      </div>
    )
  }

  const totalRevenue = revenue.reduce((sum, r) => sum + Number(r.amount), 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const profit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0

  const displayName = client.company || client.name
  const contactName = client.company ? client.name : null

  return (
    <div className="max-w-5xl mx-auto pb-8">
      {/* Back Button */}
      <Link
        href="/dashboard/workstreams"
        className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>

      {/* Header */}
      <div className="mercury-card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 flex-shrink-0">
              {client.type === 'individual' ? (
                <User className="h-8 w-8 text-cyan-400" />
              ) : (
                <Building2 className="h-8 w-8 text-cyan-400" />
              )}
            </div>

            <div>
              <h1 className="text-2xl font-light text-white">{displayName}</h1>
              {contactName && (
                <p className="text-white/50 mt-1">{contactName}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className={`text-xs px-3 py-1 rounded-full border ${
                  statusColors[client.status] || 'bg-white/10 text-white/50 border-white/20'
                }`}>
                  {client.status}
                </span>

                {client.source === 'ai_suggested' && (
                  <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    AI Detected
                  </span>
                )}

                {client.industry && (
                  <span className="text-xs text-white/40">{client.industry}</span>
                )}
              </div>

              {client.tags && client.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {client.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-white/5 rounded text-white/50 flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white">
              <Edit2 className="h-4 w-4" />
            </button>
            <button className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-white/50 hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/5">
          {client.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-white/40" />
              <a href={`mailto:${client.email}`} className="text-sm text-white/70 hover:text-cyan-400 truncate">
                {client.email}
              </a>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-white/40" />
              <a href={`tel:${client.phone}`} className="text-sm text-white/70 hover:text-cyan-400">
                {client.phone}
              </a>
            </div>
          )}
          {client.website && (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-white/40" />
              <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-white/70 hover:text-cyan-400 truncate">
                {client.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
          {client.started_at && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-white/40" />
              <span className="text-sm text-white/70">Since {formatDate(client.started_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="mercury-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-xs text-white/40">Revenue</span>
          </div>
          <p className="text-xl font-light text-white">{formatCurrency(totalRevenue)}</p>
        </div>

        <div className="mercury-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-xs text-white/40">Expenses</span>
          </div>
          <p className="text-xl font-light text-white">{formatCurrency(totalExpenses)}</p>
        </div>

        <div className="mercury-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-white/40">Profit</span>
          </div>
          <p className={`text-xl font-light ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(profit)}
          </p>
        </div>

        <div className="mercury-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-white/40">Margin</span>
          </div>
          <p className={`text-xl font-light ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {margin}%
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-lg w-fit">
        {(['overview', 'financials', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm transition-colors ${
              activeTab === tab
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notes */}
          {client.notes && (
            <div className="mercury-card p-5 lg:col-span-2">
              <h3 className="text-sm font-medium text-white/60 mb-3">Notes</h3>
              <p className="text-white/80 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}

          {/* Linked Emails */}
          <div className="mercury-card p-5">
            <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Linked Emails ({linkedEmails.length})
            </h3>
            {linkedEmails.length === 0 ? (
              <p className="text-white/30 text-sm">No linked emails found</p>
            ) : (
              <div className="space-y-3">
                {linkedEmails.slice(0, 5).map((email) => (
                  <div key={email.id} className="p-3 bg-white/5 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{email.subject}</p>
                        <p className="text-xs text-white/40 mt-0.5 truncate">{email.from}</p>
                      </div>
                      <span className="text-xs text-white/30 flex-shrink-0">
                        {formatDate(email.date)}
                      </span>
                    </div>
                    {email.snippet && (
                      <p className="text-xs text-white/50 mt-2 line-clamp-2">{email.snippet}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked Documents */}
          <div className="mercury-card p-5">
            <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Linked Documents ({linkedDocuments.length})
            </h3>
            {linkedDocuments.length === 0 ? (
              <p className="text-white/30 text-sm">No linked documents found</p>
            ) : (
              <div className="space-y-2">
                {linkedDocuments.slice(0, 5).map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-white/40 flex-shrink-0" />
                      <span className="text-sm text-white truncate">{doc.name}</span>
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/20 group-hover:text-white/40 flex-shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Linked Conversations */}
          <div className="mercury-card p-5 lg:col-span-2">
            <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Related Conversations ({linkedConversations.length})
            </h3>
            {linkedConversations.length === 0 ? (
              <p className="text-white/30 text-sm">No related conversations found</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {linkedConversations.slice(0, 4).map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/dashboard/chat?conversation=${conv.id}`}
                    className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <p className="text-sm text-white truncate">{conv.title}</p>
                    <p className="text-xs text-white/40 mt-1 line-clamp-2">{conv.snippet}</p>
                    <p className="text-xs text-white/30 mt-2">{formatDate(conv.date)}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'financials' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue */}
          <div className="mercury-card p-5">
            <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Revenue ({revenue.length} entries)
            </h3>
            {revenue.length === 0 ? (
              <p className="text-white/30 text-sm">No revenue recorded</p>
            ) : (
              <div className="space-y-2">
                {revenue.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-white/40">{entry.category}</span>
                        <span className="text-xs text-white/30">{formatDate(entry.revenue_date)}</span>
                        {entry.paid && (
                          <span className="text-xs text-green-400/70">Paid</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-400">{formatCurrency(entry.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expenses */}
          <div className="mercury-card p-5">
            <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              Expenses ({expenses.length} entries)
            </h3>
            {expenses.length === 0 ? (
              <p className="text-white/30 text-sm">No expenses recorded</p>
            ) : (
              <div className="space-y-2">
                {expenses.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-white/40">{entry.category}</span>
                        <span className="text-xs text-white/30">{formatDate(entry.expense_date)}</span>
                        {entry.vendor && (
                          <span className="text-xs text-white/30">{entry.vendor}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-red-400">-{formatCurrency(entry.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="mercury-card p-5">
          <h3 className="text-sm font-medium text-white/60 mb-4">Activity Timeline</h3>
          <p className="text-white/30 text-sm">Activity timeline coming soon...</p>
        </div>
      )}
    </div>
  )
}
