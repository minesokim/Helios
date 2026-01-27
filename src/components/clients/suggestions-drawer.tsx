'use client'

import { useState } from 'react'
import {
  X,
  Check,
  Ban,
  Mail,
  Calendar,
  FileText,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Merge,
  Building2,
  User,
} from 'lucide-react'

interface Evidence {
  emails?: { subject: string; date: string }[]
  documents?: { name: string; type: string }[]
  mentions?: { context: string; date: string }[]
  meetings?: { title: string; date: string }[]
}

export interface Suggestion {
  id: string
  suggested_name: string
  suggested_company: string | null
  suggested_email: string | null
  suggested_type: string
  source: string
  confidence: number
  evidence: Evidence
  created_at: string
}

interface SuggestionsDrawerProps {
  isOpen: boolean
  onClose: () => void
  suggestions: Suggestion[]
  existingClients: { id: string; name: string }[]
  onApprove: (id: string, overrides?: { name?: string; company?: string }) => Promise<void>
  onReject: (id: string) => Promise<void>
  onMerge: (id: string, targetClientId: string) => Promise<void>
}

const sourceIcons: Record<string, typeof Mail> = {
  email: Mail,
  calendar: Calendar,
  document: FileText,
  invoice: FileText,
  conversation: MessageSquare,
}

export function SuggestionsDrawer({
  isOpen,
  onClose,
  suggestions,
  existingClients,
  onApprove,
  onReject,
  onMerge,
}: SuggestionsDrawerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<Record<string, string>>({})

  const handleApprove = async (suggestion: Suggestion) => {
    setProcessingId(suggestion.id)
    try {
      await onApprove(suggestion.id)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    try {
      await onReject(id)
    } finally {
      setProcessingId(null)
    }
  }

  const handleMerge = async (id: string) => {
    const targetId = mergeTargetId[id]
    if (!targetId) return

    setProcessingId(id)
    try {
      await onMerge(id, targetId)
    } finally {
      setProcessingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-[#0a0a0f] border-l border-white/10 h-full overflow-hidden flex flex-col pb-24">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white">Client Suggestions</h2>
              <p className="text-sm text-white/50">{suggestions.length} potential clients detected</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Sparkles className="h-12 w-12 text-white/20 mb-4" />
              <p className="text-white/50">No pending suggestions</p>
              <p className="text-white/30 text-sm mt-1">
                Run analysis to detect new clients
              </p>
            </div>
          ) : (
            suggestions.map((suggestion) => {
              const SourceIcon = sourceIcons[suggestion.source] || MessageSquare
              const isExpanded = expandedId === suggestion.id
              const isProcessing = processingId === suggestion.id

              return (
                <div
                  key={suggestion.id}
                  className="mercury-card overflow-hidden"
                >
                  {/* Main row */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                          {suggestion.suggested_type === 'individual' ? (
                            <User className="h-5 w-5 text-white/40" />
                          ) : (
                            <Building2 className="h-5 w-5 text-white/40" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium text-white truncate">
                            {suggestion.suggested_name}
                          </h3>
                          {suggestion.suggested_company && suggestion.suggested_company !== suggestion.suggested_name && (
                            <p className="text-sm text-white/50 truncate">
                              {suggestion.suggested_company}
                            </p>
                          )}
                          {suggestion.suggested_email && (
                            <p className="text-xs text-white/40 truncate mt-0.5">
                              {suggestion.suggested_email}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-white/40 flex items-center gap-1">
                              <SourceIcon className="h-3 w-3" />
                              {suggestion.source}
                            </span>
                            <span className="text-xs text-white/30">|</span>
                            <span className={`text-xs ${
                              suggestion.confidence >= 0.7 ? 'text-green-400' :
                              suggestion.confidence >= 0.5 ? 'text-amber-400' :
                              'text-white/40'
                            }`}>
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expand button */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : suggestion.id)}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-white/40" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-white/40" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded evidence */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/5 pt-3">
                      <p className="text-xs uppercase tracking-wider text-white/30 mb-2">Evidence</p>

                      {suggestion.evidence.emails && suggestion.evidence.emails.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-white/50 mb-1 flex items-center gap-1">
                            <Mail className="h-3 w-3" /> Emails
                          </p>
                          <div className="space-y-1">
                            {suggestion.evidence.emails.slice(0, 3).map((email, i) => (
                              <p key={i} className="text-xs text-white/70 truncate pl-4">
                                {email.date}: {email.subject}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {suggestion.evidence.documents && suggestion.evidence.documents.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-white/50 mb-1 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Documents
                          </p>
                          <div className="space-y-1">
                            {suggestion.evidence.documents.slice(0, 3).map((doc, i) => (
                              <p key={i} className="text-xs text-white/70 truncate pl-4">
                                {doc.name}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {suggestion.evidence.mentions && suggestion.evidence.mentions.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-white/50 mb-1 flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> Mentions
                          </p>
                          <div className="space-y-1">
                            {suggestion.evidence.mentions.slice(0, 2).map((mention, i) => (
                              <p key={i} className="text-xs text-white/70 pl-4 line-clamp-2">
                                "{mention.context}"
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {suggestion.evidence.meetings && suggestion.evidence.meetings.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs text-white/50 mb-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Meetings
                          </p>
                          <div className="space-y-1">
                            {suggestion.evidence.meetings.slice(0, 3).map((meeting, i) => (
                              <p key={i} className="text-xs text-white/70 truncate pl-4">
                                {meeting.date}: {meeting.title}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Merge option */}
                      {existingClients.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-xs text-white/50 mb-2 flex items-center gap-1">
                            <Merge className="h-3 w-3" /> Merge into existing
                          </p>
                          <div className="flex items-center gap-2">
                            <select
                              value={mergeTargetId[suggestion.id] || ''}
                              onChange={(e) => setMergeTargetId({
                                ...mergeTargetId,
                                [suggestion.id]: e.target.value,
                              })}
                              className="flex-1 text-sm bg-white/5 border border-white/10 rounded px-2 py-1.5 text-white focus:outline-none focus:border-cyan-500/50"
                            >
                              <option value="">Select client...</option>
                              {existingClients.map((client) => (
                                <option key={client.id} value={client.id}>
                                  {client.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleMerge(suggestion.id)}
                              disabled={!mergeTargetId[suggestion.id] || isProcessing}
                              className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-sm disabled:opacity-50 transition-colors"
                            >
                              Merge
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex border-t border-white/5">
                    <button
                      onClick={() => handleReject(suggestion.id)}
                      disabled={isProcessing}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" />
                      Dismiss
                    </button>
                    <div className="w-px bg-white/5" />
                    <button
                      onClick={() => handleApprove(suggestion)}
                      disabled={isProcessing}
                      className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-white/50 hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Add Client
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
