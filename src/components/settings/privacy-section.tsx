'use client'

import { usePrivacyStore } from '@/stores/privacy-store'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'

export function PrivacySection() {
  const { privacyMode, setPrivacyMode, _hasHydrated } = usePrivacyStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render switch until hydrated to prevent mismatch
  if (!mounted || !_hasHydrated) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/50 flex items-center justify-center border border-violet-100">
            <Shield className="h-6 w-6 text-violet-500" />
          </div>
          <div>
            <h2 className="font-medium text-slate-800">Privacy Mode</h2>
            <p className="text-sm text-slate-400">Control what financial data is displayed</p>
          </div>
        </div>
        <div className="h-16 animate-pulse bg-slate-100 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center border transition-colors ${
          privacyMode
            ? 'bg-gradient-to-br from-violet-100 to-violet-200/50 border-violet-200'
            : 'bg-gradient-to-br from-violet-50 to-violet-100/50 border-violet-100'
        }`}>
          {privacyMode ? (
            <EyeOff className="h-6 w-6 text-violet-600" />
          ) : (
            <Eye className="h-6 w-6 text-violet-500" />
          )}
        </div>
        <div>
          <h2 className="font-medium text-slate-800">Privacy Mode</h2>
          <p className="text-sm text-slate-400">Control what financial data is displayed</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Toggle Row */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 border border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-700">Demo Mode</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Show sample data instead of your real financial information
            </p>
          </div>
          <button
            onClick={() => setPrivacyMode(!privacyMode)}
            className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
              privacyMode ? 'bg-violet-500' : 'bg-slate-200'
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                privacyMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Status Indicator */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
          privacyMode
            ? 'bg-violet-50 border-violet-100'
            : 'bg-emerald-50 border-emerald-100'
        }`}>
          <div className={`h-2 w-2 rounded-full ${
            privacyMode ? 'bg-violet-500' : 'bg-emerald-500'
          }`} />
          <p className={`text-sm font-medium ${
            privacyMode ? 'text-violet-700' : 'text-emerald-700'
          }`}>
            {privacyMode
              ? 'Privacy mode is active. Showing demo data.'
              : 'Showing your real financial data.'}
          </p>
        </div>

        {/* Info */}
        <p className="text-xs text-slate-400">
          Use this when showing the app to friends, family, or during demos.
          Your real data is never shared and remains secure.
        </p>
      </div>
    </div>
  )
}
