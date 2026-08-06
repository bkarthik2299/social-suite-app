import { describe, expect, it } from 'vitest';
import {
  prefersNativeJsonMode,
  prefersSectionedCampaignPack,
  shouldRetryOpenRouterWithoutJsonMode,
  supportsTemperatureParameter,
  structuredMissionModelPlan,
  structuredJsonAttemptPlan,
  structuredOutputReasoning,
  structuredOutputModelId,
} from '../../supabase/functions/_shared/openrouter_policy';

describe('OpenRouter mission policy', () => {
  it('uses only the explicitly selected model for structured mission output', () => {
    expect(structuredOutputModelId('deepseek/deepseek-v4-pro')).toBe('deepseek/deepseek-v4-pro');
    expect(structuredMissionModelPlan('deepseek/deepseek-v4-pro', [
      'openai/gpt-5.4-mini',
      'anthropic/claude-haiku-4.5',
    ])).toEqual([
      'deepseek/deepseek-v4-pro',
    ]);
  });

  it('retries malformed structured output with the same selected model and stricter settings', () => {
    expect(structuredJsonAttemptPlan('deepseek/deepseek-v4-pro')).toEqual([
      { model: 'deepseek/deepseek-v4-pro', temperature: 0.2, strictRecovery: false },
      { model: 'deepseek/deepseek-v4-pro', temperature: 0.05, strictRecovery: true },
    ]);
  });

  it('keeps schema-compatible selected models as the primary output model', () => {
    expect(structuredMissionModelPlan('anthropic/claude-opus-4.7', [
      'openai/gpt-5.4-mini',
    ])).toEqual([
      'anthropic/claude-opus-4.7',
    ]);
  });

  it('does not send unsupported native JSON mode to Perplexity Sonar Pro', () => {
    expect(prefersNativeJsonMode('perplexity/sonar-pro')).toBe(false);
    expect(prefersNativeJsonMode('openai/gpt-5.4-mini')).toBe(true);
  });

  it('omits unsupported sampling parameters under strict provider routing', () => {
    expect(supportsTemperatureParameter('openai/gpt-5.4-mini')).toBe(false);
    expect(supportsTemperatureParameter('openai/gpt-5.5')).toBe(false);
    expect(supportsTemperatureParameter('anthropic/claude-opus-4.7')).toBe(false);
    expect(supportsTemperatureParameter('anthropic/claude-opus-4.7-fast')).toBe(false);
    expect(supportsTemperatureParameter('anthropic/claude-haiku-4.5')).toBe(true);
    expect(supportsTemperatureParameter('deepseek/deepseek-v4-pro')).toBe(true);
  });

  it('retries the same model without native JSON routing when parameters have no eligible endpoint', () => {
    expect(shouldRetryOpenRouterWithoutJsonMode(404, 'OpenRouter request failed: 404 No endpoints found that can handle the requested parameters.')).toBe(true);
    expect(shouldRetryOpenRouterWithoutJsonMode(422, 'response_format is not supported')).toBe(true);
    expect(shouldRetryOpenRouterWithoutJsonMode(404, 'Model not found')).toBe(false);
    expect(shouldRetryOpenRouterWithoutJsonMode(500, 'Provider unavailable')).toBe(false);
  });

  it('reserves DeepSeek V4 structured-output tokens for the final JSON response', () => {
    expect(structuredOutputReasoning('deepseek/deepseek-v4-pro')).toEqual({ effort: 'none', exclude: true });
    expect(structuredOutputReasoning('deepseek/deepseek-v4-flash')).toEqual({ effort: 'none', exclude: true });
    expect(structuredOutputReasoning('openai/gpt-5.5')).toBeUndefined();
  });

  it('splits DeepSeek V4 Pro campaign packs into smaller parallel section requests', () => {
    expect(prefersSectionedCampaignPack('deepseek/deepseek-v4-pro')).toBe(true);
    expect(prefersSectionedCampaignPack('anthropic/claude-opus-4.7')).toBe(false);
    expect(prefersSectionedCampaignPack('openai/gpt-5.5')).toBe(false);
  });
});
