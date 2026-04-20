export interface AIProvider {
  sendMessage(messages: Message[], systemPrompt: string): Promise<string>;
}

export type AIConfig = {
  provider: 'anthropic' | 'openai' | 'ollama';
  apiKey?: string;
  model: string;
  baseUrl?: string;
  petSize?: number;
  petMode?: 'work' | 'play';
};

export type Message = {
  role: 'user' | 'assistant';
  content: string;
};
