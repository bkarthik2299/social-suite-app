import { describe, expect, it } from 'vitest';
import {
  prefersNativeJsonMode,
  supportsTemperatureParameter,
  structuredMissionModelPlan,
  structuredOutputModelId,
} from '../../supabase/functions/_shared/openrouter_policy';

describe('OpenRouter mission policy', () => {
  it('uses GPT-5.4-mini for schema-heavy output when DeepSeek Pro is selected', () => {
    expect(structuredOutputModelId('deepseek/deepseek-v4-pro')).toBe('openai/gpt-5.4-mini');
    expect(structuredMissionModelPlan('deepseek/deepseek-v4-pro', [
      'openai/gpt-5.4-mini',
      'anthropic/claude-haiku-4.5',
    ])).toEqual([
      'openai/gpt-5.4-mini',
      'deepseek/deepseek-v4-pro',
      'anthropic/claude-haiku-4.5',
    ]);
  });

  it('keeps schema-compatible selected models as the primary output model', () => {
    expect(structuredMissionModelPlan('anthropic/claude-opus-4.7', [
      'openai/gpt-5.4-mini',
    ])).toEqual([
      'anthropic/claude-opus-4.7',
      'openai/gpt-5.4-mini',
    ]);
  });

  it('does not send unsupported native JSON mode to Perplexity Sonar Pro', () => {
    expect(prefersNativeJsonMode('perplexity/sonar-pro')).toBe(false);
    expect(prefersNativeJsonMode('openai/gpt-5.4-mini')).toBe(true);
  });

  it('omits temperature for OpenAI GPT-5 models under strict provider routing', () => {
    expect(supportsTemperatureParameter('openai/gpt-5.4-mini')).toBe(false);
    expect(supportsTemperatureParameter('openai/gpt-5.5')).toBe(false);
    expect(supportsTemperatureParameter('deepseek/deepseek-v4-pro')).toBe(true);
  });
});
