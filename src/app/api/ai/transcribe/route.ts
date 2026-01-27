import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordUsage } from '@/services/budget'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // Convert to format Whisper accepts
    const audioBuffer = await audioFile.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type })

    // Create a File object that OpenAI SDK accepts
    const file = new File([audioBlob], 'audio.webm', { type: audioFile.type })

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    })

    // Record usage (Whisper is ~$0.006/minute)
    const durationMinutes = audioFile.size / (16000 * 2 * 60) // Rough estimate
    try {
      await recordUsage(user.id, {
        api_provider: 'openai',
        api_endpoint: '/audio/transcriptions',
        model: 'whisper-1',
        audio_seconds: durationMinutes * 60,
        request_type: 'stt',
        success: true,
      })
    } catch (e) {
      console.log('Usage recording skipped:', e)
    }

    return NextResponse.json({ text: transcription })

  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 }
    )
  }
}
