/**
 * Seed David's clients
 * Run with: npx tsx scripts/seed-clients.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const USER_ID = '82072f68-6ce6-4cb2-a743-9849f1f17e4f'

const clients = [
  {
    name: 'W Dental',
    company: 'W Dental',
    service_type: 'Website (Framer)',
    monthly_retainer: 100,
    total_revenue: 100 * 12,
    total_expenses: 45 * 12,
    status: 'active',
    notes: 'Framer site, $45/mo hosting cost',
    tags: ['framer', 'website', 'collecting']
  },
  {
    name: 'Samantha True',
    company: 'Samantha True',
    service_type: 'Website (Framer)',
    monthly_retainer: 20,
    total_revenue: 20 * 12,
    total_expenses: 10 * 12,
    status: 'active',
    notes: 'Framer site, $10/mo annual hosting',
    tags: ['framer', 'website', 'collecting']
  },
  {
    name: "Ben's Lock & Key",
    company: "Ben's Lock & Key",
    service_type: 'Website (Framer)',
    monthly_retainer: 16.67,
    total_revenue: 200,
    total_expenses: 10 * 12,
    status: 'active',
    notes: 'Framer site, $10/mo annual hosting',
    tags: ['framer', 'website', 'collecting']
  },
  {
    name: 'DJ Windows',
    company: 'DJ Windows',
    service_type: 'Web App (Orchids)',
    monthly_retainer: 500,
    total_revenue: 0,
    total_expenses: 12.50 * 12,
    status: 'active',
    notes: 'Orchids app, $12.50/mo cost - UNCOLLECTED REVENUE',
    tags: ['orchids', 'webapp', 'uncollected']
  },
  {
    name: 'Luna Tale',
    company: 'Luna Tale',
    service_type: 'Web App (Orchids)',
    monthly_retainer: 25,
    total_revenue: 0,
    total_expenses: 12.50 * 12,
    status: 'active',
    notes: 'Orchids app, $12.50/mo cost - UNCOLLECTED REVENUE',
    tags: ['orchids', 'webapp', 'uncollected']
  },
  {
    name: 'MK Trader',
    company: 'MK Trader',
    service_type: 'Website (Framer)',
    monthly_retainer: 0,
    total_revenue: 0,
    total_expenses: 0,
    status: 'active',
    notes: 'Non-paying client, Framer (student discount)',
    tags: ['framer', 'website', 'non-paying']
  },
  {
    name: 'Noctworks',
    company: 'Noctworks',
    service_type: 'Website (Framer)',
    monthly_retainer: 0,
    total_revenue: 0,
    total_expenses: 45 * 12,
    status: 'active',
    notes: 'Own company site, $45/mo Framer cost',
    tags: ['framer', 'website', 'internal']
  }
]

async function addClients() {
  // Check existing clients
  const { data: existing } = await supabase
    .from('clients')
    .select('name')
    .eq('user_id', USER_ID)
    .is('deleted_at', null)

  const existingNames = new Set(existing?.map(c => c.name.toLowerCase()) || [])
  console.log('Existing clients:', existingNames.size)

  const newClients = clients.filter(c => !existingNames.has(c.name.toLowerCase()))

  if (newClients.length === 0) {
    console.log('All clients already exist!')
    return
  }

  console.log(`Adding ${newClients.length} new clients...`)

  const toInsert = newClients.map(c => ({
    user_id: USER_ID,
    ...c
  }))

  const { data, error } = await supabase
    .from('clients')
    .insert(toInsert)
    .select()

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('\nAdded clients:')
  data.forEach(c => {
    const status = c.tags?.includes('uncollected') ? '⚠️  UNCOLLECTED' :
                   c.tags?.includes('non-paying') ? '🔴 Non-paying' :
                   c.tags?.includes('internal') ? '🏠 Internal' : '✅ Collecting'
    console.log(`  ${c.name}: $${c.monthly_retainer}/mo ${status}`)
  })

  // Summary
  const collecting = data.filter(c => c.tags?.includes('collecting'))
  const uncollected = data.filter(c => c.tags?.includes('uncollected'))
  const monthlyCollecting = collecting.reduce((sum, c) => sum + (c.monthly_retainer || 0), 0)
  const monthlyUncollected = uncollected.reduce((sum, c) => sum + (c.monthly_retainer || 0), 0)

  console.log('\n--- Summary ---')
  console.log(`Collecting: $${monthlyCollecting.toFixed(2)}/mo`)
  console.log(`Uncollected: $${monthlyUncollected.toFixed(2)}/mo (potential)`)
}

addClients().catch(console.error)
