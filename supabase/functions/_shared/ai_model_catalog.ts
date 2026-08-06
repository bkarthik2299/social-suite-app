export type AiModelProvider = 'DeepSeek' | 'Anthropic';

export type AiModelDefinition = {
  id: string;
  name: string;
  provider: AiModelProvider;
};

export const instantAiModels = [
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'DeepSeek' },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
] as const satisfies readonly AiModelDefinition[];

export const deepWorkAiModels = [
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'DeepSeek' },
  { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'Anthropic' },
] as const satisfies readonly AiModelDefinition[];

export function aiModelsForMode(mode: 'instant' | 'deep') {
  return mode === 'deep' ? deepWorkAiModels : instantAiModels;
}
