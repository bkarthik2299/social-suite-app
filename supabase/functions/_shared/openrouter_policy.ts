const PERPLEXITY_RESEARCH_MODEL = 'perplexity/sonar-pro';

export function structuredOutputModelId(selectedModelId: string) {
  return selectedModelId;
}

export function structuredMissionModelPlan(selectedModelId: string, _fallbackModelIds: string[]) {
  return [selectedModelId];
}

export function structuredJsonAttemptPlan(selectedModelId: string) {
  return [
    { model: selectedModelId, temperature: 0.2, strictRecovery: false },
    { model: selectedModelId, temperature: 0.05, strictRecovery: true },
  ] as const;
}

export function prefersSectionedCampaignPack(modelId: string) {
  return modelId === 'deepseek/deepseek-v4-pro';
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
