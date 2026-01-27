'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Loader2,
  Mic,
  MicOff,
  Volume2,
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  input_source?: 'typed' | 'voice'
}

interface Conversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
  messageCount: number
}

// Session storage key for persisting conversation ID
const ACTIVE_CONV_KEY = 'jorkel-chat-active-conversation-id'

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const isVoiceInputRef = useRef(false)

  // Ref to track the current conversation ID (avoids stale closure issues)
  const activeConversationIdRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
    // Persist to sessionStorage
    if (activeConversationId) {
      sessionStorage.setItem(ACTIVE_CONV_KEY, activeConversationId)
    }
  }, [activeConversationId])

  // Restore from sessionStorage on mount
  useEffect(() => {
    const savedId = sessionStorage.getItem(ACTIVE_CONV_KEY)
    if (savedId && !activeConversationId) {
      setActiveConversationId(savedId)
      loadMessages(savedId)
    }
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  // Load conversations on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'en-US'

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognitionRef.current.onresult = (event: any) => {
          let transcript = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript
          }
          setInput(transcript)
          isVoiceInputRef.current = true
        }

        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }
  }, [])

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true)
      const response = await fetch('/api/conversations')
      if (response.ok) {
        const data = await response.json()
        setConversations(data.conversations || [])
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsLoadingConversations(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      recognitionRef.current?.start()
      setIsListening(true)
      isVoiceInputRef.current = true
    }
  }

  const createNewConversation = () => {
    setActiveConversationId(null)
    activeConversationIdRef.current = null
    sessionStorage.removeItem(ACTIVE_CONV_KEY)
    setMessages([])
    setInput('')
  }

  const deleteConversation = async (id: string) => {
    try {
      const response = await fetch('/api/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id }),
      })

      if (response.ok) {
        setConversations(prev => prev.filter(c => c.id !== id))
        if (activeConversationId === id) {
          setActiveConversationId(null)
          setMessages([])
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
    }
  }

  const selectConversation = async (conv: Conversation) => {
    setActiveConversationId(conv.id)
    activeConversationIdRef.current = conv.id
    sessionStorage.setItem(ACTIVE_CONV_KEY, conv.id)
    await loadMessages(conv.id)
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return

    // Stop listening if active
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    }

    const userMessageContent = input.trim()
    const wasVoiceInput = isVoiceInputRef.current
    isVoiceInputRef.current = false

    // Use ref for conversation ID to avoid stale closure
    const currentConversationId = activeConversationIdRef.current

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessageContent,
      created_at: new Date().toISOString(),
      input_source: wasVoiceInput ? 'voice' : 'typed',
    }

    setMessages(prev => [...prev, tempUserMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessageContent,
          conversationId: currentConversationId,
          inputSource: wasVoiceInput ? 'voice' : 'typed',
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMessage])

      // ALWAYS update conversation ID from server response
      if (data.conversationId) {
        setActiveConversationId(data.conversationId)
        activeConversationIdRef.current = data.conversationId
        sessionStorage.setItem(ACTIVE_CONV_KEY, data.conversationId)

        // Refresh conversations list if this was a new conversation
        if (!currentConversationId) {
          loadConversations()
        } else {
          // Update the conversation in the list (move to top, update title if needed)
          setConversations(prev => {
            const existing = prev.find(c => c.id === data.conversationId)
            if (existing) {
              return [
                {
                  ...existing,
                  updated_at: new Date().toISOString(),
                  title: existing.title || userMessageContent.slice(0, 30) + (userMessageContent.length > 30 ? '...' : ''),
                  messageCount: existing.messageCount + 2,
                },
                ...prev.filter(c => c.id !== data.conversationId),
              ]
            }
            return prev
          })
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, isListening])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex overflow-hidden -m-8 -mt-4">
      {/* Sidebar - Conversation History */}
      <div className="w-64 bg-black/20 backdrop-blur-xl border-r border-white/5 flex flex-col">
        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/30" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-white/30 text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    activeConversationId === conv.id
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                  }`}
                  onClick={() => selectConversation(conv)}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{conv.title || 'New conversation'}</span>
                    <span className="text-[10px] text-white/30">{formatTime(conv.updated_at)}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-white/40 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-4 border border-white/10">
                <MessageSquare className="h-8 w-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-medium text-white mb-2">Chat with Jorkel</h2>
              <p className="text-white/40 text-sm max-w-sm">
                Ask questions, get help with tasks, or just have a conversation.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 text-white border border-cyan-500/30'
                        : 'bg-white/5 text-white/90 border border-white/10'
                    }`}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === 'user' && (
                      <div className="flex items-center gap-1 mt-2 text-[10px] text-white/30">
                        {msg.input_source === 'voice' ? (
                          <>
                            <Volume2 className="h-3 w-3" />
                            <span>Voice</span>
                          </>
                        ) : (
                          <>
                            <MessageSquare className="h-3 w-3" />
                            <span>Typed</span>
                          </>
                        )}
                        <span className="mx-1">-</span>
                        <span>{formatTime(msg.created_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                      <span className="text-sm text-white/50">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-white/5 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl p-2">
              <button
                onClick={toggleListening}
                className={`p-2.5 rounded-xl transition-colors ${
                  isListening
                    ? 'bg-red-500/20 text-red-400'
                    : 'hover:bg-white/10 text-white/40 hover:text-white'
                }`}
              >
                {isListening ? (
                  <MicOff className="h-5 w-5" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  // Only mark as typed if user is actually typing, not voice input
                  if (!isListening) {
                    isVoiceInputRef.current = false
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Message Jorkel..."
                className="flex-1 bg-transparent resize-none text-white placeholder:text-white/30 text-sm py-2.5 px-2 focus:outline-none max-h-[200px]"
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="p-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-white/10 disabled:text-white/20 text-black rounded-xl transition-colors"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-center text-[10px] text-white/20 mt-2">
              Jorkel can make mistakes. Consider checking important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
