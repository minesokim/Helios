import Anthropic from '@anthropic-ai/sdk'

// Tool context passed to all handlers
export interface ToolContext {
  userId: string
  conversationId: string
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
}

// Tool definition with handler
export interface ToolDefinition {
  name: string
  description: string
  input_schema: Anthropic.Tool['input_schema']
  handler: (params: Record<string, unknown>, context: ToolContext) => Promise<string>
}

// Message types for conversation
export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// Chat request body
export interface ChatRequest {
  message: string
  conversationId?: string
  budgetOverride?: boolean
  inputSource?: 'typed' | 'voice'
}

// Chat response
export interface ChatResponse {
  response: string
  conversationId: string
  budgetWarning?: string | null
  reportUrl?: string | null
}

// Budget status
export interface BudgetStatus {
  allowed: boolean
  isNearLimit: boolean
  usagePercent: number
  reason: string | null
}
