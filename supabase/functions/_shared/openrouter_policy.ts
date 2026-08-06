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
  if (modelId.startsWith('openai/gpt-5')) return false;

  const claudeVersion = modelId.match(/^anthropic\/claude-(?:(?:opus|sonnet|haiku)-)?(\d+)\.(\d+)/i);
  if (!claudeVersion) return true;
  const major = Number(claudeVersion[1]);
  const minor = Number(claudeVersion[2]);
  return major < 4 || (major === 4 && minor < 7);
}

export function shouldRetryOpenRouterWithoutJsonMode(status: number, message: string) {
  return status === 400
    || status === 422
    || (status === 404 && /no endpoints? found[^.]*requested parameters?/i.test(message));
}

export function structuredOutputReasoning(modelId: string) {
  return modelId === 'deepseek/deepseek-v4-pro' || modelId === 'deepseek/deepseek-v4-flash'
    ? { effort: 'none' as const, exclude: true }
    : undefined;
}
