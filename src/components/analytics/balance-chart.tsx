'use client'

import { useState, useEffect } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface BalanceDataPoint {
  date: string
  balance: number
}

export function BalanceChart() {
  const [data, setData] = useState<BalanceDataPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Generate sample data for now - this would come from API
    const generateData = () => {
      const points: BalanceDataPoint[] = []
      const now = new Date()
      let balance = 45000

      for (let i = 30; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)

        // Add some realistic variation
        const change = (Math.random() - 0.45) * 2000
        balance = Math.max(0, balance + change)

        points.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          balance: Math.round(balance),
        })
      }
      return points
    }

    setData(generateData())
    setLoading(false)
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card px-4 py-3 border border-white/60">
          <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
          <p className="text-lg font-semibold text-slate-700">{formatCurrency(payload[0].value)}</p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center">
        <div className="animate-pulse bg-slate-100 rounded-xl w-full h-full" />
      </div>
    )
  }

  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <defs>
            <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#c4b5fd" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={false}
          />
          <YAxis
            hide
            domain={['dataMin - 5000', 'dataMax + 5000']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="url(#lineGradient)"
            strokeWidth={2.5}
            fill="url(#balanceGradient)"
            dot={false}
            activeDot={{
              r: 5,
              fill: '#6366f1',
              stroke: '#fff',
              strokeWidth: 2,
              style: { filter: 'drop-shadow(0 2px 4px rgba(99, 102, 241, 0.3))' }
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
