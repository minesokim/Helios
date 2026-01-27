/**
 * Client Management AI Tools
 *
 * Tools for the AI to proactively suggest and manage clients:
 * - suggest_client: Create a new client suggestion from conversation
 * - get_client_suggestions: Get pending suggestions to review
 * - list_clients: Get current client list
 */

import { ToolDefinition } from '../types'
import { createClient } from '@/lib/supabase/server'
import { getPendingSuggestions } from '@/services/clients/suggestion-detector'

export const clientTools: ToolDefinition[] = [
  {
    name: 'suggest_client',
    description: `Suggest a new client when David mentions working with someone new. Use this when David talks about:
- A new client or prospect he's working with
- A company that hired him or reached out
- Someone he's building a project for
- A business contact that could be a client

Do NOT use for:
- Personal contacts or friends
- Service providers (his vendors, not his clients)
- One-off mentions without business context`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Name of the client or contact person',
        },
        company: {
          type: 'string',
          description: 'Company or business name (if different from name)',
        },
        email: {
          type: 'string',
          description: 'Email address if mentioned',
        },
        type: {
          type: 'string',
          enum: ['company', 'individual'],
          description: 'Whether this is a company or individual client',
        },
        context: {
          type: 'string',
          description: 'Brief context about why this is being suggested as a client (what David said)',
        },
      },
      required: ['name', 'type', 'context'],
    },
    handler: async (params, context) => {
      const supabase = await createClient()

      // Check if client or suggestion already exists
      const name = params.name as string
      const email = params.email as string | undefined
      const company = params.company as string | undefined

      // Check existing clients
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id, name')
        .eq('user_id', context.userId)
        .is('deleted_at', null)
        .or(
          email
            ? `email.eq.${email},name.ilike.%${name}%`
            : `name.ilike.%${name}%`
        )
        .limit(1)
        .single()

      if (existingClient) {
        return `${name} is already in your client list as "${existingClient.name}".`
      }

      // Check existing suggestions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingSuggestion } = await (supabase as any)
        .from('client_suggestions')
        .select('id, suggested_name')
        .eq('user_id', context.userId)
        .eq('status', 'pending')
        .or(
          email
            ? `suggested_email.eq.${email},suggested_name.ilike.%${name}%`
            : `suggested_name.ilike.%${name}%`
        )
        .limit(1)
        .single()

      if (existingSuggestion) {
        return `${name} is already in your pending suggestions. You can review it in the Clients section.`
      }

      // Create the suggestion
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('client_suggestions')
        .insert({
          user_id: context.userId,
          suggested_name: name,
          suggested_company: company,
          suggested_email: email,
          suggested_type: params.type as string,
          source: 'conversation',
          confidence: 0.8, // Higher confidence for direct mentions
          evidence: {
            mentions: [{
              context: params.context as string,
              date: new Date().toISOString().split('T')[0],
            }],
          },
          status: 'pending',
        })

      if (error) {
        console.error('Failed to create client suggestion:', error)
        return 'I noted that, but there was an issue saving the suggestion. I\'ll try again later.'
      }

      const companyNote = company && company !== name ? ` (${company})` : ''
      return `Got it, I've noted ${name}${companyNote} as a potential client. You can review and add them in your Clients section.`
    },
  },
  {
    name: 'get_client_suggestions',
    description: 'Get pending client suggestions that David hasn\'t reviewed yet. Use when David asks about potential clients or wants to see who you\'ve detected.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Max number of suggestions to return (default 5)',
        },
      },
    },
    handler: async (params, context) => {
      const suggestions = await getPendingSuggestions(context.userId)
      const limit = (params.limit as number) || 5

      if (suggestions.length === 0) {
        return 'No pending client suggestions right now. I\'ll detect new ones from your emails, documents, and our conversations.'
      }

      const topSuggestions = suggestions.slice(0, limit)
      const lines = topSuggestions.map((s, i) => {
        const confidence = Math.round(s.confidence * 100)
        const source = s.source
        const email = s.suggested_email ? ` (${s.suggested_email})` : ''
        return `${i + 1}. ${s.suggested_name}${email} - ${confidence}% confidence from ${source}`
      })

      const remaining = suggestions.length - limit
      const footer = remaining > 0 ? `\n\nPlus ${remaining} more. Review all in the Clients section.` : '\n\nReview and approve these in the Clients section.'

      return `Found ${suggestions.length} potential clients:\n\n${lines.join('\n')}${footer}`
    },
  },
  {
    name: 'list_clients',
    description: 'Get the list of current clients with their status and basic info. Use when David asks about his clients, client list, or wants to know who he\'s working with.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['all', 'active', 'lead', 'paused', 'completed', 'churned'],
          description: 'Filter by status (default: all)',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Max number of clients to return (default 10)',
        },
      },
    },
    handler: async (params, context) => {
      const supabase = await createClient()
      const status = params.status as string
      const limit = (params.limit as number) || 10

      let query = supabase
        .from('clients')
        .select('id, name, company, status, total_revenue, monthly_retainer')
        .eq('user_id', context.userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (status && status !== 'all') {
        query = query.eq('status', status)
      }

      const { data: clients, error } = await query

      if (error) {
        console.error('Failed to fetch clients:', error)
        return 'Had trouble fetching your clients. Try again or check the Clients page.'
      }

      if (!clients || clients.length === 0) {
        if (status && status !== 'all') {
          return `No ${status} clients found.`
        }
        return 'No clients yet. When you mention working with someone new, I\'ll suggest adding them.'
      }

      const lines = clients.map((c, i) => {
        const displayName = c.company && c.company !== c.name
          ? `${c.name} (${c.company})`
          : c.name
        const statusBadge = `[${c.status}]`
        const revenue = c.total_revenue
          ? ` - $${Number(c.total_revenue).toLocaleString()}`
          : ''
        const retainer = c.monthly_retainer
          ? ` ($${Number(c.monthly_retainer).toLocaleString()}/mo)`
          : ''
        return `${i + 1}. ${displayName} ${statusBadge}${revenue}${retainer}`
      })

      const header = status && status !== 'all'
        ? `Your ${status} clients:`
        : `Your clients (${clients.length}):`

      return `${header}\n\n${lines.join('\n')}`
    },
  },
  {
    name: 'add_client',
    description: `Add a new client directly to the system. Use when David explicitly asks to add someone as a client, not just mentions them.

Use suggest_client for casual mentions. Use add_client only when David says something like:
- "Add X as a client"
- "Create a client for X"
- "Put X in my client list"`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Client name',
        },
        company: {
          type: 'string',
          description: 'Company name (if applicable)',
        },
        email: {
          type: 'string',
          description: 'Contact email',
        },
        status: {
          type: 'string',
          enum: ['lead', 'active', 'paused'],
          description: 'Client status (default: lead)',
        },
        monthly_retainer: {
          type: 'number',
          description: 'Monthly retainer amount if applicable',
        },
        notes: {
          type: 'string',
          description: 'Any notes about the client',
        },
      },
      required: ['name'],
    },
    handler: async (params, context) => {
      const supabase = await createClient()

      const { data: client, error } = await supabase
        .from('clients')
        .insert({
          user_id: context.userId,
          name: params.name as string,
          company: params.company as string | undefined,
          email: params.email as string | undefined,
          status: (params.status as string) || 'lead',
          monthly_retainer: params.monthly_retainer as number | undefined,
          notes: params.notes as string | undefined,
          source: 'ai_suggested',
          type: params.company ? 'company' : 'individual',
        })
        .select('id, name, status')
        .single()

      if (error) {
        console.error('Failed to create client:', error)
        return `Couldn't add ${params.name} as a client. There might be a duplicate or database issue.`
      }

      const statusText = client.status === 'active' ? 'as an active client' : `as a ${client.status}`
      return `Added ${client.name} ${statusText}. You can see them in your Clients section.`
    },
  },
]
