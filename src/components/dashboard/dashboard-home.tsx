'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Orb } from '@/components/ui/orb'
import { useAIStore } from '@/stores/ai-store'
import { usePrivacyStore, mockFinancialData } from '@/stores/privacy-store'
import { GmailWidget } from '@/components/widgets/gmail-widget'

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onspeechend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

const SILENCE_TIMEOUT = 2500 // 2.5 seconds of silence before sending
const ELEVENLABS_VOICE_ID = 'G17SuINrv2H9FC6nvetn' // Custom voice
const CONVERSATION_KEY = 'jorkel-dashboard-conversation-id'
const CONVERSATION_TIMESTAMP_KEY = 'jorkel-conversation-timestamp'
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// Check if conversation is expired (older than 24 hours)
function isConversationExpired(): boolean {
  if (typeof window === 'undefined') return false
  const timestamp = sessionStorage.getItem(CONVERSATION_TIMESTAMP_KEY)
  if (!timestamp) return true
  const elapsed = Date.now() - parseInt(timestamp, 10)
  return elapsed > TWENTY_FOUR_HOURS
}

interface BankAccount {
  id: string
  account_name: string
  institution_name: string | null
  current_balance: number | null
}

interface Transaction {
  id: string
  date: string
  description: string
  merchant_name: string | null
  amount: number
  category: { name: string; color: string | null } | null
}

interface DashboardHomeProps {
  totalBalance: number
  monthIncome: number
  monthExpenses: number
  monthNet: number
  accounts: BankAccount[]
  recentTransactions: Transaction[]
  documentCount: number
  clientCount: number
  suggestionCount?: number
}

// Mock data for rotating cards
const mockEmails = [
  { id: '1', from: 'Mary Cramer', subject: 'Re: Jane AI invoice', time: '2h ago', urgent: true },
  { id: '2', from: 'Haokun', subject: 'Deployment ready for review', time: '4h ago', urgent: false },
  { id: '3', from: 'Alex Chen', subject: 'Q1 projections review needed', time: 'Yesterday', urgent: true },
]

const mockUpcoming = [
  { id: '1', title: 'Meeting with Charles', time: '8:00 PM', type: 'meeting' },
  { id: '2', title: 'Call with Johnny', time: 'Tomorrow 10:00 AM', type: 'call' },
  { id: '3', title: 'Prospect demo', time: 'Tomorrow 2:00 PM', type: 'meeting' },
]

const CARD_ROTATION_INTERVAL = 12000 // 12 seconds

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening' // 5 PM onwards until 5 AM
}

