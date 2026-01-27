import { createClient } from '@/lib/supabase/server'

// API Cost Pricing (per unit, in USD)
export const API_COSTS = {
  // Claude pricing (per 1M tokens)
  claude: {
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
    'claude-3-5-haiku': { input: 0.80, output: 4.00 },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
    'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  },
  // Grok (xAI) pricing (per 1M tokens) - estimated
  grok: {
    'grok-4-1-fast-non-reasoning': { input: 0.50, output: 1.50 },
    'grok-4-1-fast-reasoning': { input: 1.00, output: 3.00 },
    'grok-4-fast-non-reasoning': { input: 0.50, output: 1.50 },
    'grok-4-fast-reasoning': { input: 1.00, output: 3.00 },
    'grok-3': { input: 3.00, output: 15.00 },
    'grok-3-mini': { input: 0.30, output: 0.50 },
  },
  // OpenAI pricing (per 1M tokens)
  openai: {
    'text-embedding-3-small': { input: 0.02, output: 0 },
    'text-embedding-3-large': { input: 0.13, output: 0 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
  },
  // ElevenLabs TTS (per 1K characters) - legacy
  elevenlabs: {
    'eleven_multilingual_v2': 0.30,
    'eleven_turbo_v2': 0.18,
    'eleven_turbo_v2_5': 0.18,
  },
  // Qwen3-TTS via AI/ML API (per 1K characters)
  qwen: {
    'qwen3-tts-flash': 0.015,
  },
} as const

export type ApiProvider = 'claude' | 'grok' | 'openai' | 'elevenlabs' | 'qwen' | 'google_drive' | 'teller'

export interface UsageRecord {
  api_provider: ApiProvider
  api_endpoint: string
  model?: string
  input_tokens?: number
  output_tokens?: number
  audio_seconds?: number
  api_calls?: number
  request_type?: string
  success?: boolean
  error_message?: string
}

export interface BudgetStatus {
  allowed: boolean
  reason: string | null
  currentUsage: number
  budgetLimit: number
  usagePercent: number
  isNearLimit: boolean
  isOverLimit: boolean
}

export interface UsageSummary {
  totalCost: number
  providerBreakdown: Record<string, number>
  requestCount: number
  budgetLimit: number
  usagePercent: number
  daysRemaining: number
  // All-time stats
  allTimeCost: number
  allTimeRequests: number
  allTimeProviderBreakdown: Record<string, number>
}

// Default budget settings
const DEFAULT_BUDGET = 50.00 // $50/month
const DEFAULT_DAILY_LIMIT = 10.00 // $10/day
const WARNING_THRESHOLD = 80 // 80%

/**
 * Calculate cost for a Claude API call
 */
export function calculateClaudeCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = API_COSTS.claude[model as keyof typeof API_COSTS.claude]
  if (!pricing) return 0.01 // Default small cost if model not found

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Calculate cost for OpenAI embeddings
 */
export function calculateOpenAICost(
  model: string,
  tokens: number
): number {
  const pricing = API_COSTS.openai[model as keyof typeof API_COSTS.openai]
  if (!pricing) return 0

  return (tokens / 1_000_000) * pricing.input
}

/**
 * Calculate cost for ElevenLabs TTS
 */
export function calculateElevenLabsCost(
  model: string,
  characters: number
): number {
  const pricing = API_COSTS.elevenlabs[model as keyof typeof API_COSTS.elevenlabs]
  if (!pricing) return 0.01 // Default small cost

  return (characters / 1_000) * pricing
}

/**
 * Check if user can make an API request
 * Simplified version that defaults to allowing requests
 */
export async function checkBudget(
  userId: string,
  estimatedCost: number = 0.001
): Promise<BudgetStatus> {
  try {
    const supabase = await createClient()

    // Get current month's usage
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: usageData } = await (supabase as any)
      .from('api_usage')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString()) as { data: { cost_usd: number }[] | null }

    const totalUsage = usageData?.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0) || 0

    // Get budget settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (supabase as any)
      .from('budget_settings')
      .select('monthly_budget_usd, hard_limit_enabled')
      .eq('user_id', userId)
      .single() as { data: { monthly_budget_usd: number; hard_limit_enabled: boolean } | null }

    const budgetLimit = settings?.monthly_budget_usd ?? DEFAULT_BUDGET
    const hardLimitEnabled = settings?.hard_limit_enabled ?? false
    const usagePercent = budgetLimit > 0 ? (totalUsage / budgetLimit) * 100 : 0

    // Check if over budget
    const isOverLimit = totalUsage + estimatedCost > budgetLimit
    const isNearLimit = usagePercent >= WARNING_THRESHOLD

    // Only block if hard limit is enabled and over budget
    if (hardLimitEnabled && isOverLimit) {
      return {
        allowed: false,
        reason: `Monthly budget of $${budgetLimit.toFixed(2)} exceeded`,
        currentUsage: totalUsage,
        budgetLimit,
        usagePercent,
        isNearLimit,
        isOverLimit: true,
      }
    }

    return {
      allowed: true,
      reason: null,
      currentUsage: totalUsage,
      budgetLimit,
      usagePercent,
      isNearLimit,
      isOverLimit,
    }
  } catch (error) {
    // Default to allowed if check fails (fail open for user experience)
    console.error('Budget check failed:', error)
    return {
      allowed: true,
      reason: null,
      currentUsage: 0,
      budgetLimit: DEFAULT_BUDGET,
      usagePercent: 0,
      isNearLimit: false,
      isOverLimit: false,
    }
  }
}

