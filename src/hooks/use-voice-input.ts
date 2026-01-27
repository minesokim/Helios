'use client'

import { useState, useRef, useCallback } from 'react'

export type VoiceInputState = 'idle' | 'recording' | 'transcribing' | 'error'

interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void
  onError?: (error: string) => void
  maxDuration?: number // Max recording duration in ms (default 60s)
}

interface UseVoiceInputReturn {
  state: VoiceInputState
  isRecording: boolean
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string | null>
  cancelRecording: () => void
  error: string | null
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onTranscript, onError, maxDuration = 60000 } = options

  const [state, setState] = useState<VoiceInputState>('idle')
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setState('recording')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      })

      streamRef.current = stream
      chunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      })

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(100) // Collect data every 100ms

      // Auto-stop after max duration
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording()
        }
      }, maxDuration)

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to access microphone'
      setError(errorMsg)
      setState('error')
      onError?.(errorMsg)
      cleanup()
    }
  }, [maxDuration, onError, cleanup])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!mediaRecorderRef.current) {
      setState('idle')
      return null
    }

    // If not recording, just cleanup and return
    if (mediaRecorderRef.current.state !== 'recording') {
      cleanup()
      setState('idle')
      return null
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!

      mediaRecorder.onstop = async () => {
        setState('transcribing')

        try {
          // Ensure we have audio data
          if (chunksRef.current.length === 0) {
            setState('idle')
            cleanup()
            resolve(null)
            return
          }

          const audioBlob = new Blob(chunksRef.current, {
            type: mediaRecorder.mimeType
          })

          // Send to transcription API
          const formData = new FormData()
          formData.append('audio', audioBlob, 'recording.webm')

          const response = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            throw new Error('Transcription failed')
          }

          const { text } = await response.json()

          setState('idle')
          cleanup()
          onTranscript?.(text)
          resolve(text)

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Transcription failed'
          setError(errorMsg)
          setState('idle') // Reset to idle instead of error to allow retry
          onError?.(errorMsg)
          cleanup()
          resolve(null)
        }
      }

      mediaRecorder.stop()
    })
  }, [onTranscript, onError, cleanup])

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setState('idle')
    setError(null)
    cleanup()
  }, [cleanup])

  return {
    state,
    isRecording: state === 'recording',
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  }
}