export function DashboardHome({
  totalBalance: realTotalBalance,
  monthIncome: realMonthIncome,
  monthExpenses: realMonthExpenses,
  monthNet: realMonthNet,
  accounts: realAccounts,
  recentTransactions: realRecentTransactions,
  documentCount,
  clientCount,
  suggestionCount = 0,
}: DashboardHomeProps) {
  // Voice state
  const [isListening, setIsListening] = useState(false)

  // Entrance animation states
  const [showOrb, setShowOrb] = useState(false)
  const [showGreeting, setShowGreeting] = useState(false)
  const [showCards, setShowCards] = useState(false)

  // Greeting typewriter state
  const [displayedGreeting, setDisplayedGreeting] = useState('')
  const [greetingComplete, setGreetingComplete] = useState(false)

  // Rotating cards state - max 2 cards per slot
  // Left top: (0: balance+graph, 1: P&L)
  const [leftTopIndex, setLeftTopIndex] = useState(0)
  // Left bottom: (0: accounts, 1: emails)
  const [leftBottomIndex, setLeftBottomIndex] = useState(0)
  // Right top: (0: monthly summary, 1: upcoming events)
  const [rightTopIndex, setRightTopIndex] = useState(0)
  // Right bottom: (0: recent activity, 1: stats)
  const [rightBottomIndex, setRightBottomIndex] = useState(0)

  // S&P 500 live data
  const [spData, setSpData] = useState<{ date: string; close: number }[]>([])
  const [spLoading, setSpLoading] = useState(true)

  const [userTranscript, setUserTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [displayedResponse, setDisplayedResponse] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [reportUrl, setReportUrl] = useState<string | null>(null)
  const [showDownloadOverlay, setShowDownloadOverlay] = useState(false)
  const [driveLink, setDriveLink] = useState<{ url: string; name: string } | null>(null)
  const [showDriveOverlay, setShowDriveOverlay] = useState(false)
  const downloadTimerRef = useRef<NodeJS.Timeout | null>(null)
  const driveLinkTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(() => {
    // Initialize from sessionStorage if available and not expired
    if (typeof window !== 'undefined') {
      if (isConversationExpired()) {
        // Clear old conversation, start fresh (memories persist in DB)
        sessionStorage.removeItem(CONVERSATION_KEY)
        sessionStorage.removeItem(CONVERSATION_TIMESTAMP_KEY)
        console.log('[Conversation] Starting fresh 24-hour session')
        return null
      }
      return sessionStorage.getItem(CONVERSATION_KEY)
    }
    return null
  })

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const conversationIdRef = useRef<string | null>(conversationId)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const transcriptClearTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Audio level detection for interrupt threshold
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const INTERRUPT_DB_THRESHOLD = -35 // dB threshold for voice detection (adjust as needed)


  // Refs to track current values for silence timer (avoids stale closures)
  const userTranscriptRef = useRef('')
  const interimTranscriptRef = useRef('')
  const isListeningRef = useRef(false)
  const isProcessingRef = useRef(false)

  // Use global AI store for state
  const setAIState = useAIStore((state) => state.setState)
  const setAudioElement = useAIStore((state) => state.setAudioElement)
  const voiceTrigger = useAIStore((state) => state.voiceTrigger)

  // Privacy mode - show mock data when enabled
  const privacyMode = usePrivacyStore((state) => state.privacyMode)
  const privacyHydrated = usePrivacyStore((state) => state._hasHydrated)

  // Derive actual data based on privacy mode
  const totalBalance = privacyHydrated && privacyMode ? mockFinancialData.totalBalance : realTotalBalance
  const monthIncome = privacyHydrated && privacyMode ? mockFinancialData.monthIncome : realMonthIncome
  const monthExpenses = privacyHydrated && privacyMode ? mockFinancialData.monthExpenses : realMonthExpenses
  const monthNet = privacyHydrated && privacyMode ? mockFinancialData.monthNet : realMonthNet
  const accounts = privacyHydrated && privacyMode ? mockFinancialData.accounts : realAccounts
  const recentTransactions = privacyHydrated && privacyMode ? mockFinancialData.recentTransactions : realRecentTransactions

  const greeting = `${getGreeting()}, Sir.`

  // Staggered entrance animation
  useEffect(() => {
    // Orb fades in first
    const orbTimer = setTimeout(() => setShowOrb(true), 100)
    // Then greeting after orb appears
    const greetingTimer = setTimeout(() => setShowGreeting(true), 600)
    // Then cards and taskbar
    const cardsTimer = setTimeout(() => setShowCards(true), 1200)

    return () => {
      clearTimeout(orbTimer)
      clearTimeout(greetingTimer)
      clearTimeout(cardsTimer)
    }
  }, [])

  // Typewriter effect for greeting - starts after showGreeting
  useEffect(() => {
    if (showGreeting && !greetingComplete) {
      let charIndex = 0
      const timer = setInterval(() => {
        if (charIndex <= greeting.length) {
          setDisplayedGreeting(greeting.slice(0, charIndex))
          charIndex++
        } else {
          clearInterval(timer)
          setGreetingComplete(true)
        }
      }, 50) // 50ms per character
      return () => clearInterval(timer)
    }
  }, [greeting, greetingComplete, showGreeting])

  // Fetch S&P 500 data on mount
  useEffect(() => {
    async function fetchSPData() {
      try {
        const res = await fetch('/api/market/sp500')
        if (res.ok) {
          const data = await res.json()
          setSpData(data)
        }
      } catch (e) {
        console.log('Failed to fetch S&P data:', e)
      } finally {
        setSpLoading(false)
      }
    }
    fetchSPData()
  }, [])

  // Card rotation effect - staggered timing for each slot
  useEffect(() => {
    const leftTopTimer = setInterval(() => {
      setLeftTopIndex((prev) => (prev + 1) % 2)
    }, CARD_ROTATION_INTERVAL)

    const leftBottomTimer = setInterval(() => {
      setLeftBottomIndex((prev) => (prev + 1) % 2)
    }, CARD_ROTATION_INTERVAL + 4000)

    const rightTopTimer = setInterval(() => {
      setRightTopIndex((prev) => (prev + 1) % 2)
    }, CARD_ROTATION_INTERVAL + 2000)

    const rightBottomTimer = setInterval(() => {
      setRightBottomIndex((prev) => (prev + 1) % 2)
    }, CARD_ROTATION_INTERVAL + 6000)

    return () => {
      clearInterval(leftTopTimer)
      clearInterval(leftBottomTimer)
      clearInterval(rightTopTimer)
      clearInterval(rightBottomTimer)
    }
  }, [])

  const getOrbState = (): 'idle' | 'listening' | 'processing' | 'speaking' => {
    if (isSpeaking) return 'speaking'
    if (isProcessing) return 'processing'
    if (isListening) return 'listening'
    return 'idle'
  }

  // Sync local state with global store
  useEffect(() => {
    setAIState(getOrbState())
  }, [isListening, isProcessing, isSpeaking, setAIState])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatCurrencyParts = (amount: number) => {
    const dollars = Math.floor(Math.abs(amount))
    const cents = Math.abs(amount % 1).toFixed(2).substring(2)
    const sign = amount < 0 ? '-' : ''
    return { sign, dollars: dollars.toLocaleString('en-US'), cents }
  }

  const balanceParts = formatCurrencyParts(totalBalance)

  // Keep conversationId ref in sync and persist to sessionStorage
  useEffect(() => {
    conversationIdRef.current = conversationId
    if (conversationId) {
      sessionStorage.setItem(CONVERSATION_KEY, conversationId)
    }
  }, [conversationId])

  // Keep refs in sync with state for silence timer
  useEffect(() => {
    userTranscriptRef.current = userTranscript
  }, [userTranscript])

  useEffect(() => {
    interimTranscriptRef.current = interimTranscript
  }, [interimTranscript])

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const stopListeningAndSend = useCallback(async () => {
    setIsListening(false)
    clearSilenceTimer()
    recognitionRef.current?.stop()

    const finalTranscript = userTranscriptRef.current + interimTranscriptRef.current
    setUserTranscript(finalTranscript)
    setInterimTranscript('')

    if (finalTranscript.trim()) {
      await sendMessage(finalTranscript.trim())
    }
  }, [clearSilenceTimer])

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      // Use refs to get current values (not stale closure values)
      const transcript = userTranscriptRef.current + interimTranscriptRef.current
      if (transcript.trim() && isListeningRef.current) {
        stopListeningAndSend()
      }
    }, SILENCE_TIMEOUT)
  }, [clearSilenceTimer, stopListeningAndSend])

  // Clear transcript after 10 seconds of inactivity
  const TRANSCRIPT_CLEAR_TIMEOUT = 10000

  const clearTranscriptTimer = useCallback(() => {
    if (transcriptClearTimerRef.current) {
      clearTimeout(transcriptClearTimerRef.current)
      transcriptClearTimerRef.current = null
    }
  }, [])

  const startTranscriptClearTimer = useCallback(() => {
    clearTranscriptTimer()
    transcriptClearTimerRef.current = setTimeout(() => {
      setUserTranscript('')
      setInterimTranscript('')
      userTranscriptRef.current = ''
      interimTranscriptRef.current = ''
    }, TRANSCRIPT_CLEAR_TIMEOUT)
  }, [clearTranscriptTimer])

  // Start/reset transcript clear timer when transcript changes
  useEffect(() => {
    if (userTranscript || interimTranscript) {
      startTranscriptClearTimer()
    }
    return () => clearTranscriptTimer()
  }, [userTranscript, interimTranscript, startTranscriptClearTimer, clearTranscriptTimer])

  // Track if we should accept speech results
  const shouldAcceptSpeechRef = useRef(false)
  const isSpeakingRef = useRef(false)

  // Update refs when states change
  useEffect(() => {
    shouldAcceptSpeechRef.current = isListening && !isProcessing && !isSpeaking
  }, [isListening, isProcessing, isSpeaking])

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  // Show download overlay when report is ready and AI stops speaking
  useEffect(() => {
    if (reportUrl && !isSpeaking) {
      setShowDownloadOverlay(true)
    }
  }, [reportUrl, isSpeaking])

  // Show Drive link overlay when file link is ready and AI stops speaking
  useEffect(() => {
    if (driveLink && !isSpeaking) {
      setShowDriveOverlay(true)
    }
  }, [driveLink, isSpeaking])

  // Handle download click - fade orb back in after delay
  const handleDownloadClick = () => {
    // Clear any existing timer
    if (downloadTimerRef.current) {
      clearTimeout(downloadTimerRef.current)
    }
    // Start timer to fade orb back in
    downloadTimerRef.current = setTimeout(() => {
      setShowDownloadOverlay(false)
      setReportUrl(null)
    }, 8000) // 8 seconds
  }

  // Handle Drive link click - fade orb back in after delay
  const handleDriveLinkClick = () => {
    // Clear any existing timer
    if (driveLinkTimerRef.current) {
      clearTimeout(driveLinkTimerRef.current)
    }
    // Start timer to fade orb back in
    driveLinkTimerRef.current = setTimeout(() => {
      setShowDriveOverlay(false)
      setDriveLink(null)
    }, 8000) // 8 seconds
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) {
        clearTimeout(downloadTimerRef.current)
      }
      if (driveLinkTimerRef.current) {
        clearTimeout(driveLinkTimerRef.current)
      }
    }
  }, [])

  // Get current audio level in dB
  const getAudioLevel = useCallback((): number => {
    if (!analyserRef.current) return -100

    const dataArray = new Uint8Array(analyserRef.current.fftSize)
    analyserRef.current.getByteTimeDomainData(dataArray)

    // Calculate RMS
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128
      sum += normalized * normalized
    }
    const rms = Math.sqrt(sum / dataArray.length)

    // Convert to dB
    const db = 20 * Math.log10(Math.max(rms, 0.0001))
    return db
  }, [])

  // Setup audio level monitoring for interrupt detection
  const setupAudioMonitoring = useCallback(async () => {
    try {
      if (!micStreamRef.current) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      if (!analyserRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser()
        analyserRef.current.fftSize = 256

        const source = audioContextRef.current.createMediaStreamSource(micStreamRef.current)
        source.connect(analyserRef.current)
      }
    } catch (e) {
      console.log('Audio monitoring setup failed:', e)
    }
  }, [])

  // Keep speech recognition running during TTS for interrupt detection
  // but only process results when not speaking
  useEffect(() => {
    if (isProcessing) {
      try {
        recognitionRef.current?.stop()
      } catch {
        // Already stopped
      }
      setInterimTranscript('')
    }
  }, [isProcessing])

  // Initialize speech recognition (only once)
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      recognitionRef.current = new SR()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let final = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            final += transcript
          } else {
            interim += transcript
          }
        }

        // Auto-interrupt disabled - user must click button to interrupt
        // Voice interrupt was causing false triggers
        if (isSpeakingRef.current) {
          // Ignore speech input while AI is speaking
          return
        }

        // Only accept results when actively listening (not processing)
        if (!shouldAcceptSpeechRef.current) return

        setInterimTranscript(interim)
        if (final) {
          setUserTranscript(prev => prev + final)
        }

        if (interim || final) {
          startSilenceTimer()
        }
      }

      recognitionRef.current.onend = () => {
        // Restart only if actively listening (not during TTS - interrupt disabled)
        if (shouldAcceptSpeechRef.current && !isSpeakingRef.current) {
          try {
            recognitionRef.current?.start()
          } catch {
            // Already started
          }
        }
      }

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        // Only log actual errors, not normal timeouts
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error('Speech recognition error:', event.error)
        }
        if (event.error === 'not-allowed') {
          setIsListening(false)
        }
      }

      recognitionRef.current.onspeechend = () => {
        if (shouldAcceptSpeechRef.current) {
          startSilenceTimer()
        }
      }
    }

    // Create audio element for TTS
    audioRef.current = new Audio()
    setAudioElement(audioRef.current)

    // Setup audio monitoring for interrupt detection
    setupAudioMonitoring()

    return () => {
      clearSilenceTimer()
      recognitionRef.current?.stop()
      setAudioElement(null)
      // Cleanup audio monitoring
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [startSilenceTimer, clearSilenceTimer, setAudioElement, setupAudioMonitoring, getAudioLevel])

  // Animate AI response display with chunk-based fade transitions
  const MAX_WORDS_PER_CHUNK = 20
  const [isChunkFading, setIsChunkFading] = useState(false)

  useEffect(() => {
    if (aiResponse && isSpeaking) {
      const words = aiResponse.split(' ')
      let wordIndex = 0
      let currentChunkStart = 0
      const wordsPerSecond = 3.5

      const timer = setInterval(() => {
        if (wordIndex < words.length) {
          wordIndex++
          const wordsInCurrentChunk = wordIndex - currentChunkStart

          // Check if we need to transition to a new chunk
          if (wordsInCurrentChunk > MAX_WORDS_PER_CHUNK && wordIndex < words.length) {
            // Fade out current chunk, then show new chunk
            setIsChunkFading(true)
            setTimeout(() => {
              currentChunkStart = wordIndex - 1
              setDisplayedResponse(words.slice(currentChunkStart, wordIndex).join(' '))
              setIsChunkFading(false)
            }, 300) // Match CSS transition duration
          } else {
            // Continue building current chunk
            setDisplayedResponse(words.slice(currentChunkStart, wordIndex).join(' '))
          }
        } else {
          clearInterval(timer)
        }
      }, 1000 / wordsPerSecond)

      return () => clearInterval(timer)
    }
  }, [aiResponse, isSpeaking])

  const startListening = () => {
    setHasStarted(true)
    setUserTranscript('')
    setInterimTranscript('')
    setAiResponse('')
    setDisplayedResponse('')
    setIsListening(true)

    try {
      recognitionRef.current?.start()
    } catch {
      // Already started
    }
  }

  const getLastChunk = useCallback((text: string) => {
    const words = text.split(' ')
    if (words.length <= MAX_WORDS_PER_CHUNK) return text
    return words.slice(-MAX_WORDS_PER_CHUNK).join(' ')
  }, [])

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsSpeaking(false)
    if (aiResponse) {
      setDisplayedResponse(getLastChunk(aiResponse))
    }
  }, [aiResponse, getLastChunk])

  // Respond to voice trigger from taskbar orb
  const voiceTriggerRef = useRef(voiceTrigger)
  useEffect(() => {
    // Skip initial render
    if (voiceTrigger === voiceTriggerRef.current) return
    voiceTriggerRef.current = voiceTrigger

    // Same logic as handleOrbClick
    if (showDownloadOverlay || showDriveOverlay) return

    if (isListening || isSpeaking) {
      if (isSpeaking) {
        stopAudio()
      }
      if (isListening) {
        setIsListening(false)
        clearSilenceTimer()
        recognitionRef.current?.stop()
        // Send if there's a transcript
        const finalTranscript = userTranscriptRef.current + interimTranscriptRef.current
        if (finalTranscript.trim()) {
          sendMessage(finalTranscript.trim())
        }
      }
    } else if (!isProcessing) {
      startListening()
    }
  }, [voiceTrigger, showDownloadOverlay, showDriveOverlay, isListening, isSpeaking, isProcessing, stopAudio, clearSilenceTimer])

  const sendMessage = async (text: string) => {
    setIsProcessing(true)
    setDisplayedResponse('')

    const currentConversationId = conversationIdRef.current

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: currentConversationId,
          inputSource: 'voice',
          stream: true,
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      // Check if streaming response
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('text/event-stream')) {
        // STREAMING RESPONSE
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No reader available')

        const decoder = new TextDecoder()
        let fullResponse = ''
        let newConversationId = currentConversationId

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'start' && data.conversationId) {
                  newConversationId = data.conversationId
                  const isNewConversation = !currentConversationId || data.conversationId !== currentConversationId
                  setConversationId(data.conversationId)
                  conversationIdRef.current = data.conversationId
                  sessionStorage.setItem(CONVERSATION_KEY, data.conversationId)
                  if (isNewConversation) {
                    sessionStorage.setItem(CONVERSATION_TIMESTAMP_KEY, Date.now().toString())
                  }
                } else if (data.type === 'chunk' && data.content) {
                  fullResponse += data.content
                  // Update displayed text in real-time (show last ~200 chars)
                  const displayText = fullResponse.length > 200
                    ? '...' + fullResponse.slice(-200)
                    : fullResponse
                  setDisplayedResponse(displayText)
                } else if (data.type === 'done') {
                  fullResponse = data.fullResponse || fullResponse
                }
              } catch { /* ignore parse errors */ }
            }
          }
        }

        setAiResponse(fullResponse)
        // Play TTS with full response
        await playVoice(fullResponse)

      } else {
        // NON-STREAMING FALLBACK
        const data = await response.json()

        if (data.conversationId) {
          const isNewConversation = !currentConversationId || data.conversationId !== currentConversationId
          setConversationId(data.conversationId)
          conversationIdRef.current = data.conversationId
          sessionStorage.setItem(CONVERSATION_KEY, data.conversationId)
          if (isNewConversation) {
            sessionStorage.setItem(CONVERSATION_TIMESTAMP_KEY, Date.now().toString())
          }
        }

        setAiResponse(data.response)
        if (data.reportUrl) setReportUrl(data.reportUrl)
        if (data.driveLink) setDriveLink(data.driveLink)

        await playVoice(data.response)
      }

    } catch {
      const errorMsg = 'Sorry, I had trouble processing that. Please try again.'
      setAiResponse(errorMsg)
      setDisplayedResponse(getLastChunk(errorMsg))
    } finally {
      setIsProcessing(false)
    }
  }

  const playVoice = async (text: string) => {
    setIsSpeaking(true)
    setDisplayedResponse('')

    // Auto-interrupt disabled - no need to start recognition during TTS

    try {
      console.log('[TTS] Requesting speech for:', text.substring(0, 50) + '...')
      console.log('[TTS] Using voice ID:', ELEVENLABS_VOICE_ID)

      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: ELEVENLABS_VOICE_ID }),
      })

      console.log('[TTS] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[TTS] Error response:', errorText)
        // Fallback: just display text without audio
        setIsSpeaking(false)
        setDisplayedResponse(getLastChunk(text))
        return
      }

      const audioBlob = await response.blob()
      console.log('[TTS] Audio blob size:', audioBlob.size, 'bytes')
      const audioUrl = URL.createObjectURL(audioBlob)

      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.onended = () => {
          setIsSpeaking(false)
          setDisplayedResponse(getLastChunk(text))
          // Auto-restart listening after AI finishes speaking (use ref to avoid stale closure)
          setTimeout(() => {
            if (!isProcessingRef.current) {
              startListening()
            }
          }, 500)
        }
        audioRef.current.onerror = (e) => {
          console.error('[TTS] Audio playback error:', e)
          setIsSpeaking(false)
          setDisplayedResponse(getLastChunk(text))
        }
        console.log('[TTS] Playing audio...')
        await audioRef.current.play()
        console.log('[TTS] Audio playing')
      }
    } catch {
      setIsSpeaking(false)
      setDisplayedResponse(getLastChunk(text))
    }
  }

  const handleOrbClick = () => {
    // Don't allow interruption when download or drive overlay is showing
    if (showDownloadOverlay || showDriveOverlay) {
      return
    }

    // Simple toggle behavior:
    // - Idle -> Start listening
    // - Active (listening/speaking) -> Pause/stop everything

    if (isListening || isSpeaking) {
      // Pause: stop everything
      if (isSpeaking) {
        stopAudio()
      }
      if (isListening) {
        setIsListening(false)
        clearSilenceTimer()
        recognitionRef.current?.stop()
      }
    } else if (!isProcessing) {
      // Start listening
      startListening()
    }
  }

  const getStatusText = () => {
    if (!hasStarted) return 'Tap to start'
    if (isListening) return 'Listening...'
    if (isProcessing) return 'Thinking...'
    if (isSpeaking) return 'Speaking...'
    return 'Tap to continue'
  }

  // Generate simple sparkline data
  const sparklineData = [40, 55, 35, 60, 45, 70, 65, 80, 75, 90, 85, 95]

  // S&P 500 computed values
  const spCurrentPrice = spData.length > 0 ? spData[spData.length - 1].close : 0
  const spStartPrice = spData.length > 0 ? spData[0].close : 0
  const spChange = spStartPrice > 0 ? ((spCurrentPrice - spStartPrice) / spStartPrice) * 100 : 0
  const spIsPositive = spChange >= 0

  // Generate SVG path for S&P 500 chart - clean line segments
  const generateSPPath = useCallback(() => {
    if (spData.length < 2) return { linePath: '', areaPath: '', lastY: 25 }

    const width = 120
    const height = 50
    const padding = 4

    // Sample data points for clean chart
    const sampleRate = Math.max(1, Math.floor(spData.length / 30))
    const sampledData = spData.filter((_, i) => i % sampleRate === 0 || i === spData.length - 1)

    const prices = sampledData.map(d => d.close)
    const minPrice = Math.min(...prices) * 0.99
    const maxPrice = Math.max(...prices) * 1.01
    const priceRange = maxPrice - minPrice

    // Map to coordinates
    const points = sampledData.map((d, i) => ({
      x: (i / (sampledData.length - 1)) * width,
      y: height - padding - ((d.close - minPrice) / priceRange) * (height - padding * 2),
    }))

    // Generate path with straight line segments
    let linePath = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
    for (let i = 1; i < points.length; i++) {
      linePath += ` L${points[i].x.toFixed(1)},${points[i].y.toFixed(1)}`
    }

    // Area path (close to bottom)
    const areaPath = `${linePath} L${width},${height} L0,${height} Z`

    // Last point y coordinate for the end dot
    const lastY = points[points.length - 1].y

    return { linePath, areaPath, lastY }
  }, [spData])

  const { linePath: spLinePath, areaPath: spAreaPath, lastY: spLastY } = generateSPPath()

  return (
    <div className="h-[calc(100vh-8rem)] flex items-stretch gap-6 min-h-0">
      {/* Left Panel - Rotating Cards */}
      <div className={`hidden xl:flex flex-col w-72 gap-3 overflow-hidden transition-all duration-700 ease-out ${showCards ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
        {/* Top Card Slot - Balance / P&L */}
        <div className="mercury-card p-4 h-[170px] relative overflow-hidden">
          {/* Subtle indicators inside card */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {[0, 1].map((i) => (
              <button
                key={i}
                onClick={() => setLeftTopIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  leftTopIndex === i ? 'w-3 bg-white/30' : 'w-1 bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Card 0: Balance + Graph */}
          <Link
            href="/dashboard/accounts"
            className={`absolute inset-4 transition-all duration-500 cursor-pointer hover:bg-white/5 rounded-lg -m-2 p-2 ${
              leftTopIndex === 0 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-white/50 mb-2">Total Balance</p>
            <div className="flex items-baseline mb-2">
              <span className="text-2xl font-medium text-white text-display">
                {balanceParts.sign}${balanceParts.dollars}
              </span>
              <span className="text-sm text-white/40 ml-1">.{balanceParts.cents}</span>
            </div>
            <div className="h-12 relative">
              <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0, 212, 255, 0.3)" />
                    <stop offset="100%" stopColor="rgba(0, 212, 255, 0)" />
                  </linearGradient>
                </defs>
                <path
                  d={`M0,${40 - sparklineData[0] * 0.4} ${sparklineData.map((v, i) => `L${(i / (sparklineData.length - 1)) * 100},${40 - v * 0.4}`).join(' ')} L100,40 L0,40 Z`}
                  fill="url(#lineGradient)"
                />
                <path
                  d={`M0,${40 - sparklineData[0] * 0.4} ${sparklineData.map((v, i) => `L${(i / (sparklineData.length - 1)) * 100},${40 - v * 0.4}`).join(' ')}`}
                  fill="none"
                  stroke="rgba(0, 212, 255, 0.8)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {monthNet >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-400" />
              )}
              <span className={`text-[10px] font-medium ${monthNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {monthNet >= 0 ? '+' : ''}{formatCurrency(monthNet)} this month
              </span>
            </div>
          </Link>

          {/* Card 1: P&L Statement */}
          <Link
            href="/dashboard/transactions"
            className={`absolute inset-4 transition-all duration-500 cursor-pointer hover:bg-white/5 rounded-lg -m-2 p-2 ${
              leftTopIndex === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-white/50 mb-3">P&L Statement</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Revenue</span>
                <span className="text-sm text-green-400 font-medium">{formatCurrency(monthIncome)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Expenses</span>
                <span className="text-sm text-red-400 font-medium">-{formatCurrency(monthExpenses)}</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-medium">Net Income</span>
                <span className={`text-base font-semibold ${monthNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {monthNet >= 0 ? '+' : ''}{formatCurrency(monthNet)}
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Bottom Card Slot - Accounts / Emails */}
        <div className="mercury-card p-4 flex-1 relative overflow-hidden">
          {/* Subtle indicators inside card */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {[0, 1].map((i) => (
              <button
                key={i}
                onClick={() => setLeftBottomIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  leftBottomIndex === i ? 'w-3 bg-white/30' : 'w-1 bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Card 0: Accounts */}
          <Link
            href="/dashboard/accounts"
            className={`absolute inset-4 bottom-8 transition-all duration-500 overflow-auto cursor-pointer block ${
              leftBottomIndex === 0 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-white/50">Accounts</p>
              <span className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                View all
              </span>
            </div>
            {accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CreditCard className="h-5 w-5 text-cyan-400 mb-2" />
                <p className="text-xs text-white/50">No accounts connected</p>
              </div>
            ) : (
              <div className="space-y-1">
                {accounts.slice(0, 4).map((account) => (
                  <div key={account.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
                        <CreditCard className="h-3 w-3 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">{account.account_name}</p>
                        <p className="text-[10px] text-white/40">{account.institution_name}</p>
                      </div>
                    </div>
                    <p className={`text-xs font-medium tabular-nums ${(account.current_balance ?? 0) >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {formatCurrency(account.current_balance ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Link>

          {/* Card 1: Gmail Widget */}
          <div className={`absolute inset-4 bottom-8 transition-all duration-500 overflow-auto ${
            leftBottomIndex === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
          }`}>
            <GmailWidget compact />
          </div>
        </div>

        {/* Stats - Fixed */}
        <div className="grid grid-cols-2 gap-2">
          <div className="stat-card !p-3">
            <p className="stat-label !text-[10px] !mb-1">Documents</p>
            <p className="stat-value !text-lg">{documentCount}</p>
          </div>
          <Link href="/dashboard/workstreams" className="stat-card !p-3 hover:bg-white/[0.06] transition-colors relative">
            <p className="stat-label !text-[10px] !mb-1">Clients</p>
            <p className="stat-value !text-lg">{clientCount}</p>
            {suggestionCount > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-purple-500 text-white text-[10px] font-medium flex items-center justify-center">
                {suggestionCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Center Panel - AI Orb */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* Greeting / AI Response - Top area */}
        <div className={`absolute top-0 left-0 right-0 flex items-center justify-center pt-8 transition-all duration-700 ease-out ${showGreeting ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="max-w-2xl px-6 w-full text-center">
            {!hasStarted ? (
              <div>
                <h1 className="text-3xl font-light text-white text-display mb-2 tracking-tight">
                  {displayedGreeting}
                  {showGreeting && !greetingComplete && <span className="typewriter-cursor">|</span>}
                </h1>
                <p className={`text-white/40 text-sm transition-opacity duration-500 ${greetingComplete ? 'opacity-100' : 'opacity-0'}`}>
                  Tap the orb to start talking
                </p>
              </div>
            ) : (
              <>
                {/* AI Response - Typewriter style with chunk fade transitions */}
                {displayedResponse && (
                  <div className="mt-8">
                    <p className={`ai-typewriter text-xl text-white font-light leading-relaxed transition-opacity duration-300 ${isChunkFading ? 'opacity-0' : 'opacity-100'}`}>
                      {displayedResponse}
                      {isSpeaking && !isChunkFading && <span className="typewriter-cursor">|</span>}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* AI Orb - Vertically Centered - Reactive when AI speaks */}
        <div className={`flex flex-col items-center transition-all duration-1000 ease-out ${showOrb ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Download Overlay - replaces orb when report is ready */}
          {showDownloadOverlay && reportUrl ? (
            <div className="flex flex-col items-center animate-download-fade-in">
              {/* Fuzzy orb background - same as loading state */}
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDownloadClick}
                className="w-56 h-56 relative mb-4 cursor-pointer group"
              >
                {/* Outer glow */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/30 via-purple-500/40 to-cyan-500/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
                {/* Mid layer */}
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-400/20 via-purple-400/30 to-cyan-400/20 blur-2xl" />
                {/* Inner core */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-purple-500/40 via-cyan-400/30 to-purple-500/40 blur-xl" />
                {/* Text only - centered, minimal */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-light text-white/60 group-hover:text-white/90 uppercase tracking-[0.3em] transition-all duration-500 group-hover:tracking-[0.35em]">
                    Download
                  </span>
                </div>
              </a>
              <p className="text-xs text-white/25 uppercase tracking-widest animate-download-text-fade">Report Ready</p>
            </div>
          ) : showDriveOverlay && driveLink ? (
            <div className="flex flex-col items-center animate-download-fade-in">
              {/* Fuzzy orb background - Google Drive themed colors */}
              <a
                href={driveLink.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDriveLinkClick}
                className="w-56 h-56 relative mb-4 cursor-pointer group"
              >
                {/* Outer glow - Drive blue/green theme */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/30 via-green-500/40 to-yellow-500/30 blur-3xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />
                {/* Mid layer */}
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-blue-400/20 via-green-400/30 to-yellow-400/20 blur-2xl" />
                {/* Inner core */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-green-500/40 via-blue-400/30 to-yellow-500/40 blur-xl" />
                {/* Text only - centered, minimal */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-light text-white/60 group-hover:text-white/90 uppercase tracking-[0.25em] transition-all duration-500 group-hover:tracking-[0.3em]">
                    Google Drive
                  </span>
                </div>
              </a>
              <p className="text-xs text-white/25 uppercase tracking-widest animate-download-text-fade truncate max-w-[200px]">{driveLink.name}</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleOrbClick}
                className={`cursor-pointer transition-all duration-1000 ease-in-out hover:scale-110 hover:drop-shadow-[0_0_35px_rgba(0,212,255,0.4)] focus:outline-none mb-4 ${showDownloadOverlay || showDriveOverlay ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                disabled={isProcessing}
              >
                <div className="w-56 h-56 relative">
                  {/* CSS Fallback Orb - always visible */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/30 via-purple-500/20 to-cyan-500/30 blur-xl animate-pulse" />
                  <div className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-400/40 via-purple-400/30 to-cyan-400/40 blur-lg" />
                  <div className="absolute inset-8 rounded-full bg-gradient-to-br from-cyan-300/50 via-purple-300/40 to-cyan-300/50 blur-md" />
                  {/* WebGL Orb on top */}
                  <div className="absolute inset-0">
                    <Orb
                      colors={['#00d4ff', '#a855f7']}
                      agentState={isSpeaking ? 'talking' : isProcessing ? 'thinking' : null}
                      seed={2000}
                      className="w-full h-full"
                    />
                  </div>
                </div>
              </button>
              <p className="text-xs text-white/30 uppercase tracking-widest">{getStatusText()}</p>
            </>
          )}
        </div>

        {/* User Transcript - Bottom area - moved up to avoid taskbar */}
        <div className="absolute bottom-28 left-0 right-0 flex items-center justify-center">
          <div className="w-full max-w-xl px-6">
            {hasStarted && (userTranscript || interimTranscript) && (
              <p className="user-input-display text-sm text-white/60 text-center">
                {userTranscript}
                <span className="text-white/30">{interimTranscript}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Activity */}
      <div className={`hidden xl:flex flex-col w-72 gap-3 overflow-hidden transition-all duration-700 ease-out ${showCards ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>
        {/* Top Card Slot - Monthly Summary / Upcoming */}
        <div className="mercury-card p-4 h-[160px] relative overflow-hidden">
          {/* Subtle indicators inside card */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {[0, 1].map((i) => (
              <button
                key={i}
                onClick={() => setRightTopIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  rightTopIndex === i ? 'w-3 bg-white/30' : 'w-1 bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Card 0: This Month Summary */}
          <Link
            href="/dashboard/transactions"
            className={`absolute inset-4 transition-all duration-500 cursor-pointer hover:bg-white/5 rounded-lg -m-2 p-2 block ${
              rightTopIndex === 0 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-white/50 mb-2">This Month</p>
            <div className="flex items-baseline mb-3">
              <span className={`text-xl font-medium text-display ${monthNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {monthNet >= 0 ? '+' : ''}{formatCurrency(monthNet)}
              </span>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  <span className="text-white/50">Income</span>
                </div>
                <span className="text-white font-medium">{formatCurrency(monthIncome)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
                  <span className="text-white/50">Expenses</span>
                </div>
                <span className="text-white font-medium">{formatCurrency(monthExpenses)}</span>
              </div>
            </div>
          </Link>

          {/* Card 1: Upcoming Events */}
          <div className={`absolute inset-4 bottom-8 transition-all duration-500 overflow-auto ${
            rightTopIndex === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider text-white/50">Coming Up</p>
            </div>
            <div className="space-y-1">
              {mockUpcoming.map((event) => (
                <div key={event.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{event.title}</p>
                    <p className="text-[10px] text-white/40">{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Card Slot - Recent Activity / Stats */}
        <div className="mercury-card p-4 flex-1 relative overflow-hidden">
          {/* Subtle indicators inside card */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {[0, 1].map((i) => (
              <button
                key={i}
                onClick={() => setRightBottomIndex(i)}
                className={`h-1 rounded-full transition-all ${
                  rightBottomIndex === i ? 'w-3 bg-white/30' : 'w-1 bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Card 0: Recent Transactions */}
          <div className={`absolute inset-4 bottom-8 transition-all duration-500 overflow-auto ${
            rightBottomIndex === 0 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-white/50">Recent Activity</p>
              <Link href="/dashboard/transactions" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                View all
              </Link>
            </div>
            {recentTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <p className="text-xs text-white/50">No recent transactions</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentTransactions.slice(0, 6).map((tx) => {
                  const isIncome = tx.amount > 0
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-6 w-6 rounded-lg flex items-center justify-center border ${
                            isIncome
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-white/5 text-white/50 border-white/10'
                          }`}
                        >
                          {isIncome ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate max-w-[90px]">
                            {tx.merchant_name || tx.description}
                          </p>
                          <p className="text-[10px] text-white/40">
                            {format(new Date(tx.date), 'MMM d')}
                          </p>
                        </div>
                      </div>
                      <p className={`text-xs font-medium tabular-nums ${isIncome ? 'text-green-400' : 'text-white'}`}>
                        {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Card 1: S&P 500 - 3 Year View */}
          <div className={`absolute inset-4 bottom-8 transition-all duration-500 ${
            rightBottomIndex === 1 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider text-white/50">S&P 500</p>
              <div className="flex items-center gap-1.5">
                {spLoading ? (
                  <span className="text-sm font-medium text-white/50">Loading...</span>
                ) : (
                  <>
                    <span className="text-sm font-medium text-white tabular-nums">
                      {spCurrentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-xs ${spIsPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {spIsPositive ? '+' : ''}{spChange.toFixed(1)}% 3Y
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="h-[calc(100%-32px)] relative">
              {spData.length > 0 ? (
                <svg viewBox="0 0 120 50" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={spIsPositive ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)'} />
                      <stop offset="100%" stopColor={spIsPositive ? 'rgba(74, 222, 128, 0)' : 'rgba(248, 113, 113, 0)'} />
                    </linearGradient>
                  </defs>
                  {/* Area fill */}
                  <path
                    d={spAreaPath}
                    fill="url(#spGradient)"
                  />
                  {/* Line */}
                  <path
                    d={spLinePath}
                    fill="none"
                    stroke={spIsPositive ? 'rgba(74, 222, 128, 0.6)' : 'rgba(248, 113, 113, 0.6)'}
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* End dot */}
                  {spData.length > 0 && (
                    <circle cx="120" cy={spLastY} r="1.5" fill={spIsPositive ? '#4ade80' : '#f87171'} />
                  )}
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full text-white/30 text-xs">
                  {spLoading ? 'Loading chart...' : 'No data available'}
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[8px] text-white/25 px-1">
                <span>{new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).getFullYear()}</span>
                <span>{new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).getFullYear()}</span>
                <span>{new Date(Date.now() - 1 * 365 * 24 * 60 * 60 * 1000).getFullYear()}</span>
                <span>Now</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
