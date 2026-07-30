const PERPLEXITY_RESEARCH_MODEL = 'perplexity/sonar-pro';

export function structuredOutputModelId(selectedModelId: string) {
  return selectedModelId;
}

export function structuredMissionModelPlan(selectedModelId: string, _fallbackModelIds: string[]) {
  return [selectedModelId];
}

export function prefersNativeJsonMode(modelId: string) {
  return modelId !== PERPLEXITY_RESEARCH_MODEL;
}

export function supportsTemperatureParameter(modelId: string) {
  return !modelId.startsWith('openai/gpt-5');
}

export function structuredOutputReasoning(modelId: string) {
  return modelId === 'deepseek/deepseek-v4-pro' || modelId === 'deepseek/deepseek-v4-flash'
    ? { effort: 'none' as const, exclude: true }
    : undefined;
}
