'use client'

import { useState } from 'react'
import { Wallet, Receipt } from 'lucide-react'
import dynamic from 'next/dynamic'

// Dynamically import the page content (they're complex with their own state)
const AccountsContent = dynamic(() => import('../accounts/page'), { ssr: false })
const TransactionsContent = dynamic(() => import('../transactions/page'), { ssr: false })

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<'accounts' | 'activity'>('accounts')

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/80 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'accounts'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Wallet className="h-4 w-4" />
          Accounts
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'activity'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Activity
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'accounts' ? <AccountsContent /> : <TransactionsContent />}
    </div>
  )
}
