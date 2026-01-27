'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Mic, MicOff, Loader2, Volume2, VolumeX, Pause, Play } from 'lucide-react'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { useTTS } from '@/hooks/use-tts'
import { useVADInterrupt } from '@/hooks/use-vad-interrupt'
import { useAIStore } from '@/stores/ai-store'

interface ChatPopoverProps {
  onClose: () => void
}

// Generate a session ID that persists for this browser session
function getOrCreateSessionConversationId(): string {
  const storageKey = 'jorkel-session-conversation-id'
  let sessionId = sessionStorage.getItem(storageKey)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    sessionStorage.setItem(storageKey, sessionId)
  }
  return sessionId
}

export function ChatPopover({ onClose }: ChatPopoverProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Synced text reveal state
  const [speakingText, setSpeakingText] = useState<string | null>(null)
  const [revealedLength, setRevealedLength] = useState(0)
  const revealIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Session-based conversation ID - same for entire login session
  const sessionConversationIdRef = useRef<string | null>(null)

  // Global store for conversation memory and state
  const messages = useAIStore((state) => state.messages)
  const conversationId = useAIStore((state) => state.conversationId)
  const isPaused = useAIStore((state) => state.isPaused)
  const aiState = useAIStore((state) => state.state)
  const hasHydrated = useAIStore((state) => state._hasHydrated)
  const setAIState = useAIStore((state) => state.setState)
  const setConversationId = useAIStore((state) => state.setConversationId)
  const addMessage = useAIStore((state) => state.addMessage)
  const setMessages = useAIStore((state) => state.setMessages)
  const setPaused = useAIStore((state) => state.setPaused)
  const interrupt = useAIStore((state) => state.interrupt)

  // Initialize session conversation ID on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sessionId = getOrCreateSessionConversationId()
      sessionConversationIdRef.current = sessionId
      // If store doesn't have this ID, set it
      if (conversationId !== sessionId) {
        setConversationId(sessionId)
      }
    }
  }, [conversationId, setConversationId])

  // Refs for callback stability
  const handleSendMessageRef = useRef<((text: string, inputSource?: 'typed' | 'voice') => Promise<void>) | null>(null)
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null)

  // Function to start synced text reveal
  const startSyncedReveal = useCallback((text: string) => {
    setSpeakingText(text)
    setRevealedLength(0)

    // Clear any existing interval
    if (revealIntervalRef.current) {
      clearInterval(revealIntervalRef.current)
    }

    // Calculate reveal speed: ~150 chars per second for natural speech
    const charsPerSecond = 12 // Reveal ~12 chars per 100ms tick
    const totalDuration = (text.length / 150) * 1000 // Estimated TTS duration
    const intervalMs = 100
    const charsPerTick = Math.max(1, Math.ceil(text.length / (totalDuration / intervalMs)))

    let currentLength = 0
    revealIntervalRef.current = setInterval(() => {
      currentLength += charsPerTick
      if (currentLength >= text.length) {
        currentLength = text.length
        if (revealIntervalRef.current) {
          clearInterval(revealIntervalRef.current)
          revealIntervalRef.current = null
        }
      }
      setRevealedLength(currentLength)
    }, intervalMs)
  }, [])

  // Function to complete reveal immediately
  const completeReveal = useCallback(() => {
    if (revealIntervalRef.current) {
      clearInterval(revealIntervalRef.current)
      revealIntervalRef.current = null
    }
    if (speakingText) {
      setRevealedLength(speakingText.length)
    }
    // Small delay then clear speaking state
    setTimeout(() => {
      setSpeakingText(null)
      setRevealedLength(0)
    }, 100)
  }, [speakingText])

  // TTS hook with interrupt callback
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS({
    onInterrupted: () => {
      // Speech was interrupted - complete the text reveal immediately
      completeReveal()
    },
    onEnd: () => {
      // Speech finished naturally - ensure text is fully revealed
      completeReveal()
    },
  })

  // Voice input hook
  const { state: voiceState, isRecording, startRecording, stopRecording } = useVoiceInput({
    onTranscript: (text) => {
      if (text.trim()) {
        handleSendMessageRef.current?.(text, 'voice')
      }
    },
    onError: (error) => {
      console.error('Voice input error:', error)
    },
  })

  // Update refs
  startRecordingRef.current = startRecording

  // VAD-based auto-interrupt when user speaks over AI
  useVADInterrupt({
    enabled: autoSpeak && !isRecording, // Only active when auto-speak is on and not already recording
    threshold: 0.12,
    onInterrupt: () => {
      // User spoke over the AI - start recording their input
      stopSpeaking()
      setTimeout(() => {
        startRecordingRef.current?.()
      }, 100)
    },
  })

  // Load session conversation on mount
  useEffect(() => {
    const initializeConversation = async () => {
      if (isInitialized) return
      if (typeof window === 'undefined') return

      // Get the session conversation ID
      const sessionId = getOrCreateSessionConversationId()
      sessionConversationIdRef.current = sessionId

      // Set in store if different
      if (conversationId !== sessionId) {
        setConversationId(sessionId)
      }

      // Try to load existing messages from server for this session
      try {
        const response = await fetch(`/api/conversations/${sessionId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.messages && data.messages.length > 0) {
            // Convert server messages to store format
            const storeMessages = data.messages.map((m: { role: string; content: string; created_at: string }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: new Date(m.created_at).getTime(),
            }))
            setMessages(storeMessages)
          }
        }
        // 404 is fine - conversation will be created on first message
      } catch (error) {
        console.error('Failed to load conversation:', error)
      }

      setIsInitialized(true)
    }

    initializeConversation()
  }, [isInitialized, conversationId, setConversationId, setMessages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, revealedLength]) // Also scroll when text reveals

  // Cleanup reveal interval on unmount
  useEffect(() => {
    return () => {
      if (revealIntervalRef.current) {
        clearInterval(revealIntervalRef.current)
      }
    }
  }, [])

  // Update AI state based on voice/loading state
  useEffect(() => {
    if (isPaused) {
      // Don't change state when paused
      return
    }
    if (isRecording) {
      setAIState('listening')
    } else if (voiceState === 'transcribing' || isLoading) {
      setAIState('processing')
    } else if (isSpeaking) {
      setAIState('speaking')
    } else if (aiState !== 'idle') {
      setAIState('idle')
    }
  }, [isRecording, voiceState, isLoading, isSpeaking, isPaused, aiState, setAIState])

  // Handle orb/mic click - interrupt if speaking, otherwise toggle recording
  const handleMicClick = useCallback(async () => {
    if (isPaused) {
      // Resume from pause
      setPaused(false)
      return
    }

    if (isSpeaking) {
      // Interrupt speech and start listening
      interrupt()
      stopSpeaking()
      // Small delay then start recording
      setTimeout(() => {
        startRecording()
      }, 100)
      return
    }

    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }, [isPaused, isSpeaking, isRecording, interrupt, stopSpeaking, startRecording, stopRecording, setPaused])

  // Long press to pause completely
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const handleMicMouseDown = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      // Long press - toggle pause
      if (isPaused) {
        setPaused(false)
      } else {
        interrupt()
        stopSpeaking()
        setPaused(true)
      }
    }, 600) // 600ms for long press
  }, [isPaused, interrupt, stopSpeaking, setPaused])

  const handleMicMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleSendMessage = useCallback(async (messageText: string, inputSource: 'typed' | 'voice' = 'typed') => {
    if (!messageText.trim() || isLoading || isPaused) return

    const userMessage = messageText.trim()
    setInput('')

    // Get the session conversation ID - this is the source of truth
    const activeConversationId = sessionConversationIdRef.current || getOrCreateSessionConversationId()

    // Ensure store has the correct ID
    if (conversationId !== activeConversationId) {
      setConversationId(activeConversationId)
    }

    // Add to global store (persisted)
    addMessage('user', userMessage)
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversationId: activeConversationId, // Always use the session ID
          inputSource,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()

      // Add assistant response to global store
      addMessage('assistant', data.response)

      // Auto-speak the response with synced text reveal (unless paused)
      if (autoSpeak && data.response && !isPaused) {
        startSyncedReveal(data.response)
        speak(data.response)
      }

    } catch {
      addMessage('assistant', 'Sorry, I had trouble processing that. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, isPaused, addMessage, conversationId, setConversationId, autoSpeak, speak, startSyncedReveal])

  // Update ref for voice input callback
  handleSendMessageRef.current = handleSendMessage

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    handleSendMessage(input, 'typed')
  }

  const toggleAutoSpeak = () => {
    if (isSpeaking) {
      stopSpeaking()
    }
    setAutoSpeak(!autoSpeak)
  }

  const togglePause = () => {
    if (isPaused) {
      setPaused(false)
    } else {
      interrupt()
      stopSpeaking()
      setPaused(true)
    }
  }

  // Get status text
  const getStatusText = () => {
    if (isPaused) return 'Paused'
    if (isRecording) return 'Listening...'
    if (isSpeaking) return 'Speaking... (tap to interrupt)'
    if (voiceState === 'transcribing') return 'Transcribing...'
    if (isLoading) return 'Thinking...'
    return 'Ready'
  }

  return (
    <div className="chat-popover">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            isPaused
              ? 'bg-gray-500'
              : isRecording
              ? 'bg-red-500 animate-pulse'
              : isSpeaking
              ? 'bg-gradient-to-br from-cyan-500 to-purple-500 animate-pulse'
              : 'bg-gradient-to-br from-cyan-500 to-purple-500'
          }`}>
            {isPaused ? <Pause className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-white" />}
          </div>
          <div>
            <h3 className="text-sm font-medium text-white text-display">Jorkel</h3>
            <p className="text-xs text-white/50">
              {getStatusText()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Pause toggle */}
          <button
            onClick={togglePause}
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
              isPaused ? 'bg-amber-500/20 text-amber-400' : 'glass-button text-white/50 hover:text-white'
            }`}
            title={isPaused ? 'Resume' : 'Pause AI'}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          {/* Auto-speak toggle */}
          <button
            onClick={toggleAutoSpeak}
            className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
              autoSpeak ? 'bg-cyan-500/20 text-cyan-400' : 'glass-button text-white/50 hover:text-white'
            }`}
            title={autoSpeak ? 'Auto-speak on' : 'Auto-speak off'}
          >
            {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg glass-button flex items-center justify-center text-white/50 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[300px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center mb-3">
              <Mic className="h-6 w-6 text-cyan-400" />
            </div>
            <p className="text-sm text-white/70 mb-1">How can I help?</p>
            <p className="text-xs text-white/40">Tap the mic or type your message</p>
          </div>
        ) : (
          messages.map((message, index) => {
            // Check if this is the last assistant message and we're speaking
            const isLastAssistantMessage =
              message.role === 'assistant' &&
              index === messages.length - 1
            const isSpeakingThis = isLastAssistantMessage && speakingText && isSpeaking

            // Show synced text reveal if speaking, otherwise full content
            const displayContent = isSpeakingThis
              ? speakingText.slice(0, revealedLength) + (revealedLength < speakingText.length ? '▊' : '')
              : message.content

            return (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-cyan-500 to-purple-500 text-white'
                      : 'bg-white/5 text-white/90 border border-white/10'
                  }`}
                >
                  {displayContent}
                </div>
              </div>
            )
          })
        )}
        {(isLoading || voiceState === 'transcribing') && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
              <span className="text-sm text-white/50">
                {voiceState === 'transcribing' ? 'Transcribing...' : 'Thinking...'}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          {/* Voice input button - tap to interrupt/record, long press to pause */}
          <button
            type="button"
            onClick={handleMicClick}
            onMouseDown={handleMicMouseDown}
            onMouseUp={handleMicMouseUp}
            onMouseLeave={handleMicMouseUp}
            onTouchStart={handleMicMouseDown}
            onTouchEnd={handleMicMouseUp}
            disabled={voiceState === 'transcribing'}
            className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all ${
              isPaused
                ? 'bg-gray-500 text-white'
                : isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : isSpeaking
                ? 'bg-gradient-to-br from-cyan-500 to-purple-500 text-white animate-pulse'
                : 'glass-button text-white/70 hover:text-white hover:bg-white/10'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isSpeaking ? 'Tap to interrupt' : isPaused ? 'Tap to resume' : 'Hold to record'}
          >
            {isPaused ? <Play className="h-5 w-5" /> : isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRecording ? 'Listening...' : 'Message Jorkel...'}
            className="flex-1 glass-input px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none"
            disabled={isLoading || isRecording || voiceState === 'transcribing'}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || isRecording}
            className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/25 transition-shadow"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  )
}
