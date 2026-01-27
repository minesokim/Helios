import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Subscription = Database['public']['Tables']['subscriptions']['Row']
type SubscriptionInsert = Database['public']['Tables']['subscriptions']['Insert']

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

interface TransactionGroup {
  merchantName: string
  normalizedName: string
  transactions: Transaction[]
  averageAmount: number
  frequency: Frequency | null
  intervalDays: number
  confidence: number
}

interface DetectedSubscription {
  merchantName: string
  normalizedName: string
  amount: number
  frequency: Frequency
  billingDay: number | null
  firstSeenAt: string
  lastChargedAt: string
  nextExpectedAt: string
  categoryId: string | null
  confidence: number
}

// Normalize merchant names to group similar transactions
function normalizeMerchantName(name: string): string {
  let normalized = name.toLowerCase().trim()

  // Remove common prefixes/suffixes
  normalized = normalized
    .replace(/^(www\.|https?:\/\/)/gi, '')
    .replace(/\s*(inc|llc|ltd|corp|corporation|co)\.?\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Remove special characters and numbers at the end (like transaction IDs)
  normalized = normalized.replace(/[#*\d]+$/, '').trim()

  return normalized
}

// Calculate the average interval between transactions in days
function calculateInterval(transactions: Transaction[]): number {
  if (transactions.length < 2) return 0

  const sortedDates = transactions
    .map((t) => new Date(t.date).getTime())
    .sort((a, b) => a - b)

  const intervals: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    const diffMs = sortedDates[i] - sortedDates[i - 1]
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    intervals.push(diffDays)
  }

  return intervals.reduce((sum, val) => sum + val, 0) / intervals.length
}

// Determine frequency based on average interval
function determineFrequency(avgIntervalDays: number): Frequency | null {
  const tolerance = 3 // Allow 3 days variance

  if (Math.abs(avgIntervalDays - 7) <= tolerance) return 'weekly'
  if (Math.abs(avgIntervalDays - 14) <= tolerance) return 'biweekly'
  if (avgIntervalDays >= 28 && avgIntervalDays <= 31) return 'monthly'
  if (avgIntervalDays >= 89 && avgIntervalDays <= 92) return 'quarterly'
  if (avgIntervalDays >= 360 && avgIntervalDays <= 370) return 'yearly'

  return null
}

// Calculate confidence score for subscription detection
function calculateConfidence(group: TransactionGroup): number {
  let confidence = 0

  // More transactions = higher confidence
  if (group.transactions.length >= 4) confidence += 0.4
  else if (group.transactions.length === 3) confidence += 0.3
  else if (group.transactions.length === 2) confidence += 0.2

  // Consistent frequency = higher confidence
  if (group.frequency) confidence += 0.3

  // Consistent amount = higher confidence
  const amounts = group.transactions.map((t) => Math.abs(t.amount))
  const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
  const variance = amounts.reduce((sum, a) => sum + Math.pow(a - avgAmount, 2), 0) / amounts.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = stdDev / avgAmount

  if (coefficientOfVariation < 0.05) confidence += 0.3 // Very consistent
  else if (coefficientOfVariation < 0.1) confidence += 0.2
  else if (coefficientOfVariation < 0.2) confidence += 0.1

  return Math.min(confidence, 1.0)
}

// Calculate next expected charge date
function calculateNextExpectedDate(
  lastDate: string,
  frequency: Frequency
): string {
  const last = new Date(lastDate)
  const next = new Date(last)

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'biweekly':
      next.setDate(next.getDate() + 14)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3)
      break
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1)
      break
  }

  return next.toISOString().split('T')[0]
}

// Group transactions by merchant
function groupTransactionsByMerchant(
  transactions: Transaction[]
): TransactionGroup[] {
  const groups = new Map<string, Transaction[]>()

  // Group by normalized merchant name
  for (const tx of transactions) {
    const merchantName = tx.merchant_name || tx.description
    const normalized = normalizeMerchantName(merchantName)

    if (!groups.has(normalized)) {
      groups.set(normalized, [])
    }
    groups.get(normalized)!.push(tx)
  }

  // Analyze each group
  const results: TransactionGroup[] = []

  for (const [normalizedName, txs] of groups.entries()) {
    if (txs.length < 2) continue // Need at least 2 transactions to detect pattern

    const sortedTxs = txs.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    const intervalDays = calculateInterval(sortedTxs)
    const frequency = determineFrequency(intervalDays)

    // Skip if no recognizable frequency pattern
    if (!frequency) continue

    const amounts = sortedTxs.map((t) => Math.abs(t.amount))
    const averageAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length

    const group: TransactionGroup = {
      merchantName: txs[0].merchant_name || txs[0].description,
      normalizedName,
      transactions: sortedTxs,
      averageAmount,
      frequency,
      intervalDays,
      confidence: 0,
    }

    group.confidence = calculateConfidence(group)

    // Only include subscriptions with reasonable confidence
    if (group.confidence >= 0.5) {
      results.push(group)
    }
  }

  return results
}