/**
 * Record API usage
 */
export async function recordUsage(
  userId: string,
  usage: UsageRecord
): Promise<void> {
  try {
    const supabase = await createClient()

    // Calculate cost based on provider and model
    let cost = 0
    if (usage.api_provider === 'claude' && usage.model) {
      cost = calculateClaudeCost(
        usage.model,
        usage.input_tokens || 0,
        usage.output_tokens || 0
      )
    } else if (usage.api_provider === 'grok' && usage.model) {
      // Grok uses same calculation as Claude
      const pricing = API_COSTS.grok[usage.model as keyof typeof API_COSTS.grok]
      if (pricing) {
        cost = ((usage.input_tokens || 0) / 1_000_000) * pricing.input +
               ((usage.output_tokens || 0) / 1_000_000) * pricing.output
      } else {
        cost = 0.001 // Small default cost
      }
    } else if (usage.api_provider === 'openai' && usage.model) {
      cost = calculateOpenAICost(usage.model, usage.input_tokens || 0)
    } else if (usage.api_provider === 'elevenlabs' && usage.model) {
      // Convert audio seconds to estimated characters (150 chars/sec average)
      const chars = (usage.audio_seconds || 0) * 150
      cost = calculateElevenLabsCost(usage.model, chars)
    } else if (usage.api_provider === 'qwen' && usage.model) {
      // Qwen TTS pricing (per 1K characters)
      const chars = (usage.audio_seconds || 0) * 150
      const pricing = API_COSTS.qwen[usage.model as keyof typeof API_COSTS.qwen]
      cost = pricing ? (chars / 1000) * pricing : 0.001
    }

    // Insert usage record - use type assertion since table may not exist yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('api_usage').insert({
      user_id: userId,
      api_provider: usage.api_provider,
      api_endpoint: usage.api_endpoint,
      model: usage.model,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      audio_seconds: usage.audio_seconds || 0,
      api_calls: usage.api_calls || 1,
      cost_usd: cost,
      request_type: usage.request_type,
      success: usage.success ?? true,
      error_message: usage.error_message,
    })
  } catch (error) {
    // Don't fail the request if usage tracking fails
    console.error('Failed to record usage:', error)
  }
}

