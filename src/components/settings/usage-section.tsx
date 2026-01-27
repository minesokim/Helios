'use client'

import { useState, useEffect } from 'react'
import { Activity, Zap, DollarSign, AlertTriangle, Settings2 } from 'lucide-react'

interface UsageData {
  usage: {
    totalCost: number
    providerBreakdown: Record<string, number>
    requestCount: number
    budgetLimit: number
    usagePercent: number
    daysRemaining: number
    allTimeCost: number
    allTimeRequests: number
    allTimeProviderBreakdown: Record<string, number>
  }
  settings: {
    monthly_budget_usd: number
    soft_limit_percent: number
    hard_limit_enabled: boolean
    daily_limit_usd: number
    max_requests_per_minute: number
    max_requests_per_hour: number
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude AI',
  grok: 'Grok (xAI)',
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  qwen: 'Qwen3 TTS',
  google_drive: 'Google Drive',
  teller: 'Teller Banking',
}

const PROVIDER_COLORS: Record<string, string> = {
  claude: 'bg-purple-500',
  grok: 'bg-orange-500',
  openai: 'bg-green-500',
  elevenlabs: 'bg-blue-500',
  qwen: 'bg-indigo-500',
  google_drive: 'bg-yellow-500',
  teller: 'bg-cyan-500',
}

export function UsageSection() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [budget, setBudget] = useState(50)
  const [dailyLimit, setDailyLimit] = useState(10)
  const [hardLimit, setHardLimit] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/budget')
      if (res.ok) {
        const json = await res.json()
        setData(json)
        if (json.settings) {
          setBudget(json.settings.monthly_budget_usd)
          setDailyLimit(json.settings.daily_limit_usd)
          setHardLimit(json.settings.hard_limit_enabled)
        }
      }
    } catch (error) {
      console.error('Failed to fetch usage data:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/budget', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_budget_usd: budget,
          daily_limit_usd: dailyLimit,
          hard_limit_enabled: hardLimit,
        }),
      })
      if (res.ok) {
        await fetchData()
        setShowSettings(false)
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mercury-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
            <Activity className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-medium text-white">Usage</h2>
            <p className="text-sm text-white/50">Loading usage data...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-white/10 rounded w-full" />
          <div className="h-20 bg-white/10 rounded" />
        </div>
      </div>
    )
  }

  const usage = data?.usage
  const settings = data?.settings

  if (!usage || !settings) {
    return (
      <div className="mercury-card p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
            <Activity className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-medium text-white">Usage</h2>
            <p className="text-sm text-white/50">No usage data available</p>
          </div>
        </div>
      </div>
    )
  }

  const isNearLimit = usage.usagePercent >= settings.soft_limit_percent
  const isOverLimit = usage.usagePercent >= 100

  return (
    <div className="mercury-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
            <Activity className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-medium text-white">API Usage</h2>
            <p className="text-sm text-white/50">Track your API costs and limits</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
        >
          <Settings2 className="h-5 w-5" />
        </button>
      </div>

      {/* Usage Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/70">This Month</span>
          <span className="text-sm font-medium text-white">
            ${usage.totalCost.toFixed(2)} / ${usage.budgetLimit.toFixed(2)}
          </span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isOverLimit
                ? 'bg-red-500'
                : isNearLimit
                ? 'bg-yellow-500'
                : 'bg-gradient-to-r from-cyan-500 to-purple-500'
            }`}
            style={{ width: `${Math.min(usage.usagePercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-white/40">
            {usage.usagePercent.toFixed(1)}% used
          </span>
          <span className="text-xs text-white/40">
            {usage.daysRemaining} days remaining
          </span>
        </div>
      </div>

      {/* Warning if near limit */}
      {isNearLimit && !isOverLimit && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 mb-6">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <p className="text-sm text-yellow-200">
            You've used {usage.usagePercent.toFixed(0)}% of your monthly budget
          </p>
        </div>
      )}

      {isOverLimit && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-200">
            {settings.hard_limit_enabled
              ? 'Budget exceeded. API calls are blocked.'
              : 'Budget exceeded. Consider increasing your limit.'}
          </p>
        </div>
      )}

      {/* Provider Breakdown */}
      {Object.keys(usage.providerBreakdown).length > 0 && (
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-white/50 mb-3">By Provider</p>
          <div className="space-y-2">
            {Object.entries(usage.providerBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, cost]) => (
                <div key={provider} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${PROVIDER_COLORS[provider] || 'bg-white/30'}`} />
                    <span className="text-sm text-white/70">
                      {PROVIDER_LABELS[provider] || provider}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-white tabular-nums">
                    ${cost.toFixed(2)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* All-Time Stats */}
      <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/10">
        <p className="text-xs uppercase tracking-wider text-white/50 mb-3">All-Time Usage</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-semibold text-white">${usage.allTimeCost?.toFixed(2) || '0.00'}</p>
            <p className="text-xs text-white/50">Total Spent</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-white">{(usage.allTimeRequests || 0).toLocaleString()}</p>
            <p className="text-xs text-white/50">Total Requests</p>
          </div>
        </div>
        {/* All-time provider breakdown */}
        {usage.allTimeProviderBreakdown && Object.keys(usage.allTimeProviderBreakdown).length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="flex flex-wrap gap-3">
              {Object.entries(usage.allTimeProviderBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([provider, cost]) => (
                  <div key={provider} className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${PROVIDER_COLORS[provider] || 'bg-white/30'}`} />
                    <span className="text-xs text-white/70">
                      {PROVIDER_LABELS[provider] || provider}: ${cost.toFixed(2)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* This Month Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-white/50">This Month</span>
          </div>
          <p className="text-lg font-medium text-white">{usage.requestCount.toLocaleString()} requests</p>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-cyan-400" />
            <span className="text-xs text-white/50">Daily Avg</span>
          </div>
          <p className="text-lg font-medium text-white">
            ${(usage.totalCost / Math.max(30 - usage.daysRemaining, 1)).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="pt-6 border-t border-white/10 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 block mb-2">
              Monthly Budget
            </label>
            <div className="flex items-center gap-2">
              <span className="text-white/50">$</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="glass-input px-3 py-2 text-white w-24"
                min={1}
                max={1000}
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 block mb-2">
              Daily Limit
            </label>
            <div className="flex items-center gap-2">
              <span className="text-white/50">$</span>
              <input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                className="glass-input px-3 py-2 text-white w-24"
                min={1}
                max={100}
              />
            </div>
            <p className="text-xs text-white/40 mt-1">
              Max spend per day to prevent runaway costs
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Hard Limit</p>
              <p className="text-xs text-white/40">Block API calls when budget is exceeded</p>
            </div>
            <button
              onClick={() => setHardLimit(!hardLimit)}
              className={`w-12 h-6 rounded-full transition-colors ${
                hardLimit ? 'bg-cyan-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  hardLimit ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-sm font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-shadow disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  )
}
