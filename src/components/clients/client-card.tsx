'use client'

import { Building2, User, ChevronRight, Mail, DollarSign } from 'lucide-react'
import Link from 'next/link'

interface ClientPL {
  revenue: number
  expenses: number
  profit: number
  margin: number
}

export interface ClientData {
  id: string
  name: string
  company?: string | null
  email?: string | null
  status: string
  type?: string | null
  monthly_retainer?: number | null
  source?: string | null
  pl?: ClientPL
}

interface ClientCardProps {
  client: ClientData
  showFinancials?: boolean
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  lead: 'bg-blue-500/20 text-blue-400',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-purple-500/20 text-purple-400',
  churned: 'bg-red-500/20 text-red-400',
}

export function ClientCard({ client, showFinancials = true }: ClientCardProps) {
  const displayName = client.company && client.company !== client.name
    ? client.company
    : client.name

  const contactName = client.company && client.company !== client.name
    ? client.name
    : null

  return (
    <Link href={`/dashboard/workstreams/${client.id}`}>
      <div className="mercury-card p-5 hover:bg-white/[0.06] transition-colors cursor-pointer group">
        <div className="flex items-start justify-between gap-4">
          {/* Left: Icon and Info */}
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 flex-shrink-0">
              {client.type === 'individual' ? (
                <User className="h-6 w-6 text-cyan-400" />
              ) : (
                <Building2 className="h-6 w-6 text-cyan-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-white truncate">{displayName}</h3>

              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  statusColors[client.status] || 'bg-white/10 text-white/50'
                }`}>
                  {client.status}
                </span>

                {contactName && (
                  <span className="text-xs text-white/40 truncate">
                    {contactName}
                  </span>
                )}

                {client.email && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{client.email}</span>
                  </span>
                )}
              </div>

              {client.monthly_retainer && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-white/40">
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(client.monthly_retainer)}/mo retainer
                </div>
              )}

              {client.source === 'ai_suggested' && (
                <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-cyan-400/70 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  AI Detected
                </span>
              )}
            </div>
          </div>

          {/* Right: Financials and Arrow */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {showFinancials && client.pl && (
              <div className="hidden sm:flex items-center gap-4 text-right">
                <div>
                  <p className="text-xs text-white/40 mb-0.5">Revenue</p>
                  <p className="text-sm font-medium text-white">{formatCurrency(client.pl.revenue)}</p>
                </div>
                <div className="min-w-[60px]">
                  <p className="text-xs text-white/40 mb-0.5">Profit</p>
                  <p className={`text-sm font-medium ${client.pl.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(client.pl.profit)}
                  </p>
                </div>
              </div>
            )}

            <ChevronRight className="h-5 w-5 text-white/20 group-hover:text-white/40 transition-colors" />
          </div>
        </div>

        {/* Mobile Financials */}
        {showFinancials && client.pl && (client.pl.revenue > 0 || client.pl.expenses > 0) && (
          <div className="sm:hidden mt-4 pt-4 border-t border-white/5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-white/40 mb-0.5">Revenue</p>
                <p className="text-sm font-medium text-white">{formatCurrency(client.pl.revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-0.5">Expenses</p>
                <p className="text-sm font-medium text-white">{formatCurrency(client.pl.expenses)}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-0.5">Profit</p>
                <p className={`text-sm font-medium ${client.pl.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(client.pl.profit)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}
