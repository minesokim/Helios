import { getJsonResponse, MODELS } from '@/lib/ai/claude'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Category = Database['public']['Tables']['transaction_categories']['Row']

interface CategorizationResult {
  transactionId: string
  categorySlug: string
  confidence: number
  reasoning?: string
}

// Categorize a batch of transactions using Haiku (cost-effective)
export async function categorizeTransactions(
  transactions: Transaction[],
  categories: Category[]
): Promise<CategorizationResult[]> {
  if (transactions.length === 0) return []

  // Build category reference for the prompt
  const categoryList = categories
    .filter((c) => c.slug !== 'uncategorized')
    .map((c) => `- ${c.slug}: ${c.name}`)
    .join('\n')

  // Build transaction list
  const transactionList = transactions
    .map((t, i) => `${i + 1}. "${t.description}" | ${t.merchant_name || 'N/A'} | $${Math.abs(t.amount).toFixed(2)} | ${t.amount > 0 ? 'income' : 'expense'}`)
    .join('\n')

  const prompt = `Categorize these financial transactions into the most appropriate category. Return a JSON array.

Available Categories:
${categoryList}

Transactions to categorize:
${transactionList}

Examples of good categorizations:
- "NETFLIX", "Spotify", "Disney+", "HBO Max" -> streaming-services
- "AMAZON WEB SERVICES", "GITHUB", "VERCEL", "Figma", "Adobe" -> software-saas
- "UBER", "LYFT" -> uber-lyft
- "United Airlines", "Delta", "Southwest" -> flights
- "Hotels.com", "Marriott", "Airbnb" -> hotels-lodging
- "DOORDASH", "UBEREATS", "Grubhub" -> food-delivery
- "CHIPOTLE", "Starbucks", "McDonalds" -> restaurants or coffee-shops or fast-food
- "WHOLE FOODS", "Trader Joe's", "Costco" -> groceries
- "Payroll", "Direct Deposit", "Salary" -> salary-wages
- "Invoice Payment", "Client Payment" -> freelance-contract or business-income
- "Transfer to Savings", "Zelle", "Venmo transfer" -> account-transfer
- "AT&T", "Verizon", "T-Mobile" -> phone-mobile
- "Comcast", "Spectrum" -> internet
- "PG&E", "Edison" -> electric
- "Google Ads", "Facebook Ads", "Meta Ads" -> advertising-marketing
- "State Farm", "Geico", "Progressive" -> car-insurance
- "Amazon.com" (general shopping) -> amazon
- "Target", "Walmart" -> general-merchandise
- "Apple Store", "Best Buy" -> electronics
- "Gym", "Planet Fitness", "Equinox" -> gym-fitness
- "CVS", "Walgreens" -> pharmacy
- "ATM Withdrawal", "Cash" -> atm-withdrawals or cash-atm
- "Interest", "Dividends" -> interest-dividends
- "Refund" -> refunds-reimbursements

Return format (JSON array only, no other text):
[{"index": 1, "categorySlug": "streaming-services", "confidence": 0.95}]

Rules:
1. ALWAYS pick the best matching category from the list above - use "miscellaneous" only as last resort
2. Pick the MOST SPECIFIC subcategory when possible (e.g., "coffee-shops" instead of "food-dining")
3. For income transactions (positive amounts), use income-related categories like salary-wages, freelance-contract, business-income
4. For transfers between accounts, use account-transfer or transfer-in/transfer-out
5. Match the categorySlug EXACTLY to one from the Available Categories list`

  try {
    const results = await getJsonResponse<Array<{
      index: number
      categorySlug: string
      confidence: number
    }>>(prompt, {
      model: MODELS.HAIKU,
      system: 'You are a financial categorization assistant. Return only valid JSON arrays.',
    })

    return results.map((r) => ({
      transactionId: transactions[r.index - 1].id,
      categorySlug: r.categorySlug,
      confidence: r.confidence,
    }))
  } catch (error) {
    console.error('Categorization error:', error)
    // Return uncategorized for all on error
    return transactions.map((t) => ({
      transactionId: t.id,
      categorySlug: 'uncategorized',
      confidence: 0,
    }))
  }
}

