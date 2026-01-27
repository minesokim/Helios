'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Mail,
  Clock,
  CheckCircle2,
  Circle,
  ChevronRight,
  Calendar,
  Star,
  AlertCircle,
  Briefcase,
  Plus,
  RefreshCw,
  ExternalLink,
  Send,
  Inbox,
} from 'lucide-react'

// Types
interface Email {
  id: string
  threadId: string
  subject: string
  from: string
  to?: string
  date: string
  snippet: string
  isUnread: boolean
  accountId: string
  accountLabel: string
  googleEmail: string
  type?: 'inbox' | 'sent'
}

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  isAllDay: boolean
  location?: string
}

interface Task {
  id: string
  title: string
  done: boolean
  priority: 'high' | 'medium' | 'low'
  projectName?: string
  dueDate?: string
}

interface ScheduledTask {
  id: string
  title: string
  description: string | null
  priority: number
  scheduled_for: string
  status: string
  project_name: string | null
  client_name: string | null
  is_recurring: boolean
}

interface Workstream {
  id: string
  name: string
  progress: number
  status: string
  dueDate?: string
  blockerCount?: number
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatEmailTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return `${mins}m ago`
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000)
    return `${hours}h ago`
  }
  if (diff < 172800000) {
    return 'Yesterday'
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatEventTime(start: string, isAllDay: boolean): string {
  if (isAllDay) return 'All day'
  const date = new Date(start)
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function BridgePage() {
  const [activeSection, setActiveSection] = useState<'overview' | 'workstream'>('overview')
  const [emailView, setEmailView] = useState<'inbox' | 'sent'>('inbox')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Data state
  const [emails, setEmails] = useState<Email[]>([])
  const [sentEmails, setSentEmails] = useState<Email[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])

  const greeting = getGreeting()
  const today = format(new Date(), 'EEE, MMM d')

  // Fetch emails from Gmail aggregator
  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/check?sent=true')
      if (res.ok) {
        const data = await res.json()
        setEmails(data.emails || [])
        setSentEmails(data.sentEmails || [])
        setTotalUnread(data.totalUnread || 0)
      }
    } catch (e) {
      console.error('Failed to fetch emails:', e)
    }
  }, [])

  // Fetch calendar events
  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/events')
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (e) {
      // Calendar API may not exist yet, use empty
      setEvents([])
    }
  }, [])

  // Fetch scheduled tasks
  const fetchScheduledTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/scheduled-tasks')
      if (res.ok) {
        const data = await res.json()
        setScheduledTasks(data.tasks || [])
        setOverdueCount(data.overdueCount || 0)
      }
    } catch (e) {
      console.error('Failed to fetch scheduled tasks:', e)
    }
  }, [])

  // Fetch tasks/blockers from projects
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        const projects = data.projects || []

        // Convert blockers to tasks
        const allTasks: Task[] = []
        const allWorkstreams: Workstream[] = []

        for (const project of projects) {
          // Add project as workstream
          allWorkstreams.push({
            id: project.id,
            name: project.name,
            progress: project.status === 'completed' ? 100 :
                     project.status === 'active' ? 50 : 25,
            status: project.status,
            dueDate: project.due_date,
            blockerCount: project.blockers?.length || 0,
          })

          // Convert blockers to tasks
          if (project.blockers) {
            for (const blocker of project.blockers) {
              allTasks.push({
                id: blocker.id,
                title: blocker.description,
                done: blocker.resolved,
                priority: blocker.type === 'external_approval' ? 'high' : 'medium',
                projectName: project.name,
              })
            }
          }
        }

        setTasks(allTasks.slice(0, 10))
        setWorkstreams(allWorkstreams.slice(0, 6))
      }
    } catch (e) {
      console.error('Failed to fetch tasks:', e)
    }
  }, [])

  // Initial load
  useEffect(() => {
    setLoading(true)
    Promise.all([fetchEmails(), fetchCalendar(), fetchTasks(), fetchScheduledTasks()])
      .finally(() => setLoading(false))
  }, [fetchEmails, fetchCalendar, fetchTasks, fetchScheduledTasks])

  // Refresh all data
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchEmails(), fetchCalendar(), fetchTasks(), fetchScheduledTasks()])
    setRefreshing(false)
  }

  // Poll for new emails every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchEmails, 30000)
    return () => clearInterval(interval)
  }, [fetchEmails])

  // Summary stats
  const meetingCount = events.filter(e => {
    const eventDate = new Date(e.start)
    const today = new Date()
    return eventDate.toDateString() === today.toDateString()
  }).length

  const priorityTaskCount = tasks.filter(t => !t.done && t.priority === 'high').length
  const todayTaskCount = scheduledTasks.filter(t => {
    const taskDate = new Date(t.scheduled_for)
    const today = new Date()
    return taskDate.toDateString() === today.toDateString()
  }).length

  // Get important emails (unread or starred-like based on keywords)
  const importantEmails = emails
    .filter(e => e.isUnread ||
      e.subject.toLowerCase().includes('urgent') ||
      e.subject.toLowerCase().includes('important') ||
      e.subject.toLowerCase().includes('action required'))
    .slice(0, 6)

  // Today's events
  const todaysEvents = events.filter(e => {
    const eventDate = new Date(e.start)
    const today = new Date()
    return eventDate.toDateString() === today.toDateString()
  }).slice(0, 5)

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <RefreshCw className="h-6 w-6 text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      {/* Header with Section Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-light text-white text-display tracking-tight">
            {greeting}, Sir.
          </h1>
          <p className="text-sm text-white/40 mt-1">{today}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-white/40 hover:text-white/60 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Section Toggle */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button
              onClick={() => setActiveSection('overview')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeSection === 'overview'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveSection('workstream')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeSection === 'workstream'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              Workstream
            </button>
          </div>
        </div>
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <>
          {/* Today Summary */}
          <div className="mercury-card p-5 mb-6">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-3">Today</p>
            <div className="flex items-center gap-6 text-sm">
              <span className="text-white/70">
                <span className="text-white font-medium">{meetingCount}</span> meetings
              </span>
              <span className="text-white/30">·</span>
              <span className="text-white/70">
                <span className="text-white font-medium">{totalUnread}</span> unread emails
              </span>
              <span className="text-white/30">·</span>
              <span className="text-white/70">
                <span className="text-white font-medium">{todayTaskCount}</span> scheduled tasks
              </span>
              {overdueCount > 0 && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="text-white/70">
                    <span className="text-red-400 font-medium">{overdueCount}</span> overdue
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0 overflow-hidden">
            {/* Left Column - Email */}
            <div className="mercury-card flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Inbox/Sent Toggle */}
                    <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
                      <button
                        onClick={() => setEmailView('inbox')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                          emailView === 'inbox'
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white/60'
                        }`}
                      >
                        <Inbox className="h-3 w-3" />
                        Inbox
                      </button>
                      <button
                        onClick={() => setEmailView('sent')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                          emailView === 'sent'
                            ? 'bg-white/10 text-white'
                            : 'text-white/40 hover:text-white/60'
                        }`}
                      >
                        <Send className="h-3 w-3" />
                        Sent
                      </button>
                    </div>
                    {emailView === 'inbox' && totalUnread > 0 && (
                      <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">
                        {totalUnread}
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://mail.google.com/mail/u/0/#${emailView === 'sent' ? 'sent' : 'inbox'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                  >
                    Open Gmail <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2">
                {emailView === 'inbox' ? (
                  importantEmails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-white/40">
                      <Mail className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No priority emails</p>
                      <p className="text-xs text-white/30 mt-1">Connect Gmail to see your inbox</p>
                    </div>
                  ) : (
                    importantEmails.map((email) => (
                      <a
                        key={email.id}
                        href={`https://mail.google.com/mail/u/0/#inbox/${email.threadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                      >
                        <div className="mt-0.5">
                          {email.isUnread ? (
                            <Circle className="h-4 w-4 text-cyan-400 fill-cyan-400" />
                          ) : (
                            <Circle className="h-4 w-4 text-white/20" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-sm font-medium ${email.isUnread ? 'text-white' : 'text-white/70'}`}>
                              {email.from.replace(/<[^>]+>/, '').trim().split(' ')[0]}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              email.accountLabel.toLowerCase().includes('work') || email.googleEmail.includes('noctworks')
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-cyan-500/20 text-cyan-400'
                            }`}>
                              {email.accountLabel}
                            </span>
                          </div>
                          <p className={`text-sm truncate ${email.isUnread ? 'text-white/80' : 'text-white/60'}`}>
                            {email.subject}
                          </p>
                          <p className="text-xs text-white/30 mt-1">{formatEmailTime(email.date)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors mt-1" />
                      </a>
                    ))
                  )
                ) : (
                  sentEmails.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-white/40">
                      <Send className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No sent emails</p>
                    </div>
                  ) : (
                    sentEmails.slice(0, 8).map((email) => (
                      <a
                        key={email.id}
                        href={`https://mail.google.com/mail/u/0/#sent/${email.threadId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                      >
                        <div className="mt-0.5">
                          <Send className="h-4 w-4 text-white/30" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-white/70">
                              To: {email.to?.replace(/<[^>]+>/, '').trim().split(' ')[0] || 'Unknown'}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              email.accountLabel.toLowerCase().includes('work') || email.googleEmail.includes('noctworks')
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-cyan-500/20 text-cyan-400'
                            }`}>
                              {email.accountLabel}
                            </span>
                          </div>
                          <p className="text-sm truncate text-white/60">
                            {email.subject}
                          </p>
                          <p className="text-xs text-white/30 mt-1">{formatEmailTime(email.date)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors mt-1" />
                      </a>
                    ))
                  )
                )}
              </div>
            </div>

            {/* Right Column - Schedule & Tasks */}
            <div className="flex flex-col gap-6 overflow-hidden">
              {/* Schedule */}
              <div className="mercury-card flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-purple-400" />
                    <span className="text-xs uppercase tracking-wider text-white/50">Schedule</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {todaysEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-white/40">
                      <Calendar className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No events today</p>
                    </div>
                  ) : (
                    todaysEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        <span className="text-sm text-white/40 font-mono w-16">
                          {formatEventTime(event.start, event.isAllDay)}
                        </span>
                        <div className="h-2 w-2 rounded-full bg-purple-400" />
                        <span className="text-sm text-white">{event.summary}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Scheduled Tasks */}
              <div className="mercury-card flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-green-400" />
                      <span className="text-xs uppercase tracking-wider text-white/50">Scheduled Tasks</span>
                      {overdueCount > 0 && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                          {overdueCount} overdue
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {scheduledTasks.length === 0 && tasks.filter(t => !t.done).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-white/40">
                      <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">All clear</p>
                    </div>
                  ) : (
                    <>
                      {/* Scheduled tasks first */}
                      {scheduledTasks.slice(0, 5).map((task) => {
                        const isOverdue = new Date(task.scheduled_for) < new Date()
                        const isToday = new Date(task.scheduled_for).toDateString() === new Date().toDateString()
                        return (
                          <div
                            key={task.id}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <button className="h-4 w-4 rounded border border-white/20 group-hover:border-white/40 transition-colors flex items-center justify-center" />
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm block truncate ${isOverdue ? 'text-red-400' : 'text-white'}`}>
                                {task.title}
                              </span>
                              <span className="text-xs text-white/40">
                                {isOverdue ? 'Overdue' : isToday ? 'Today' : new Date(task.scheduled_for).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {task.project_name && ` · ${task.project_name}`}
                              </span>
                            </div>
                            {task.priority >= 8 && (
                              <Star className="h-4 w-4 text-amber-400" />
                            )}
                          </div>
                        )
                      })}
                      {/* Then blockers */}
                      {tasks.filter(t => !t.done).slice(0, 3).map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                        >
                          <AlertCircle className="h-4 w-4 text-amber-400" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-white block truncate">{task.title}</span>
                            {task.projectName && (
                              <span className="text-xs text-white/40">Blocker · {task.projectName}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Workstream Section */}
      {activeSection === 'workstream' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Workstream Header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-wider text-white/40">Active Projects</p>
            <button className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
              <Plus className="h-3 w-3" />
              New Project
            </button>
          </div>

          {/* Workstream Cards */}
          {workstreams.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white/40">
              <Briefcase className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">No active projects</p>
              <p className="text-xs text-white/30 mt-1">Create a project to track your work</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {workstreams.map((project) => (
                  <div
                    key={project.id}
                    className="mercury-card p-5 hover:bg-white/[0.06] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                          <Briefcase className="h-4 w-4 text-cyan-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-white">{project.name}</h3>
                          {project.dueDate && (
                            <p className="text-xs text-white/40">Due {project.dueDate}</p>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full ${
                        project.status === 'active' ? 'bg-cyan-500/20 text-cyan-400' :
                        project.status === 'blocked' ? 'bg-amber-500/20 text-amber-400' :
                        project.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        'bg-white/10 text-white/50'
                      }`}>
                        {project.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-white/40">Progress</span>
                        <span className="text-white/60">{project.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    {project.blockerCount && project.blockerCount > 0 && (
                      <div className="mt-3 flex items-center gap-1 text-xs text-amber-400">
                        <AlertCircle className="h-3 w-3" />
                        {project.blockerCount} blocker{project.blockerCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Tasks from Workstreams */}
              <div className="mercury-card flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-400" />
                      <span className="text-xs uppercase tracking-wider text-white/50">Blockers & Tasks</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {tasks.filter(t => !t.done).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className={`h-2 w-2 rounded-full ${
                        task.priority === 'high' ? 'bg-amber-400' : 'bg-cyan-400'
                      }`} />
                      <span className="text-sm text-white flex-1">{task.title}</span>
                      {task.projectName && (
                        <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/50">
                          {task.projectName}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
