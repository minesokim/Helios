import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordUsage, checkBudget } from '@/services/budget'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // "Adam" - deep, authoritative British

// Preprocess text for natural speech
function preprocessForTTS(text: string): string {
  let result = text

  // Remove markdown formatting
  result = result.replace(/\*\*(.+?)\*\*/g, '$1')
  result = result.replace(/\*(.+?)\*/g, '$1')
  result = result.replace(/__(.+?)__/g, '$1')
  result = result.replace(/_(.+?)_/g, '$1')
  result = result.replace(/`(.+?)`/g, '$1')
  result = result.replace(/```[\s\S]*?```/g, '')

  // Remove URLs
  result = result.replace(/https?:\/\/\S+/g, '')

  // Convert common symbols
  result = result.replace(/&/g, ' and ')
  result = result.replace(/\$(\d+)/g, '$1 dollars')
  result = result.replace(/%/g, ' percent')
  result = result.replace(/@/g, ' at ')

  // Clean up bullet points
  result = result.replace(/^\s*[-•]\s*/gm, '')
  result = result.replace(/^\s*\d+\.\s*/gm, '')

  // Clean up whitespace
  result = result.replace(/\s+/g, ' ').trim()

  return result
}

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { text, voiceId } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Check budget
    const budgetStatus = await checkBudget(user.id, 0.01)
    if (!budgetStatus.allowed) {
      return NextResponse.json({
        error: 'budget_exceeded',
        message: budgetStatus.reason,
      }, { status: 429 })
    }

    // Preprocess text for natural speech
    const cleanText = preprocessForTTS(text)

    if (!cleanText) {
      return NextResponse.json(
        { error: 'No speakable text after preprocessing' },
        { status: 400 }
      )
    }

    console.log(`[TTS] ElevenLabs for ${cleanText.length} chars`)

    // Call ElevenLabs API with streaming enabled
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', response.status, errorText)
      return NextResponse.json(
        { error: 'TTS generation failed', details: errorText },
        { status: response.status }
      )
    }

    // Record API usage
    await recordUsage(user.id, {
      api_provider: 'elevenlabs',
      api_endpoint: '/text-to-speech/stream',
      model: 'eleven_turbo_v2_5',
      audio_seconds: cleanText.length / 150,
      request_type: 'tts',
      success: true,
    })

    // Stream audio directly to client
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error('TTS API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate speech' },
      { status: 500 }
    )
  }
}
