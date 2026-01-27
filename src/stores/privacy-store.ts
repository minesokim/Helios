import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PrivacyStore {
  // State
  privacyMode: boolean

  // Hydration tracking
  _hasHydrated: boolean

  // Actions
  setPrivacyMode: (enabled: boolean) => void
  togglePrivacyMode: () => void
  setHasHydrated: (state: boolean) => void
}

// Mock data for privacy mode
export const mockFinancialData = {
  totalBalance: 125847.32,
  monthIncome: 18500.00,
  monthExpenses: 7823.45,
  monthNet: 10676.55,
  accounts: [
    {
      id: 'mock-1',
      account_name: 'Premium Checking',
      institution_name: 'First National Bank',
      account_type: 'checking',
      current_balance: 45234.67,
      available_balance: 45234.67,
      account_number_last4: '4521',
      sync_status: 'success' as const,
      last_sync_at: new Date().toISOString(),
    },
    {
      id: 'mock-2',
      account_name: 'High Yield Savings',
      institution_name: 'First National Bank',
      account_type: 'savings',
      current_balance: 82500.00,
      available_balance: 82500.00,
      account_number_last4: '8832',
      sync_status: 'success' as const,
      last_sync_at: new Date().toISOString(),
    },
    {
      id: 'mock-3',
      account_name: 'Rewards Card',
      institution_name: 'Premium Credit',
      account_type: 'credit',
      current_balance: -1887.35,
      available_balance: 8112.65,
      account_number_last4: '9012',
      sync_status: 'success' as const,
      last_sync_at: new Date().toISOString(),
    },
  ],
  recentTransactions: [
    {
      id: 'mock-tx-1',
      date: new Date().toISOString().split('T')[0],
      description: 'Direct Deposit',
      merchant_name: 'Employer Inc.',
      amount: 5250.00,
      category: { name: 'Income', color: '#22c55e' },
    },
    {
      id: 'mock-tx-2',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      description: 'Whole Foods Market',
      merchant_name: 'Whole Foods',
      amount: -127.84,
      category: { name: 'Groceries', color: '#f97316' },
    },
    {
      id: 'mock-tx-3',
      date: new Date(Date.now() - 172800000).toISOString().split('T')[0],
      description: 'Netflix Subscription',
      merchant_name: 'Netflix',
      amount: -15.99,
      category: { name: 'Entertainment', color: '#8b5cf6' },
    },
    {
      id: 'mock-tx-4',
      date: new Date(Date.now() - 259200000).toISOString().split('T')[0],
      description: 'Shell Gas Station',
      merchant_name: 'Shell',
      amount: -62.45,
      category: { name: 'Transportation', color: '#3b82f6' },
    },
    {
      id: 'mock-tx-5',
      date: new Date(Date.now() - 345600000).toISOString().split('T')[0],
      description: 'Amazon Purchase',
      merchant_name: 'Amazon',
      amount: -89.99,
      category: { name: 'Shopping', color: '#ec4899' },
    },
  ],
}

export const usePrivacyStore = create<PrivacyStore>()(
  persist(
    (set, get) => ({
      privacyMode: false,
      _hasHydrated: false,

      setPrivacyMode: (enabled) => set({ privacyMode: enabled }),

      togglePrivacyMode: () => set((state) => ({ privacyMode: !state.privacyMode })),

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'jim-privacy-store',
      partialize: (state) => ({
        privacyMode: state.privacyMode,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
