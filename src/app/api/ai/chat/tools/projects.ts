import { ToolDefinition } from '../types'
import {
  createProject,
  updateProject,
  getProjectByName,
  addBlocker,
  resolveBlocker,
  recordFollowUp,
  createContact,
  getContactByName,
  addWatchTrigger,
} from '@/services/projects'
import { draftFollowUpEmail } from '@/services/briefings'

export const projectTools: ToolDefinition[] = [
  {
    name: 'add_project',
    description: "Create or update a project to track. Use when David mentions starting a new project, getting a new client, or working on something he wants tracked.",
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Project name',
        },
        client: {
          type: 'string',
          description: 'Client or company name',
        },
        description: {
          type: 'string',
          description: 'Brief description of the project',
        },
        priority: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Priority 1-10 (10 = highest)',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format',
        },
      },
      required: ['name'],
    },
    handler: async (params, context) => {
      const project = await createProject(context.userId, {
        name: params.name as string,
        client: params.client as string | undefined,
        description: params.description as string | undefined,
        priority: (params.priority as number) || 5,
        due_date: params.due_date as string | undefined,
      })
      if (!project) {
        return 'Failed to create project. Please try again.'
      }
      let response = `Project "${project.name}" created`
      if (project.client) response += ` for ${project.client}`
      if (project.priority >= 8) response += ' (high priority)'
      return response
    },
  },
  {
    name: 'add_blocker',
    description: "Add a blocker to a project. Use when David mentions waiting on someone, being blocked by something, or needing something to proceed. Automatically updates project status to 'blocked'.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Name of the project being blocked',
        },
        type: {
          type: 'string',
          enum: ['waiting_on_person', 'waiting_on_client', 'external_approval', 'technical', 'dependency'],
          description: 'Type of blocker',
        },
        description: {
          type: 'string',
          description: 'What is blocking progress',
        },
        person: {
          type: 'string',
          description: 'Person being waited on (if applicable)',
        },
        person_email: {
          type: 'string',
          description: 'Email of the person being waited on',
        },
        missing_items: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific items or deliverables being waited for',
        },
      },
      required: ['project_name', 'type', 'description'],
    },
    handler: async (params, context) => {
      const project = await getProjectByName(context.userId, params.project_name as string)
      if (!project) {
        return `I don't have a project called "${params.project_name}". Should I create it first?`
      }

      // Create or get contact if person email provided
      let contactId: string | undefined
      if (params.person && params.person_email) {
        const existingContact = await getContactByName(context.userId, params.person as string)
        if (existingContact) {
          contactId = existingContact.id
        } else {
          const newContact = await createContact(context.userId, {
            name: params.person as string,
            email: params.person_email as string,
          })
          contactId = newContact?.id
        }
      }

      const blocker = await addBlocker(context.userId, project.id, {
        type: params.type as 'waiting_on_person' | 'waiting_on_client' | 'external_approval' | 'technical' | 'dependency',
        description: params.description as string,
        person: params.person as string | undefined,
        person_contact_id: contactId,
        missing_items: params.missing_items as string[] | undefined,
      })

      if (!blocker) {
        return 'Failed to add blocker. Please try again.'
      }

      let response = `Blocker added to ${project.name}: ${blocker.description}`
      if (blocker.person) response += `. Waiting on ${blocker.person}`
      return response
    },
  },
  {
    name: 'resolve_blocker',
    description: "Mark a blocker as resolved. Use when David mentions receiving what he was waiting for, getting approval, or a blocker being cleared.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Name of the project',
        },
        blocker_description: {
          type: 'string',
          description: 'Description or keywords to identify which blocker to resolve',
        },
        resolution_notes: {
          type: 'string',
          description: 'How it was resolved',
        },
      },
      required: ['project_name', 'blocker_description'],
    },
    handler: async (params, context) => {
      const project = await getProjectByName(context.userId, params.project_name as string)
      if (!project) {
        return `I don't have a project called "${params.project_name}".`
      }

      // Find the blocker by description match
      const { data: blockers } = await context.supabase
        .from('blockers')
        .select('id, description')
        .eq('project_id', project.id)
        .eq('user_id', context.userId)
        .eq('resolved', false) as { data: { id: string; description: string }[] | null }

      if (!blockers || blockers.length === 0) {
        return `No active blockers found for ${project.name}.`
      }

      // Find best matching blocker
      const searchTerms = (params.blocker_description as string).toLowerCase().split(' ')
      const matchedBlocker = blockers.find(b =>
        searchTerms.some(term => b.description.toLowerCase().includes(term))
      ) || blockers[0]

      const resolved = await resolveBlocker(
        context.userId,
        project.id,
        matchedBlocker.id,
        params.resolution_notes as string | undefined
      )

      if (!resolved) {
        return 'Failed to resolve blocker. Please try again.'
      }

      return `Blocker resolved for ${project.name}: "${matchedBlocker.description}"`
    },
  },
  {
    name: 'record_follow_up',
    description: "Record that David followed up on a blocker. Use when he mentions emailing, calling, or contacting someone about a blocked item.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Name of the project',
        },
        method: {
          type: 'string',
          enum: ['email', 'call', 'text', 'in_person', 'other'],
          description: 'How the follow-up was done',
        },
        notes: {
          type: 'string',
          description: 'Notes about the follow-up',
        },
      },
      required: ['project_name', 'method'],
    },
    handler: async (params, context) => {
      const project = await getProjectByName(context.userId, params.project_name as string)
      if (!project) {
        return `I don't have a project called "${params.project_name}".`
      }

      // Get the most recent unresolved blocker for this project
      const { data: blocker } = await context.supabase
        .from('blockers')
        .select('id')
        .eq('project_id', project.id)
        .eq('user_id', context.userId)
        .eq('resolved', false)
        .order('waiting_since', { ascending: true })
        .limit(1)
        .single() as { data: { id: string } | null }

      if (!blocker) {
        return `No active blockers found for ${project.name} to record follow-up against.`
      }

      await recordFollowUp(
        context.userId,
        project.id,
        blocker.id,
        params.method as 'email' | 'call' | 'text' | 'in_person' | 'other',
        params.notes as string | undefined
      )

      return `Follow-up recorded for ${project.name} via ${params.method}.`
    },
  },
  {
    name: 'watch_for_email',
    description: "Set up an email watch trigger to auto-detect when a blocker might be resolved. Use when David wants to be notified when a specific email arrives.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Name of the project with the blocker',
        },
        from_contains: {
          type: 'string',
          description: 'Email address or domain to watch for',
        },
        subject_contains: {
          type: 'string',
          description: 'Subject line keywords to match',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to look for in subject or body',
        },
        action: {
          type: 'string',
          enum: ['notify', 'mark_resolved', 'draft_email'],
          description: 'What to do when email is detected',
        },
      },
      required: ['project_name'],
    },
    handler: async (params, context) => {
      const project = await getProjectByName(context.userId, params.project_name as string)
      if (!project) {
        return `I don't have a project called "${params.project_name}".`
      }

      // Get the most recent unresolved blocker
      const { data: blocker } = await context.supabase
        .from('blockers')
        .select('id')
        .eq('project_id', project.id)
        .eq('user_id', context.userId)
        .eq('resolved', false)
        .order('waiting_since', { ascending: true })
        .limit(1)
        .single() as { data: { id: string } | null }

      if (!blocker) {
        return `No active blockers found for ${project.name} to set up a watch trigger.`
      }

      const trigger = await addWatchTrigger(context.userId, blocker.id, {
        source: 'email',
        from_contains: params.from_contains as string | undefined,
        subject_contains: params.subject_contains as string | undefined,
        keywords: params.keywords as string[] | undefined,
        on_trigger: (params.action as 'notify' | 'mark_resolved' | 'draft_email') || 'notify',
      })

      if (!trigger) {
        return 'Failed to set up email watch. Please try again.'
      }

      let response = `Email watch set up for ${project.name}`
      if (params.from_contains) response += `. Watching for emails from ${params.from_contains}`
      if (params.keywords) response += `. Keywords: ${(params.keywords as string[]).join(', ')}`
      return response
    },
  },
  {
    name: 'draft_follow_up_email',
    description: "Create a draft follow-up email for a blocker. Use when David asks to draft a follow-up or check-in email.",
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: {
          type: 'string',
          description: 'Name of the project',
        },
      },
      required: ['project_name'],
    },
    handler: async (params, context) => {
      const project = await getProjectByName(context.userId, params.project_name as string)
      if (!project) {
        return `I don't have a project called "${params.project_name}".`
      }

      // Get Google tokens
      const { data: googleCreds } = await context.supabase
        .from('google_oauth_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', context.userId)
        .single() as { data: { access_token: string; refresh_token: string } | null }

      if (!googleCreds?.access_token) {
        return 'Google account not connected. Please connect Google to use email drafting.'
      }

      // Get the most recent blocker with a contact
      const { data: blocker } = await context.supabase
        .from('blockers')
        .select('id, description, person_contact_id')
        .eq('project_id', project.id)
        .eq('user_id', context.userId)
        .eq('resolved', false)
        .not('person_contact_id', 'is', null)
        .order('waiting_since', { ascending: true })
        .limit(1)
        .single() as { data: { id: string; description: string; person_contact_id: string } | null }

      if (!blocker) {
        return `No blockers with contact information found for ${project.name}. Need an email address to draft a follow-up.`
      }

      const draft = await draftFollowUpEmail(
        context.userId,
        blocker.id,
        googleCreds.access_token,
        googleCreds.refresh_token
      )

      if (!draft) {
        return 'Failed to create draft email. Please try again.'
      }

      return `Draft created to ${draft.to}.\nSubject: ${draft.subject}\n\nYou can find it in your Gmail drafts.`
    },
  },
]