/**
 * Get usage summary (both monthly and all-time)
 */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  try {
    const supabase = await createClient()

    // Get current month's usage
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // Get monthly usage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: monthlyData } = await (supabase as any)
      .from('api_usage')
      .select('cost_usd, api_provider, api_calls')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString()) as { data: { cost_usd: number; api_provider: string; api_calls: number }[] | null }

    // Get ALL-TIME usage (no date filter)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allTimeData } = await (supabase as any)
      .from('api_usage')
      .select('cost_usd, api_provider, api_calls')
      .eq('user_id', userId) as { data: { cost_usd: number; api_provider: string; api_calls: number }[] | null }

    // Calculate monthly totals
    let totalCost = 0
    let requestCount = 0
    const providerBreakdown: Record<string, number> = {}

    monthlyData?.forEach((row) => {
      const cost = Number(row.cost_usd || 0)
      totalCost += cost
      requestCount += row.api_calls || 1
      if (row.api_provider) {
        providerBreakdown[row.api_provider] = (providerBreakdown[row.api_provider] || 0) + cost
      }
    })

    // Calculate all-time totals
    let allTimeCost = 0
    let allTimeRequests = 0
    const allTimeProviderBreakdown: Record<string, number> = {}

    allTimeData?.forEach((row) => {
      const cost = Number(row.cost_usd || 0)
      allTimeCost += cost
      allTimeRequests += row.api_calls || 1
      if (row.api_provider) {
        allTimeProviderBreakdown[row.api_provider] = (allTimeProviderBreakdown[row.api_provider] || 0) + cost
      }
    })

    // Get budget settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (supabase as any)
      .from('budget_settings')
      .select('monthly_budget_usd')
      .eq('user_id', userId)
      .single() as { data: { monthly_budget_usd: number } | null }

    const budgetLimit = settings?.monthly_budget_usd ?? DEFAULT_BUDGET

    // Calculate days remaining in month
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysRemaining = endOfMonth.getDate() - now.getDate()

    return {
      totalCost,
      providerBreakdown,
      requestCount,
      budgetLimit,
      usagePercent: budgetLimit > 0 ? (totalCost / budgetLimit) * 100 : 0,
      daysRemaining,
      allTimeCost,
      allTimeRequests,
      allTimeProviderBreakdown,
    }
  } catch (error) {
    console.error('Failed to get usage summary:', error)
    return {
      totalCost: 0,
      providerBreakdown: {},
      requestCount: 0,
      budgetLimit: DEFAULT_BUDGET,
      usagePercent: 0,
      daysRemaining: 30,
      allTimeCost: 0,
      allTimeRequests: 0,
      allTimeProviderBreakdown: {},
    }
  }
}

/**
 * Get or create budget settings for a user
 */
export async function getBudgetSettings(userId: string) {
  try {
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('budget_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code === 'PGRST116') {
      // No settings found, create defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newSettings } = await (supabase as any)
        .from('budget_settings')
        .insert({
          user_id: userId,
          monthly_budget_usd: DEFAULT_BUDGET,
          soft_limit_percent: WARNING_THRESHOLD,
          hard_limit_enabled: false,
          daily_limit_usd: DEFAULT_DAILY_LIMIT,
          max_requests_per_minute: 20,
          max_requests_per_hour: 200,
        })
        .select()
        .single()

      return newSettings
    }

    return data
  } catch (error) {
    console.error('Failed to get budget settings:', error)
    return null
  }
}

/**
 * Update budget settings
 */
export async function updateBudgetSettings(
  userId: string,
  settings: {
    monthly_budget_usd?: number
    soft_limit_percent?: number
    hard_limit_enabled?: boolean
    daily_limit_usd?: number
    max_requests_per_minute?: number
    max_requests_per_hour?: number
  }
) {
  try {
    const supabase = await createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('budget_settings')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Failed to update budget settings:', error)
    throw error
  }
}

/**
 * Get usage history for charts
 */
export async function getUsageHistory(
  userId: string,
  days: number = 30
): Promise<{ date: string; cost: number; provider: string }[]> {
  try {
    const supabase = await createClient()

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('api_usage')
      .select('created_at, cost_usd, api_provider')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true }) as { data: { created_at: string; cost_usd: number; api_provider: string }[] | null }

    if (!data) return []

    return data.map((row) => ({
      date: row.created_at.split('T')[0],
      cost: Number(row.cost_usd),
      provider: row.api_provider,
    }))
  } catch (error) {
    console.error('Failed to get usage history:', error)
    return []
  }
}
