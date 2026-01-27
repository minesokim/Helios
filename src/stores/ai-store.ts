import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface AIStore {
  // State
  state: AIState
  isPaused: boolean
  audioElement: HTMLAudioElement | null

  // Voice trigger - increments when taskbar orb is clicked
  voiceTrigger: number

  // Conversation
  conversationId: string | null
  messages: Message[]

  // Hydration tracking
  _hasHydrated: boolean

  // Actions
  setState: (state: AIState) => void
  setAudioElement: (audio: HTMLAudioElement | null) => void
  setPaused: (paused: boolean) => void
  triggerVoice: () => void  // Called by taskbar orb

  // Conversation actions
  setConversationId: (id: string | null) => void
  addMessage: (role: 'user' | 'assistant', content: string) => void
  setMessages: (messages: Message[]) => void
  clearConversation: () => void

  // Interrupt
  interrupt: () => void

  // Hydration
  setHasHydrated: (state: boolean) => void
}

export const useAIStore = create<AIStore>()(
  persist(
    (set, get) => ({
      state: 'idle',
      isPaused: false,
      audioElement: null,
      voiceTrigger: 0,
      conversationId: null,
      messages: [],
      _hasHydrated: false,

      setState: (state) => set({ state }),
      setAudioElement: (audioElement) => set({ audioElement }),
      triggerVoice: () => set((state) => ({ voiceTrigger: state.voiceTrigger + 1 })),

      setPaused: (paused) => {
        const current = get()
        // If pausing, stop any audio
        if (paused && current.audioElement) {
          current.audioElement.pause()
          current.audioElement.currentTime = 0
        }
        set({ isPaused: paused, state: paused ? 'paused' : 'idle' })
      },

      setConversationId: (id) => set({ conversationId: id }),

      addMessage: (role, content) => set((state) => ({
        messages: [...state.messages, { role, content, timestamp: Date.now() }]
      })),

      setMessages: (messages) => set({ messages }),

      clearConversation: () => set({
        conversationId: null,
        messages: [],
      }),

      interrupt: () => {
        const current = get()
        // Stop any playing audio
        if (current.audioElement) {
          current.audioElement.pause()
          current.audioElement.currentTime = 0
        }
        set({ state: 'idle', audioElement: null })
      },

      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'jim-ai-store',
      partialize: (state) => ({
        conversationId: state.conversationId,
        messages: state.messages,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
