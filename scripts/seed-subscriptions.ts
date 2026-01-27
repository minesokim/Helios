/**
 * Seed David's subscriptions
 * Run with: npx tsx scripts/seed-subscriptions.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// David's user ID from the dev logs
const USER_ID = '82072f68-6ce6-4cb2-a743-9849f1f17e4f'

const subscriptions = [
  { merchant_name: 'MK Trader', amount: 0, frequency: 'monthly', notes: 'Student discount', is_essential: false },
  { merchant_name: 'Lovable', amount: 5, frequency: 'monthly', notes: null, is_essential: false },
  { merchant_name: 'Orchids.app', amount: 25, frequency: 'monthly', notes: null, is_essential: false },
  { merchant_name: 'Framer', amount: 240, frequency: 'yearly', notes: 'Web development', is_essential: true },
  { merchant_name: 'Claude Max (Anthropic)', amount: 200, frequency: 'monthly', notes: 'AI assistant', is_essential: true },
  { merchant_name: 'ElevenLabs', amount: 5, frequency: 'monthly', notes: 'Voice synthesis', is_essential: true },
  { merchant_name: 'Google Business', amount: 10.80, frequency: 'monthly', notes: 'Workspace/email', is_essential: true },
  { merchant_name: 'Spotify', amount: 11.99, frequency: 'monthly', notes: null, is_essential: false },
  { merchant_name: 'Google Drive', amount: 1.99, frequency: 'monthly', notes: 'Extra storage', is_essential: true },
  { merchant_name: 'Nintendo Online', amount: 20, frequency: 'yearly', notes: 'Gaming', is_essential: false },
  { merchant_name: 'Eos Fitness', amount: 30, frequency: 'monthly', notes: 'Gym membership', is_essential: true },
]

async function seedSubscriptions() {
  console.log('Seeding subscriptions for user:', USER_ID)

  // First, check if subscriptions already exist
  const { data: existing, error: fetchError } = await supabase
    .from('subscriptions')
    .select('merchant_name')
    .eq('user_id', USER_ID)
    .is('deleted_at', null)

  if (fetchError) {
    console.error('Error fetching existing subscriptions:', fetchError)
    process.exit(1)
  }

  const existingNames = new Set(existing?.map(s => s.merchant_name.toLowerCase()) || [])
  console.log(`Found ${existingNames.size} existing subscriptions`)

  // Filter out duplicates
  const newSubs = subscriptions.filter(s => !existingNames.has(s.merchant_name.toLowerCase()))

  if (newSubs.length === 0) {
    console.log('All subscriptions already exist!')
    return
  }

  console.log(`Adding ${newSubs.length} new subscriptions...`)

  const toInsert = newSubs.map(sub => ({
    user_id: USER_ID,
    merchant_name: sub.merchant_name,
    amount: sub.amount,
    frequency: sub.frequency,
    status: 'active',
    is_essential: sub.is_essential,
    notes: sub.notes,
    first_seen_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('subscriptions')
    .insert(toInsert)
    .select()

  if (error) {
    console.error('Error inserting subscriptions:', error)
    process.exit(1)
  }

  console.log(`Successfully added ${data.length} subscriptions:`)
  data.forEach(sub => {
    console.log(`  - ${sub.merchant_name}: $${sub.amount}/${sub.frequency}`)
  })
}

seedSubscriptions().catch(console.error)
