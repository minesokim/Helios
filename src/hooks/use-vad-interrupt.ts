'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAIStore } from '@/stores/ai-store'

interface UseVADInterruptOptions {
  enabled?: boolean
  threshold?: number // 0-1, how loud to trigger
  onInterrupt?: () => void
}

/**
 * Voice Activity Detection for interrupting the AI
 *
 * Listens for voice activity when AI is speaking.
 * If the user speaks, automatically interrupts the AI.
 */
export function useVADInterrupt(options: UseVADInterruptOptions = {}) {
  const {
    enabled = true,
    threshold = 0.15,
    onInterrupt,
  } = options

  const aiState = useAIStore((state) => state.state)
  const interrupt = useAIStore((state) => state.interrupt)
  const isPaused = useAIStore((state) => state.isPaused)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const consecutiveDetectionsRef = useRef(0)

  const cleanup = useCallback(() => {
    // Cancel animation frame first to stop checking
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    consecutiveDetectionsRef.current = 0

    // Stop all tracks immediately to release mic
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop()
        track.enabled = false
      })
      streamRef.current = null
    }

    // Disconnect and close audio context
    analyserRef.current = null
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
      } catch {
        // Ignore close errors
      }
      audioContextRef.current = null
    }
  }, [])

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream

      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.5

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

      const checkVoice = () => {
        if (!analyserRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate RMS
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const value = dataArray[i] / 255
          sum += value * value
        }
        const rms = Math.sqrt(sum / dataArray.length)

        if (rms > threshold) {
          consecutiveDetectionsRef.current++
          // Require a few consecutive detections to avoid false positives
          if (consecutiveDetectionsRef.current >= 3) {
            // Voice detected - interrupt!
            interrupt()
            onInterrupt?.()
            cleanup()
            return
          }
        } else {
          consecutiveDetectionsRef.current = 0
        }

        animationFrameRef.current = requestAnimationFrame(checkVoice)
      }

      checkVoice()
    } catch (error) {
      console.warn('VAD microphone access denied:', error)
    }
  }, [threshold, interrupt, onInterrupt, cleanup])

  useEffect(() => {
    if (!enabled || isPaused) {
      cleanup()
      return
    }

    // Start VAD when AI is speaking
    if (aiState === 'speaking') {
      startListening()
    } else {
      cleanup()
    }

    return cleanup
  }, [aiState, enabled, isPaused, startListening, cleanup])

  return {
    isActive: aiState === 'speaking' && enabled && !isPaused,
  }
}
