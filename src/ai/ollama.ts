import { invoke } from '@tauri-apps/api/core'

export type OllamaDetectResult = { ok: true; models: string[] } | { ok: false }

/**
 * Probes a local Ollama daemon via the Rust `ollama_detect` command. Used by
 * the onboarding flow to auto-configure the provider on first launch when the
 * user already has Ollama running.
 */
export async function detectOllama(baseUrl?: string): Promise<OllamaDetectResult> {
  try {
    const models = await invoke<string[]>('ollama_detect', { baseUrl })
    return { ok: true, models }
  } catch {
    return { ok: false }
  }
}
