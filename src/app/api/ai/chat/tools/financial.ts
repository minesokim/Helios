import { ToolDefinition } from '../types'
import { getTransactionsByDateRange } from '@/services/ai/context'

export const financialTools: ToolDefinition[] = [
  {
    name: 'query_transactions',
    description: "Search David's bank transactions by date range and optionally by category. Use when he asks about spending, purchases, or financial history.",
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
        category: {
          type: 'string',
          description: 'Optional category filter (e.g., "Food & Dining", "Shopping", "Transportation")',
        },
      },
      required: ['start_date', 'end_date'],
    },
    handler: async (params, context) => {
      const transactions = await getTransactionsByDateRange(
        context.userId,
        params.start_date as string,
        params.end_date as string,
        params.category as string | undefined
      )
      if (!transactions || transactions.length === 0) {
        return 'No transactions found for that period.'
      }
      const txSummary = transactions.slice(0, 20).map(t =>
        `${t.date}: ${t.merchant_name || t.description} $${t.amount}`
      ).join('\n')
      const total = transactions.reduce((sum, t) => sum + t.amount, 0)
      return `Found ${transactions.length} transactions (showing first 20):\n${txSummary}\n\nTotal: $${total.toLocaleString()}`
    },
  },
  {
    name: 'generate_financial_report',
    description: "Generate a downloadable PDF financial report. ALWAYS use this tool when David asks for: PDF, download, report download, financial report, make me a report, generate report, subscription report, or any variation of wanting a downloadable document. This creates a real PDF file the user can download.",
    input_schema: {
      type: 'object' as const,
      properties: {
        months: {
          type: 'integer',
          description: 'Number of months to analyze (default 3)',
          minimum: 1,
          maximum: 12,
        },
        type: {
          type: 'string',
          enum: ['subscription_analysis', 'full_summary'],
          description: 'Type of report: subscription_analysis focuses on recurring payments, full_summary is comprehensive',
        },
      },
      required: [],
    },
    handler: async (params, context) => {
      console.log('[Tool] generate_financial_report called')
      const months = (params.months as number) || 3
      const reportType = (params.type as string) || 'subscription_analysis'

      // Generate the report URL for the user to download
      const reportUrl = `/api/reports/generate?months=${months}&type=${reportType}`
      console.log('[Tool] Report URL:', reportUrl)

      // Also provide a summary from the data we have in context
      const endDate = new Date()
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - months)

      const { data: transactionsData } = await context.supabase
        .from('transactions')
        .select('id, date, description, amount, merchant_name')
        .eq('user_id', context.userId)
        .is('deleted_at', null)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: false })

      const transactions = transactionsData as { id: string; date: string; description: string; amount: number; merchant_name: string | null }[] | null

      if (!transactions || transactions.length === 0) {
        return 'No transactions found for the selected period. Please make sure your bank account is connected and synced.'
      }

      // Calculate summary
      const totalExpenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
      const totalIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)

      // Find recurring
      const merchantCounts: Record<string, number> = {}
      transactions.forEach(t => {
        if (t.amount < 0) {
          const m = (t.merchant_name || t.description).toUpperCase().substring(0, 30)
          merchantCounts[m] = (merchantCounts[m] || 0) + 1
        }
      })
      const recurringCount = Object.values(merchantCounts).filter(c => c >= 2).length

      return `REPORT_READY:${reportUrl}

Summary: ${transactions.length} transactions, ${months} months. Net: ${totalIncome - totalExpenses >= 0 ? '+' : ''}$${(totalIncome - totalExpenses).toLocaleString()}. ${recurringCount} subscriptions found.

NOTE TO AI: Keep your response VERY SHORT (1 sentence max). Just say something like "Your report is ready" or "Here's your 3-month report". Do NOT list findings or summarize data. The PDF download button appears automatically.`
    },
  },
]
