import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get upcoming tasks for next 14 days
    const twoWeeksFromNow = new Date()
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)

    const { data: tasks, error } = await supabase
      .from('scheduled_tasks')
      .select(`
        id,
        title,
        description,
        priority,
        scheduled_for,
        reminder_at,
        status,
        project_id,
        client_id,
        is_recurring,
        recurring_pattern,
        auto_created
      `)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lte('scheduled_for', twoWeeksFromNow.toISOString())
      .order('scheduled_for', { ascending: true })

    if (error) {
      console.error('Error fetching scheduled tasks:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get project and client names
    const projectIds = [...new Set(tasks?.map(t => t.project_id).filter((id): id is string => id !== null) || [])]
    const clientIds = [...new Set(tasks?.map(t => t.client_id).filter((id): id is string => id !== null) || [])]

    const [projectsRes, clientsRes] = await Promise.all([
      projectIds.length > 0
        ? supabase.from('projects').select('id, name').in('id', projectIds)
        : { data: [] },
      clientIds.length > 0
        ? supabase.from('clients').select('id, name').in('id', clientIds)
        : { data: [] },
    ])

    const projectMap = new Map((projectsRes.data || []).map(p => [p.id, p.name]))
    const clientMap = new Map((clientsRes.data || []).map(c => [c.id, c.name]))

    // Enrich tasks with names
    const enrichedTasks = (tasks || []).map(t => ({
      ...t,
      project_name: t.project_id ? projectMap.get(t.project_id) : null,
      client_name: t.client_id ? clientMap.get(t.client_id) : null,
    }))

    // Separate into overdue and upcoming
    const now = new Date()
    const overdue = enrichedTasks.filter(t => new Date(t.scheduled_for) < now)
    const upcoming = enrichedTasks.filter(t => new Date(t.scheduled_for) >= now)

    return NextResponse.json({
      tasks: enrichedTasks,
      overdue,
      upcoming,
      overdueCount: overdue.length,
      upcomingCount: upcoming.length,
    })
  } catch (error) {
    console.error('Scheduled tasks error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    const { data: task, error } = await supabase
      .from('scheduled_tasks')
      .insert({
        user_id: user.id,
        title: body.title,
        description: body.description,
        priority: body.priority || 5,
        scheduled_for: body.scheduled_for,
        reminder_at: body.reminder_at,
        project_id: body.project_id,
        client_id: body.client_id,
        is_recurring: body.is_recurring || false,
        recurring_pattern: body.recurring_pattern,
        auto_created: body.auto_created || false,
        creation_context: body.creation_context,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating scheduled task:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Create scheduled task error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
