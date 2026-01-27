import { ToolDefinition } from '../types'
import { searchUserEmails } from '@/services/ai/context'
import { createDraftForAccount, sendEmailForAccount } from '@/lib/google/gmail'
import { getAllAccounts } from '@/lib/google/token-manager'

export const emailTools: ToolDefinition[] = [
  {
    name: 'search_emails',
    description: "Search David's Gmail inbox. Use when he asks about emails, messages from someone, or wants to find an email.",
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query (e.g., "from:john", "subject:invoice", "after:2024/01/01")',
        },
      },
      required: ['query'],
    },
    handler: async (params, context) => {
      const emails = await searchUserEmails(context.userId, params.query as string)
      if (!emails || emails.length === 0) {
        return 'No emails found matching that search.'
      }
      const emailList = emails.map(e => {
        const date = new Date(e.date).toLocaleDateString()
        const unread = e.isUnread ? '[UNREAD] ' : ''
        return `${unread}${date} - ${e.from}: ${e.subject}\n  Preview: ${e.snippet.substring(0, 100)}...`
      }).join('\n\n')
      return `Found ${emails.length} emails:\n\n${emailList}`
    },
  },
  {
    name: 'compose_email',
    description: "Compose and create a draft email in Gmail. Use when David asks to write, draft, or compose an email. The email will be saved as a draft for David to review before sending.",
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address (required)',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body content (plain text)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (comma-separated emails)',
        },
        account: {
          type: 'string',
          enum: ['personal', 'work', 'primary'],
          description: 'Which Google account to send from. Use "work" for business emails, "personal" for personal. Defaults to primary.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
    handler: async (params, context) => {
      // Get all connected Google accounts
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected. Please connect Gmail in Settings first.'
      }

      // Select the appropriate account
      let selectedAccount = accounts[0] // Default to first account
      const accountPref = (params.account as string)?.toLowerCase()

      if (accountPref && accounts.length > 1) {
        const workAccount = accounts.find(a =>
          a.account_label.toLowerCase().includes('work') ||
          a.google_email.includes('noctworks')
        )
        const personalAccount = accounts.find(a =>
          a.account_label.toLowerCase().includes('personal') ||
          a.google_email.includes('gmail.com')
        )

        if (accountPref === 'work' && workAccount) {
          selectedAccount = workAccount
        } else if (accountPref === 'personal' && personalAccount) {
          selectedAccount = personalAccount
        }
      }

      // Create the draft
      const draft = await createDraftForAccount(
        selectedAccount.id,
        context.userId,
        params.to as string,
        params.subject as string,
        params.body as string,
        { cc: params.cc as string | undefined }
      )

      if (!draft) {
        return 'Failed to create email draft. Please try again.'
      }

      return `Draft created successfully from ${selectedAccount.google_email}.\n\nTo: ${params.to}\nSubject: ${params.subject}\n\nYou can review and send it from your Gmail drafts: https://mail.google.com/mail/u/0/#drafts`
    },
  },
  {
    name: 'send_email',
    description: "Send an email immediately via Gmail. Use when David explicitly says to SEND an email (not just compose or draft). Be careful - this sends the email right away!",
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address (required)',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body content (plain text)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (comma-separated emails)',
        },
        account: {
          type: 'string',
          enum: ['personal', 'work', 'primary'],
          description: 'Which Google account to send from. Use "work" for business emails, "personal" for personal.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to actually send. If not provided or false, will create a draft instead.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
    handler: async (params, context) => {
      // Get all connected Google accounts
      const accounts = await getAllAccounts(context.userId)
      if (accounts.length === 0) {
        return 'No Google account connected. Please connect Gmail in Settings first.'
      }

      // Safety check - if not confirmed, create draft instead
      if (params.confirm !== true) {
        // Select the appropriate account
        let selectedAccount = accounts[0]
        const accountPref = (params.account as string)?.toLowerCase()

        if (accountPref && accounts.length > 1) {
          const workAccount = accounts.find(a =>
            a.account_label.toLowerCase().includes('work') ||
            a.google_email.includes('noctworks')
          )
          const personalAccount = accounts.find(a =>
            a.account_label.toLowerCase().includes('personal') ||
            a.google_email.includes('gmail.com')
          )

          if (accountPref === 'work' && workAccount) {
            selectedAccount = workAccount
          } else if (accountPref === 'personal' && personalAccount) {
            selectedAccount = personalAccount
          }
        }

        const draft = await createDraftForAccount(
          selectedAccount.id,
          context.userId,
          params.to as string,
          params.subject as string,
          params.body as string,
          { cc: params.cc as string | undefined }
        )

        if (!draft) {
          return 'Failed to create email draft. Please try again.'
        }

        return `I've created a draft instead of sending directly. Please review it in Gmail drafts and send manually if it looks good.\n\nTo: ${params.to}\nSubject: ${params.subject}\nFrom: ${selectedAccount.google_email}\n\nDrafts: https://mail.google.com/mail/u/0/#drafts`
      }

      // Select the appropriate account
      let selectedAccount = accounts[0]
      const accountPref = (params.account as string)?.toLowerCase()

      if (accountPref && accounts.length > 1) {
        const workAccount = accounts.find(a =>
          a.account_label.toLowerCase().includes('work') ||
          a.google_email.includes('noctworks')
        )
        const personalAccount = accounts.find(a =>
          a.account_label.toLowerCase().includes('personal') ||
          a.google_email.includes('gmail.com')
        )

        if (accountPref === 'work' && workAccount) {
          selectedAccount = workAccount
        } else if (accountPref === 'personal' && personalAccount) {
          selectedAccount = personalAccount
        }
      }

      // Send the email
      const result = await sendEmailForAccount(
        selectedAccount.id,
        context.userId,
        params.to as string,
        params.subject as string,
        params.body as string,
        { cc: params.cc as string | undefined }
      )

      if (!result) {
        return 'Failed to send email. Please try again or check your Gmail connection.'
      }

      return `Email sent successfully!\n\nFrom: ${result.fromEmail}\nTo: ${params.to}\nSubject: ${params.subject}\n\nView in sent folder: https://mail.google.com/mail/u/0/#sent`
    },
  },
]