// Detect subscriptions from user's transactions
export async function detectSubscriptions(
  userId: string,
  options: {
    lookbackDays?: number
    minConfidence?: number
  } = {}
): Promise<DetectedSubscription[]> {
  const { lookbackDays = 180, minConfidence = 0.5 } = options

  const supabase = await createClient()

  // Fetch recent transactions (expenses only)
  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays)

  const txResult = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .lt('amount', 0) // Only expenses
    .gte('date', lookbackDate.toISOString().split('T')[0])
    .is('deleted_at', null)
    .order('date', { ascending: false })

  const transactions = txResult.data as Transaction[] | null
  const error = txResult.error

  if (error || !transactions || transactions.length === 0) {
    return []
  }

  // Group and analyze transactions
  const groups = groupTransactionsByMerchant(transactions)

  // Convert to subscription format
  const detected: DetectedSubscription[] = groups
    .filter((g) => g.confidence >= minConfidence)
    .map((g) => {
      const firstTx = g.transactions[0]
      const lastTx = g.transactions[g.transactions.length - 1]

      // Extract billing day from last transaction
      const lastDate = new Date(lastTx.date)
      const billingDay = lastDate.getDate()

      return {
        merchantName: g.merchantName,
        normalizedName: g.normalizedName,
        amount: Math.abs(g.averageAmount),
        frequency: g.frequency!,
        billingDay: g.frequency === 'monthly' ? billingDay : null,
        firstSeenAt: firstTx.date,
        lastChargedAt: lastTx.date,
        nextExpectedAt: calculateNextExpectedDate(lastTx.date, g.frequency!),
        categoryId: lastTx.category_id,
        confidence: g.confidence,
      }
    })
    .sort((a, b) => b.amount - a.amount) // Sort by amount descending

  return detected
}

// Sync detected subscriptions to database
export async function syncSubscriptionsToDatabase(
  userId: string,
  detected: DetectedSubscription[]
): Promise<{ created: number; updated: number; errors: number }> {
  const supabase = await createClient()

  let created = 0
  let updated = 0
  let errors = 0

  // Fetch existing subscriptions
  const existingResult = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)

  const existing = existingResult.data as Subscription[] | null

  const existingMap = new Map(
    (existing || []).map((s) => [s.normalized_name, s])
  )

  for (const sub of detected) {
    const existingSub = existingMap.get(sub.normalizedName)

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          amount: sub.amount,
          frequency: sub.frequency,
          billing_day: sub.billingDay,
          last_charged_at: sub.lastChargedAt,
          next_expected_at: sub.nextExpectedAt,
          category_id: sub.categoryId,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', existingSub.id)

      if (updateError) {
        errors++
      } else {
        updated++
      }
    } else {
      // Create new subscription
      const newSub: SubscriptionInsert = {
        user_id: userId,
        merchant_name: sub.merchantName,
        normalized_name: sub.normalizedName,
        amount: sub.amount,
        frequency: sub.frequency,
        billing_day: sub.billingDay,
        status: 'active',
        first_seen_at: sub.firstSeenAt,
        last_charged_at: sub.lastChargedAt,
        next_expected_at: sub.nextExpectedAt,
        category_id: sub.categoryId,
      }

      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert(newSub as never)

      if (insertError) {
        errors++
      } else {
        created++
      }
    }
  }

  return { created, updated, errors }
}

// Main function to detect and sync subscriptions
export async function detectAndSyncSubscriptions(
  userId: string
): Promise<{ detected: number; created: number; updated: number; errors: number }> {
  const detected = await detectSubscriptions(userId)
  const { created, updated, errors } = await syncSubscriptionsToDatabase(userId, detected)

  return {
    detected: detected.length,
    created,
    updated,
    errors,
  }
}
