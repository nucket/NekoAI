import { useEffect, useRef, useState } from 'react'
import { useConfigStore, isConfigured } from '../store/configStore'
import { OllamaProvider } from '../ai/providers/ollama'

// First-launch onboarding orchestrator.
//
//   - 'idle'         → not started yet (config still loading)
//   - 'detecting'    → pinging localhost:11434 in the background
//   - 'ollama_found' → Ollama responded; provider auto-configured, show celebratory bubble
//   - 'needs_setup'  → no Ollama and no API key; show CTA bubble
//   - 'done'         → onboarding finished or skipped; behave normally
//
// The state machine runs at most once per session — gated by configStore.isLoaded
// and the persisted `onboardingCompleted` flag.
export type OnboardingState = 'idle' | 'detecting' | 'ollama_found' | 'needs_setup' | 'done'

interface UseOnboardingResult {
  state: OnboardingState
  detectedModel: string | null
  dismiss: () => void
}

export function useOnboarding(): UseOnboardingResult {
  const { isLoaded, setOnboardingCompleted, applyOllamaAutoConfig } = useConfigStore()
  const [state, setState] = useState<OnboardingState>('idle')
  const [detectedModel, setDetectedModel] = useState<string | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    if (!isLoaded || ranRef.current) return
    ranRef.current = true

    // Wrap the entire flow in an async IIFE so all setState calls happen
    // inside an async callback — synchronous setState in effect bodies trips
    // react-hooks/set-state-in-effect, but callback usage is fine.
    void (async () => {
      const current = useConfigStore.getState().config

      // Already onboarded, OR has working credentials — never show the flow.
      if (current.onboardingCompleted || isConfigured(current)) {
        // Self-heal: an existing user with credentials but no flag (upgrade
        // path from a pre-onboarding TOML) gets the flag stamped now.
        if (!current.onboardingCompleted && isConfigured(current)) {
          await setOnboardingCompleted(true)
        }
        setState('done')
        return
      }

      setState('detecting')
      const result = await OllamaProvider.detect()
      if (result.ok && result.models.length > 0) {
        const model = result.models[0]
        await applyOllamaAutoConfig(model)
        setDetectedModel(model)
        setState('ollama_found')
      } else {
        setState('needs_setup')
      }
    })()
  }, [isLoaded, setOnboardingCompleted, applyOllamaAutoConfig])

  const dismiss = () => {
    void setOnboardingCompleted(true)
    setState('done')
  }

  return { state, detectedModel, dismiss }
}
