import { ToolDefinition } from '../types'
import { saveBriefingPref } from '@/services/ai/briefing'
import { generateMorningBriefing, generateProjectBriefing } from '@/services/briefings'

export const briefingTools: ToolDefinition[] = [
  {
    name: 'update_briefing_preference',
    description: 'Update what David wants included in his daily briefings. Use when he mentions wanting or not wanting certain topics in briefings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          description: "The topic (e.g., 'weather', 'tech news', 'crypto prices', 'calendar', 'business updates')",
        },
        enabled: {
          type: 'boolean',
          description: 'Whether to include this topic in briefings',
        },
        priority: {
          type: 'integer',
          description: 'Priority 1-10 (10 = show first)',
          minimum: 1,
          maximum: 10,
        },
        notes: {
          type: 'string',
          description: 'Any specific instructions for this topic',
        },
      },
      required: ['topic', 'enabled'],
    },
    handler: async (params, context) => {
      await saveBriefingPref(
        context.userId,
        params.topic as string,
        params.enabled as boolean,
        (params.priority as number) || 5,
        params.notes as string | undefined
      )
      const action = params.enabled ? 'added to' : 'removed from'
      return `Briefing preference updated: '${params.topic}' ${action} briefings`
    },
  },
  {
    name: 'get_briefing',
    description: "Get a morning briefing or project-specific status update. Use when David says 'good morning', asks for a briefing, or asks about project status. Morning briefings include urgent items, blockers, calendar, and suggestions.",
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['morning', 'project'],
          description: "'morning' for daily briefing, 'project' for project-specific update",
        },
        project_name: {
          type: 'string',
          description: "Required if type is 'project' - the name of the project to brief on",
        },
      },
      required: ['type'],
    },
    handler: async (params, context) => {
      // Get Google tokens for calendar/email access
      const { data: googleCreds } = await context.supabase
        .from('google_oauth_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', context.userId)
        .single() as { data: { access_token: string; refresh_token: string } | null }

      if (params.type === 'morning') {
        const briefing = await generateMorningBriefing(
          context.userId,
          googleCreds?.access_token,
          googleCreds?.refresh_token
        )
        return briefing.summary
      } else if (params.type === 'project' && params.project_name) {
        return await generateProjectBriefing(
          context.userId,
          params.project_name as string,
          googleCreds?.access_token,
          googleCreds?.refresh_token
        )
      }
      return 'Please specify briefing type (morning or project) and project name if applicable.'
    },
  },
]
