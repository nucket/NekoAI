export type { AIProvider, AIConfig, Message } from './types';

import type { AIProvider, AIConfig } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';

export function createAIProvider(config: AIConfig): AIProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey ?? '', config.model);
    case 'openai':
      return new OpenAIProvider(config.apiKey ?? '', config.model);
    case 'ollama':
      return new OllamaProvider(config.model, config.baseUrl);
    default:
      throw new Error(`Unknown AI provider: ${(config as AIConfig).provider}`);
  }
}

export function buildContextBlock(petName: string, userName?: string): string {
  const base = `You are ${petName}, a tiny animated desktop cat. You live on the user's screen and give short, helpful, slightly playful answers. Maximum 2 sentences. No markdown.`;
  if (userName) {
    return `${base} The user's name is ${userName}.`;
  }
  return base;
}
