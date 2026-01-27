import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type Transaction = Database['public']['Tables']['transactions']['Row']
type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert']
type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row']

interface DetectedSubscription {
  merchant_name: string
  amount: number
  frequency: 'weekly' | 'monthly' | 'yearly'
  transaction_count: number
  first_seen: string
  last_seen: string
  confidence: number
}

// POST /api/subscriptions/detect - Detect subscriptions from transactions
export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch last 12 months of transactions
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const result = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .lt('amount', 0) // Only expenses
      .gte('date', twelveMonthsAgo.toISOString().split('T')[0])
      .order('date', { ascending: true })

    const transactions = result.data as Transaction[] | null

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ detected: [], created: 0 })
    }

    // Group transactions by merchant
    const merchantGroups = new Map<string, Transaction[]>()

    for (const tx of transactions) {
      const merchantKey = normalizeMerchantName(tx.merchant_name || tx.description)
      const existing = merchantGroups.get(merchantKey) || []
      existing.push(tx)
      merchantGroups.set(merchantKey, existing)
    }

    // Analyze each merchant for subscription patterns
    const detected: DetectedSubscription[] = []

    for (const [merchant, txs] of merchantGroups) {
      if (txs.length < 2) continue // Need at least 2 transactions

      // Group by similar amounts (within 10% tolerance)
      const amountGroups = groupByAmount(txs)

      for (const group of amountGroups) {
        if (group.length < 2) continue

        const frequency = detectFrequency(group)
        if (!frequency) continue

        const amounts = group.map(t => Math.abs(t.amount))
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length

        detected.push({
          merchant_name: merchant,
          amount: Math.round(avgAmount * 100) / 100,
          frequency,
          transaction_count: group.length,
          first_seen: group[0].date,
          last_seen: group[group.length - 1].date,
          confidence: calculateConfidence(group, frequency),
        })
      }
    }

    // Filter high confidence detections
    const highConfidence = detected.filter(d => d.confidence >= 0.7)

    // Get existing subscriptions to avoid duplicates
    const existingResult = await supabase
      .from('subscriptions')
      .select('merchant_name, amount')
      .eq('user_id', user.id)
      .is('deleted_at', null)

    const existingData = existingResult.data as Pick<SubscriptionRow, 'merchant_name' | 'amount'>[] | null

    const existing = new Set(
      (existingData ?? []).map(s => `${s.merchant_name.toLowerCase()}-${s.amount}`)
    )

    // Create new subscriptions
    const newSubscriptions: SubscriptionInsert[] = []

    for (const sub of highConfidence) {
      const key = `${sub.merchant_name.toLowerCase()}-${sub.amount}`
      if (existing.has(key)) continue

      newSubscriptions.push({
        user_id: user.id,
        merchant_name: sub.merchant_name,
        normalized_name: sub.merchant_name.toLowerCase(),
        amount: sub.amount,
        frequency: sub.frequency,
        status: 'active',
        first_seen_at: sub.first_seen,
        last_charged_at: sub.last_seen,
        next_expected_at: calculateNextExpected(sub.last_seen, sub.frequency),
      })
    }

    if (newSubscriptions.length > 0) {
      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert(newSubscriptions as never)

      if (insertError) {
        console.error('Failed to insert subscriptions:', insertError)
      }
    }

    return NextResponse.json({
      detected: highConfidence,
      created: newSubscriptions.length,
    })
  } catch (error) {
    console.error('Detect subscriptions error:', error)
    return NextResponse.json(
      { error: 'Failed to detect subscriptions' },
      { status: 500 }
    )
  }
}

function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3) // Take first 3 words
    .join(' ')
}

function groupByAmount(transactions: Transaction[]): Transaction[][] {
  const groups: Transaction[][] = []
  const used = new Set<number>()

  for (let i = 0; i < transactions.length; i++) {
    if (used.has(i)) continue

    const group = [transactions[i]]
    const baseAmount = Math.abs(transactions[i].amount)
    used.add(i)

    for (let j = i + 1; j < transactions.length; j++) {
      if (used.has(j)) continue

      const amount = Math.abs(transactions[j].amount)
      const diff = Math.abs(amount - baseAmount) / baseAmount

      if (diff <= 0.1) { // 10% tolerance
        group.push(transactions[j])
        used.add(j)
      }
    }

    groups.push(group)
  }

  return groups
}

function detectFrequency(transactions: Transaction[]): 'weekly' | 'monthly' | 'yearly' | null {
  if (transactions.length < 2) return null

  const dates = transactions.map(t => new Date(t.date).getTime())
  const intervals: number[] = []

  for (let i = 1; i < dates.length; i++) {
    const days = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)
    intervals.push(days)
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

  // Weekly: 5-10 days
  if (avgInterval >= 5 && avgInterval <= 10) return 'weekly'

  // Monthly: 25-35 days
  if (avgInterval >= 25 && avgInterval <= 35) return 'monthly'

  // Yearly: 350-380 days
  if (avgInterval >= 350 && avgInterval <= 380) return 'yearly'

  return null
}

function calculateConfidence(transactions: Transaction[], frequency: string): number {
  let baseConfidence = 0.5

  // More transactions = higher confidence
  if (transactions.length >= 3) baseConfidence += 0.1
  if (transactions.length >= 6) baseConfidence += 0.1
  if (transactions.length >= 12) baseConfidence += 0.1

  // Consistent amounts = higher confidence
  const amounts = transactions.map(t => Math.abs(t.amount))
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length
  const stdDev = Math.sqrt(variance)
  const cv = stdDev / avgAmount // Coefficient of variation

  if (cv < 0.05) baseConfidence += 0.15 // Very consistent
  else if (cv < 0.1) baseConfidence += 0.1 // Fairly consistent

  return Math.min(baseConfidence, 1.0)
}

function calculateNextExpected(lastDate: string, frequency: string): string {
  const date = new Date(lastDate)

  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7)
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1)
  } else if (frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + 1)
  }

  return date.toISOString()
}
