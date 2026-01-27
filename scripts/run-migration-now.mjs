import { readFileSync } from 'fs'
import { config } from 'dotenv'

// Load env vars
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Extract project ref from URL
const projectRef = supabaseUrl.replace('https://', '').split('.')[0]

async function runSQL(sql) {
  // Use Supabase's SQL execution endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`SQL execution failed: ${response.status} - ${text}`)
  }

  return response.json()
}

async function runMigration() {
  console.log('Running migration 00015_client_expenses_scheduled_tasks.sql...\n')

  const sql = readFileSync('supabase/migrations/00015_client_expenses_scheduled_tasks.sql', 'utf8')

  // Split into individual statements, handling $$ blocks properly
  const statements = []
  let current = ''
  let inDollarBlock = false

  for (const line of sql.split('\n')) {
    const trimmed = line.trim()

    // Skip pure comment lines
    if (trimmed.startsWith('--') && !current.trim()) continue

    current += line + '\n'

    // Track $$ blocks
    const dollarMatches = line.match(/\$\$/g)
    if (dollarMatches) {
      for (const _ of dollarMatches) {
        inDollarBlock = !inDollarBlock
      }
    }

    // If we're not in a $$ block and line ends with ;, it's a complete statement
    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim()
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt)
      }
      current = ''
    }
  }

  console.log(`Found ${statements.length} SQL statements\n`)

  // Try running all at once first
  try {
    console.log('Attempting to run full migration...')

    // Use pg directly via Supabase's postgres connection
    const { default: pg } = await import('pg')

    // Construct connection string from Supabase URL
    // Format: postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
    const dbHost = `db.${projectRef}.supabase.co`

    // We need the database password, which is typically the service role key for direct access
    // But actually Supabase uses a different password for direct postgres access
    // Let's try using the pooler instead
    const poolerHost = `${projectRef}.pooler.supabase.com`

    console.log('Note: Direct DB access requires DATABASE_URL in .env.local')
    console.log('Falling back to individual statement execution...\n')

  } catch (e) {
    console.log('Direct connection not available, using REST API...\n')
  }

  // Execute statements one by one using REST API with raw SQL
  let success = 0
  let skipped = 0
  let errors = []

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 60).replace(/\n/g, ' ') + '...'

    try {
      // For CREATE TABLE IF NOT EXISTS, CREATE INDEX, CREATE POLICY, CREATE FUNCTION, etc.
      // These are DDL and need to be run via postgres directly

      // Use the Supabase management API for SQL execution
      const mgmtResponse = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ query: stmt }),
        }
      )

      if (mgmtResponse.ok) {
        console.log(`✓ ${i + 1}/${statements.length}: ${preview}`)
        success++
      } else {
        const errText = await mgmtResponse.text()
        if (errText.includes('already exists')) {
          console.log(`○ ${i + 1}/${statements.length}: Already exists - ${preview}`)
          skipped++
        } else {
          console.log(`✗ ${i + 1}/${statements.length}: ${preview}`)
          errors.push({ stmt: preview, error: errText })
        }
      }
    } catch (e) {
      console.log(`? ${i + 1}/${statements.length}: ${preview}`)
      errors.push({ stmt: preview, error: e.message })
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Results: ${success} succeeded, ${skipped} skipped, ${errors.length} errors`)

  if (errors.length > 0) {
    console.log('\nNote: Some errors are expected if tables already exist.')
    console.log('Please run the migration manually in Supabase SQL Editor if needed.')
  }
}

runMigration().catch(console.error)
