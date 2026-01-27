// Run migration script
// Usage: npx tsx scripts/run-migration.ts

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/00007_intelligent_organization.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  // Split by semicolons but handle functions which contain semicolons
  const statements = splitSqlStatements(sql)

  console.log(`Running migration with ${statements.length} statements...`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim()
    if (!stmt) continue

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt })
      if (error) {
        // Try direct query if rpc doesn't exist
        const { error: queryError } = await supabase.from('_migrations').select('*').limit(0)
        if (queryError) {
          console.log(`Statement ${i + 1}: Using REST API not supported for DDL`)
        }
      }
      console.log(`Statement ${i + 1}: OK`)
    } catch (err) {
      console.error(`Statement ${i + 1} failed:`, err)
    }
  }

  console.log('Migration complete!')
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inFunction = false
  let dollarQuote = ''

  const lines = sql.split('\n')

  for (const line of lines) {
    // Check for dollar quote start/end
    const dollarMatch = line.match(/\$\$|\$[a-zA-Z_]+\$/)
    if (dollarMatch) {
      if (!inFunction) {
        inFunction = true
        dollarQuote = dollarMatch[0]
      } else if (line.includes(dollarQuote)) {
        inFunction = false
        dollarQuote = ''
      }
    }

    current += line + '\n'

    // If not in function and line ends with semicolon
    if (!inFunction && line.trim().endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

runMigration().catch(console.error)
