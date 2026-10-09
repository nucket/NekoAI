import { invoke } from '@tauri-apps/api/core'

// ─── Fact extraction patterns ─────────────────────────────────────────────────

const PATTERNS: Array<{ key: string; regex: RegExp }> = [
  {
    key: 'name',
    regex: /(?:my name is|i['']m called|call me|me llamo|llámame)\s+(\p{L}{2,21})/iu,
  },
  {
    key: 'project',
    regex:
      /(?:(?:working|work) on|building|my project(?:\s+is(?:\s+called)?)?|project called)\s+["']?([A-Za-z0-9][A-Za-z0-9\-_ ]{1,30})["']?/i,
  },
  {
    key: 'language',
    regex:
      /(?:i (?:use|work with|code in|program in)|my (?:main |preferred )?language is)\s+([A-Za-z+#]{2,15})/i,
  },
]

// Captures that are ordinary words, not facts: "call me later", "I'm working
// on it", "I use this…". Matched against the first word of the capture.
const IGNORED_VALUES = new Set([
  'a',
  'again',
  'an',
  'anything',
  'anytime',
  'back',
  'everything',
  'here',
  'it',
  'later',
  'maybe',
  'me',
  'my',
  'nothing',
  'now',
  'ok',
  'okay',
  'please',
  'something',
  'soon',
  'stuff',
  'that',
  'the',
  'there',
  'these',
  'things',
  'this',
  'those',
  'today',
  'tomorrow',
  'you',
  'your',
])

export function extractFacts(userMessage: string): Record<string, string> {
  const facts: Record<string, string> = {}
  for (const { key, regex } of PATTERNS) {
    const value = userMessage.match(regex)?.[1]?.trim()
    if (!value) continue
    const firstWord = value.split(/\s+/)[0].toLowerCase()
    if (IGNORED_VALUES.has(firstWord)) continue
    facts[key] = value
  }
  return facts
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function loadFacts(): Promise<Record<string, string>> {
  try {
    return await invoke<Record<string, string>>('get_all_user_facts')
  } catch {
    return {}
  }
}

// Only the user's own words are parsed. The assistant's reply is deliberately
// ignored: phrases like "call me anytime" or "I'm working on it" used to be
// stored as name = "anytime" / project = "it" and re-injected into every
// future system prompt.
export async function extractAndSaveFacts(userMessage: string): Promise<void> {
  for (const [key, value] of Object.entries(extractFacts(userMessage))) {
    try {
      await invoke('set_user_fact', { key, value })
    } catch (err) {
      console.warn(`[memory] failed to save fact "${key}":`, err)
    }
  }
}
