import { ToolDefinition } from '../types'
import { webSearch } from '@/services/ai/search'

export const searchTools: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Use this for: local businesses, current events, weather, prices, reviews, recent news, or anything that requires up-to-date information.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up',
        },
      },
      required: ['query'],
    },
    handler: async (params) => {
      return await webSearch(params.query as string)
    },
  },
]
