import { ToolDefinition } from '../types'
import { saveMemory, MemoryCategory } from '@/services/ai/memory'
import { searchConversations } from '@/services/ai/conversation'

export const memoryTools: ToolDefinition[] = [
  {
    name: 'save_memory',
    description: "Save an important fact or preference about David to remember for future conversations. Use this when David shares personal information, preferences, habits, goals, or anything that would be useful to remember. Categories: 'personal' (facts about him), 'preferences' (likes/dislikes), 'work' (business/career), 'communication' (how he likes to interact), 'briefing' (what he wants in briefings), 'goals' (what he's working toward).",
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          enum: ['personal', 'preferences', 'work', 'communication', 'briefing', 'goals'],
          description: 'Category of the memory',
        },
        content: {
          type: 'string',
          description: 'The fact or preference to remember (be specific and concise)',
        },
        importance: {
          type: 'integer',
          description: 'Importance level 1-10 (10 = critical to remember)',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['category', 'content', 'importance'],
    },
    handler: async (params, context) => {
      await saveMemory(
        context.userId,
        params.category as MemoryCategory,
        params.content as string,
        (params.importance as number) || 5,
        context.conversationId
      )
      return `Memory saved: ${(params.content as string).substring(0, 50)}...`
    },
  },
  {
    name: 'search_past_conversations',
    description: "Search through David's past conversations with you (Jorkel) and his previous Claude conversations. Use this when David asks about something you discussed before, references a past conversation, or when you need to recall context from earlier discussions. This includes 3400+ imported messages from his Claude history.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search terms to find in past conversations (e.g., "Mary Cramer proposal", "tennis", "pricing")',
        },
      },
      required: ['query'],
    },
    handler: async (params, context) => {
      const results = await searchConversations(context.userId, params.query as string, 5)
      if (results.length === 0) {
        return `No past conversations found mentioning "${params.query}".`
      }
      const formatted = results.map(r =>
        `[${r.date}] ${r.title}\n"${r.snippet}"`
      ).join('\n\n')
      return `Found ${results.length} relevant past conversations:\n\n${formatted}`
    },
  },
]
