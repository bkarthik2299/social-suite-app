import { describe, expect, it } from 'vitest';
import {
  aiModelsForMode,
  deepWorkAiModels,
  instantAiModels,
} from '../../supabase/functions/_shared/ai_model_catalog';

describe('AI model catalogue', () => {
  it('offers only the approved Instant models', () => {
    expect(instantAiModels.map((model) => model.id)).toEqual([
      'deepseek/deepseek-v4-flash',
      'anthropic/claude-haiku-4.5',
    ]);
  });

  it('offers Sonnet 5 instead of Opus in Deep Work', () => {
    expect(deepWorkAiModels.map((model) => model.id)).toEqual([
      'deepseek/deepseek-v4-pro',
      'anthropic/claude-sonnet-5',
    ]);
  });

  it('contains no OpenAI models in either mode', () => {
    expect([...aiModelsForMode('instant'), ...aiModelsForMode('deep')]
      .some((model) => model.id.startsWith('openai/'))).toBe(false);
  });
});
