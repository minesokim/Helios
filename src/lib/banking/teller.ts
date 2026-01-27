import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import { Agent } from 'undici'

// Teller API Configuration
const TELLER_API_URL = 'https://api.teller.io'

// Load certificates for mTLS
function getUndiciAgent(): Agent | undefined {
  const certPath = process.env.TELLER_CERT_PATH
  const keyPath = process.env.TELLER_KEY_PATH

  if (!certPath || !keyPath) {
    console.log('Teller: No certificate paths configured, mTLS disabled')
    return undefined
  }

  try {
    const cert = fs.readFileSync(path.resolve(process.cwd(), certPath))
    const key = fs.readFileSync(path.resolve(process.cwd(), keyPath))

    return new Agent({
      connect: {
        cert,
        key,
        rejectUnauthorized: true,
      },
    })
  } catch (error) {
    console.error('Failed to load Teller certificates:', error)
    return undefined
  }
}

// Types
export const TellerAccountSchema = z.object({
  id: z.string(),
  enrollment_id: z.string(),
  name: z.string(),
  type: z.enum(['depository', 'credit']),
  subtype: z.string().nullable(),
  status: z.enum(['open', 'closed']),
  currency: z.string(),
  last_four: z.string().nullable(),
  institution: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

export const TellerBalanceSchema = z.object({
  account_id: z.string(),
  available: z.string().nullable(),
  ledger: z.string(),
})

export const TellerTransactionSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  date: z.string(),
  description: z.string(),
  details: z.object({
    category: z.string().nullable().optional(),
    counterparty: z.object({
      name: z.string().optional(),
      type: z.string().optional(),
    }).nullable().optional(),
    processing_status: z.string(),
  }),
  status: z.enum(['pending', 'posted']),
  amount: z.string(),
  type: z.string(),
})

export type TellerAccount = z.infer<typeof TellerAccountSchema>
export type TellerBalance = z.infer<typeof TellerBalanceSchema>
export type TellerTransaction = z.infer<typeof TellerTransactionSchema>

// Teller API Client
export class TellerClient {
  private accessToken: string
  private agent: Agent | undefined

  constructor(accessToken: string) {
    this.accessToken = accessToken
    this.agent = getUndiciAgent()
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${TELLER_API_URL}${endpoint}`

    // Build fetch options with mTLS agent
    const fetchOptions: RequestInit & { dispatcher?: Agent } = {
      ...options,
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.accessToken}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }

    // Add undici agent for mTLS if available
    if (this.agent) {
      fetchOptions.dispatcher = this.agent
    }

    const response = await fetch(url, fetchOptions as RequestInit)

    if (!response.ok) {
      const error = await response.text()
      throw new TellerError(
        `Teller API error: ${response.status} ${response.statusText}`,
        response.status,
        error
      )
    }

    return response.json()
  }

  // Get all accounts for this enrollment
  async getAccounts(): Promise<TellerAccount[]> {
    const data = await this.request<TellerAccount[]>('/accounts')
    return z.array(TellerAccountSchema).parse(data)
  }

  // Get single account
  async getAccount(accountId: string): Promise<TellerAccount> {
    const data = await this.request<TellerAccount>(`/accounts/${accountId}`)
    return TellerAccountSchema.parse(data)
  }

  // Get account balance
  async getBalance(accountId: string): Promise<TellerBalance> {
    const data = await this.request<TellerBalance>(`/accounts/${accountId}/balances`)
    return TellerBalanceSchema.parse(data)
  }

  // Get account transactions
  async getTransactions(
    accountId: string,
    options?: { count?: number; from_id?: string }
  ): Promise<TellerTransaction[]> {
    const params = new URLSearchParams()
    if (options?.count) params.set('count', options.count.toString())
    if (options?.from_id) params.set('from_id', options.from_id)

    const query = params.toString() ? `?${params.toString()}` : ''
    const data = await this.request<TellerTransaction[]>(
      `/accounts/${accountId}/transactions${query}`
    )
    return z.array(TellerTransactionSchema).parse(data)
  }

  // Delete enrollment (disconnect bank)
  async deleteEnrollment(enrollmentId: string): Promise<void> {
    await this.request(`/enrollments/${enrollmentId}`, { method: 'DELETE' })
  }
}

// Custom error class
export class TellerError extends Error {
  status: number
  details: string

  constructor(message: string, status: number, details: string) {
    super(message)
    this.name = 'TellerError'
    this.status = status
    this.details = details
  }
}

// Teller Connect configuration for frontend
export function getTellerConnectConfig() {
  return {
    applicationId: process.env.NEXT_PUBLIC_TELLER_APPLICATION_ID!,
    environment: process.env.NEXT_PUBLIC_TELLER_ENVIRONMENT as 'sandbox' | 'development' | 'production' || 'sandbox',
  }
}

// Map Teller account type to our schema
export function mapAccountType(tellerType: string, subtype?: string | null): string {
  if (tellerType === 'credit') {
    return 'credit'
  }

  // Depository accounts
  if (subtype === 'savings') {
    return 'savings'
  }
  return 'checking'
}

// Map Teller transaction to our format
export function mapTransaction(t: TellerTransaction) {
  return {
    teller_transaction_id: t.id,
    date: t.date,
    description: t.description,
    merchant_name: t.details.counterparty?.name || null,
    amount: parseFloat(t.amount), // Teller: negative = debit, positive = credit
    status: t.status,
    type: t.type,
    raw_data: t,
  }
}
