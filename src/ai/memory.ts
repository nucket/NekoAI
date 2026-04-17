import { invoke } from '@tauri-apps/api/core';

// ─── Fact extraction patterns ─────────────────────────────────────────────────

const PATTERNS: Array<{ key: string; regex: RegExp }> = [
  {
    key: 'name',
    regex: /(?:my name is|i['']m called|call me|me llamo|llámame)\s+([A-Za-záéíóúñÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑa-z]{1,20})/i,
  },
  {
    key: 'project',
    regex: /(?:(?:working|work) on|building|my project(?:\s+is(?:\s+called)?)?|project called)\s+["']?([A-Za-z0-9][A-Za-z0-9\-_ ]{1,30})["']?/i,
  },
  {
    key: 'language',
    regex: /(?:i (?:use|work with|code in|program in)|my (?:main |preferred )?language is)\s+([A-Za-z+#]{2,15})/i,
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

export async function loadFacts(): Promise<Record<string, string>> {
  try {
    return await invoke<Record<string, string>>('get_all_user_facts');
  } catch {
    return {};
  }
}

export async function extractAndSaveFacts(
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  const combined = `${userMessage} ${assistantReply}`;

  for (const { key, regex } of PATTERNS) {
    const match = combined.match(regex);
    if (match?.[1]) {
      const value = match[1].trim();
      try {
        await invoke('set_user_fact', { key, value });
      } catch (err) {
        console.warn(`[memory] failed to save fact "${key}":`, err);
      }
    }
  }
}
