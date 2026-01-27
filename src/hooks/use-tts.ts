'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useAIStore } from '@/stores/ai-store'

interface UseTTSOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: string) => void
  onInterrupted?: () => void
}

interface UseTTSReturn {
  speak: (text: string) => Promise<void>
  stop: () => void
  isSpeaking: boolean
  error: string | null
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const { onStart, onEnd, onError, onInterrupted } = options

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wasInterruptedRef = useRef(false)

  const setAIState = useAIStore((state) => state.setState)
  const setAudioElement = useAIStore((state) => state.setAudioElement)
  const isPaused = useAIStore((state) => state.isPaused)

  // Listen for global interrupt
  const aiState = useAIStore((state) => state.state)
  useEffect(() => {
    if (aiState === 'idle' && isSpeaking && audioRef.current) {
      wasInterruptedRef.current = true
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsSpeaking(false)
      setAudioElement(null)
      onInterrupted?.()
    }
  }, [aiState, isSpeaking, setAudioElement, onInterrupted])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsSpeaking(false)
    setAIState('idle')
    setAudioElement(null)
  }, [setAIState, setAudioElement])

  const speak = useCallback(async (text: string) => {
    if (!text.trim() || isPaused) return

    try {
      setError(null)
      wasInterruptedRef.current = false
      setIsSpeaking(true)
      setAIState('speaking')
      onStart?.()

      // Call Qwen3-TTS API
      const response = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        throw new Error('TTS generation failed')
      }

      // Check if interrupted during API call
      if (wasInterruptedRef.current) {
        setIsSpeaking(false)
        return
      }

      // Get audio blob and play
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      // Store in global state for interrupt capability
      setAudioElement(audio)

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        setIsSpeaking(false)
        setAIState('idle')
        setAudioElement(null)
        audioRef.current = null
        if (!wasInterruptedRef.current) {
          onEnd?.()
        }
      }

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl)
        setIsSpeaking(false)
        setAIState('idle')
        setAudioElement(null)
        setError('Audio playback failed')
        onError?.('Audio playback failed')
      }

      await audio.play()

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'TTS failed'
      setError(errorMsg)
      setIsSpeaking(false)
      setAIState('idle')
      setAudioElement(null)
      onError?.(errorMsg)
    }
  }, [setAIState, setAudioElement, isPaused, onStart, onEnd, onError])

  return {
    speak,
    stop,
    isSpeaking,
    error,
  }
}