// Categorize uncategorized transactions for a user
// Now processes ALL uncategorized transactions in batches
// Also handles orphaned category_ids (pointing to deleted categories)
export async function categorizeUncategorizedTransactions(
  userId: string,
  batchSize: number = 50
): Promise<{ categorized: number; errors: number; total: number }> {
  const supabase = await createClient()

  // Fetch transactions with their category join to detect orphaned category_ids
  // A transaction is "uncategorized" if:
  // 1. category_id is NULL, OR
  // 2. category_id points to a non-existent category (orphaned)
  type TransactionWithCategory = Transaction & {
    category: { id: string } | null
  }

  const txResult = await supabase
    .from('transactions')
    .select(`
      *,
      category:transaction_categories(id)
    `)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('date', { ascending: false })

  const txError = txResult.error
  const rawData = txResult.data as TransactionWithCategory[] | null

  if (txError) {
    console.error('Error fetching transactions:', txError)
    return { categorized: 0, errors: 0, total: 0 }
  }

  if (!rawData || rawData.length === 0) {
    return { categorized: 0, errors: 0, total: 0 }
  }

  // Filter to only transactions that need categorization
  // (category_id is null OR category join returned null - orphaned)
  const uncategorizedData = rawData.filter(tx =>
    tx.category_id === null || tx.category === null
  )

  if (uncategorizedData.length === 0) {
    return { categorized: 0, errors: 0, total: 0 }
  }

  // Clear orphaned category_ids before processing
  const orphanedTxIds = uncategorizedData
    .filter(tx => tx.category_id !== null && tx.category === null)
    .map(tx => tx.id)

  if (orphanedTxIds.length > 0) {
    console.log(`Clearing ${orphanedTxIds.length} orphaned category_ids`)
    await supabase
      .from('transactions')
      .update({ category_id: null } as never)
      .in('id', orphanedTxIds)
  }

  // Cast to Transaction[] for processing (strip the category join field)
  const allTransactions = uncategorizedData as Transaction[]

  const totalToProcess = allTransactions.length
  let totalCategorized = 0
  let totalErrors = 0

  // Process in batches
  for (let i = 0; i < allTransactions.length; i += batchSize) {
    const batch = allTransactions.slice(i, i + batchSize)
    const result = await processBatch(supabase, batch, userId)
    totalCategorized += result.categorized
    totalErrors += result.errors
  }

  return { categorized: totalCategorized, errors: totalErrors, total: totalToProcess }
}

async function processBatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  transactions: Transaction[],
  userId: string
): Promise<{ categorized: number; errors: number }> {
  if (transactions.length === 0) {
    return { categorized: 0, errors: 0 }
  }

  // Fetch categories
  const catResult = await supabase
    .from('transaction_categories')
    .select('*')
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .is('deleted_at', null)

  const categories = catResult.data as Category[] | null
  const catError = catResult.error

  if (catError || !categories) {
    return { categorized: 0, errors: 1 }
  }

  // Categorize
  const results = await categorizeTransactions(transactions, categories)

  // Update transactions with categories
  let categorized = 0
  let errors = 0

  for (const result of results) {
    const category = categories.find((c) => c.slug === result.categorySlug)

    if (!category) {
      console.log(`Category not found for slug: ${result.categorySlug}`)
      errors++
      continue
    }

    console.log(`Updating transaction ${result.transactionId} with category ${category.name} (${category.id})`)

    const updateResult = await supabase
      .from('transactions')
      .update({
        category_id: category.id,
        category_confidence: result.confidence,
        category_source: 'ai',
      } as never)
      .eq('id', result.transactionId)
      .select()

    const updateError = updateResult.error
    const updateData = updateResult.data

    if (updateError) {
      console.log(`Update error for ${result.transactionId}:`, updateError.message)
      errors++
    } else {
      console.log(`Updated transaction ${result.transactionId}, returned:`, updateData)
      categorized++
    }
  }

  return { categorized, errors }
}
