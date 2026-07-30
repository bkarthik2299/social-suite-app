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
