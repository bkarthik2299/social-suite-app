export const STRUCTURED_OUTPUT_RECOVERY_MODEL = 'openai/gpt-5.4-mini';

const DEEPSEEK_REASONING_MODEL = 'deepseek/deepseek-v4-pro';
const PERPLEXITY_RESEARCH_MODEL = 'perplexity/sonar-pro';

export function structuredOutputModelId(selectedModelId: string) {
  return selectedModelId === DEEPSEEK_REASONING_MODEL
    ? STRUCTURED_OUTPUT_RECOVERY_MODEL
    : selectedModelId;
}

export function structuredMissionModelPlan(selectedModelId: string, fallbackModelIds: string[]) {
  return uniqueStrings([
    structuredOutputModelId(selectedModelId),
    ...fallbackModelIds,
    selectedModelId,
  ]);
}

export function prefersNativeJsonMode(modelId: string) {
  return modelId !== PERPLEXITY_RESEARCH_MODEL;
}

export function supportsTemperatureParameter(modelId: string) {
  return !modelId.startsWith('openai/gpt-5');
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
