// AI integration layer
// Connects pet behavior to Claude API for contextual reactions

export interface AIConfig {
  provider: "claude" | "openai" | "local";
  model: string;
  apiKey?: string;
  systemPrompt?: string;
}

export interface PetMood {
  energy: number;     // 0-100
  happiness: number;  // 0-100
  curiosity: number;  // 0-100
}
