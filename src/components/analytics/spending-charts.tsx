'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts'

interface CategorySpending {
  name: string
  color: string
  amount: number
}

interface AnalyticsData {
  period: {
    start: string
    end: string
  }
  summary: {
    totalBalance: number
    totalIncome: number
    totalExpenses: number
    netCashFlow: number
  }
  spendingByCategory: CategorySpending[]
}

interface SpendingChartsProps {
  months?: number
}

export function SpendingCharts({ months = 1 }: SpendingChartsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`/api/analytics?months=${months}`)
        const json = await res.json()
        setData(json)
      } catch (error) {
        console.error('Failed to fetch analytics:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [months])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  if (!data || !data.spendingByCategory || data.spendingByCategory.length === 0) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass-card p-6">
          <p className="text-sm font-medium text-slate-500 mb-6">Spending by Category</p>
          <div className="flex h-64 items-center justify-center">
            <p className="text-slate-400 text-sm">No spending data yet</p>
          </div>
        </div>
        <div className="glass-card p-6">
          <p className="text-sm font-medium text-slate-500 mb-6">Spending Distribution</p>
          <div className="flex h-64 items-center justify-center">
            <p className="text-slate-400 text-sm">No spending data yet</p>
          </div>
        </div>
      </div>
    )
  }

  const barData = data.spendingByCategory.slice(0, 8).map(item => ({
    name: item.name.length > 12 ? item.name.slice(0, 12) + '...' : item.name,
    amount: item.amount,
    fill: item.color,
  }))

  const pieData = data.spendingByCategory.slice(0, 6).map(item => ({
    name: item.name,
    value: item.amount,
    color: item.color,
  }))

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card px-4 py-3 border border-white/60">
          <p className="text-sm font-medium text-slate-700">{label}</p>
          <p className="text-lg font-semibold text-indigo-600">{formatCurrency(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="glass-card p-6">
        <p className="text-sm font-medium text-slate-500 mb-6">Spending by Category</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
            <defs>
              {barData.map((entry, index) => (
                <linearGradient key={`gradient-${index}`} id={`barGradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={entry.fill || '#6366f1'} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={entry.fill || '#6366f1'} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              type="number"
              tickFormatter={(value) => `$${value}`}
              fontSize={11}
              stroke="#94a3b8"
              strokeWidth={0.5}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              stroke="#64748b"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }} />
            <Bar dataKey="amount" radius={[0, 8, 8, 0]} barSize={28}>
              {barData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={`url(#barGradient-${index})`}
                  style={{ filter: 'drop-shadow(0 2px 4px rgba(99, 102, 241, 0.15))' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass-card p-6">
        <p className="text-sm font-medium text-slate-500 mb-6">Spending Distribution</p>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <defs>
              {pieData.map((entry, index) => (
                <linearGradient key={`pieGradient-${index}`} id={`pieGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={entry.color || '#6366f1'} stopOpacity={1} />
                  <stop offset="100%" stopColor={entry.color || '#6366f1'} stopOpacity={0.7} />
                </linearGradient>
              ))}
            </defs>
            <Pie
              data={pieData}
              cx="40%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {pieData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={`url(#pieGradient-${index})`}
                  style={{ filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1))' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              layout="vertical"
              verticalAlign="middle"
              align="right"
              wrapperStyle={{ paddingLeft: '20px' }}
              formatter={(value) => (
                <span className="text-sm text-slate-600">
                  {value.length > 12 ? value.slice(0, 12) + '...' : value}
                </span>
              )}
              iconType="circle"
              iconSize={8}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function SpendingSummaryCards() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics?months=1')
        const json = await res.json()
        setData(json)
      } catch (error) {
        console.error('Failed to fetch analytics:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }

  if (!data || !data.summary) return null

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="glass-card p-5">
        <p className="text-sm font-medium text-slate-500 mb-2">Income</p>
        <div className="text-2xl font-semibold text-emerald-600">
          {formatCurrency(data.summary.totalIncome)}
        </div>
      </div>

      <div className="glass-card p-5">
        <p className="text-sm font-medium text-slate-500 mb-2">Expenses</p>
        <div className="text-2xl font-semibold text-rose-600">
          {formatCurrency(data.summary.totalExpenses)}
        </div>
      </div>

      <div className="glass-card p-5">
        <p className="text-sm font-medium text-slate-500 mb-2">Net</p>
        <div className={`text-2xl font-semibold ${data.summary.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {data.summary.netCashFlow >= 0 ? '+' : ''}{formatCurrency(data.summary.netCashFlow)}
        </div>
      </div>
    </div>
  )
}
