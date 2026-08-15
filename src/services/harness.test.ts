import { describe, expect, it } from 'vitest';
import { buildHarnessMissionPrompt, estimateHarnessCredits, stepsForPlan, understandCommandLocally } from '@/services/harness';
import { extractDeliverableContract } from '../../supabase/functions/_shared/deliverable_contract';

const switchCommand = 'Create a project called Switch. Their website is https://www.switchmobilityev.com/. Build a brand guide and compile brand knowledge from the website.';

describe('command harness', () => {
  it('turns the Switch request into the expected brand workspace plan', () => {
    const plan = understandCommandLocally(switchCommand);

    expect(plan.projectName).toBe('Switch');
    expect(plan.websiteUrl).toBe('https://www.switchmobilityev.com/');
    expect(plan.requestedOutputs).toEqual([]);
    expect(plan.workMode).toBe('instant');
    expect(plan.missingQuestions).toEqual([]);
    expect(plan.actions).toEqual([
      'create_project',
      'create_brand_guide',
      'research_brand_website',
      'compile_brand_knowledge',
    ]);
    expect(estimateHarnessCredits(plan)).toBe(2);
  });

  it('asks only for the missing project name', () => {
    const plan = understandCommandLocally('Create a project with social posts and Google ads.');
    expect(plan.missingQuestions.map((question) => question.id)).toEqual(['projectName']);
  });

  it('creates stable, ordered progress steps', () => {
    const plan = understandCommandLocally(switchCommand);
    const steps = stepsForPlan(plan, 'run-id');
    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.position)).toEqual([0, 1, 2, 3]);
    expect(steps.every((step) => step.status === 'queued')).toBe(true);
  });

  it('estimates the real Deep campaign credit cost', () => {
    const plan = understandCommandLocally('Create a project called Switch. Their website is https://www.switchmobilityev.com/. Build a comprehensive campaign with social posts, Google ads, Meta ads, and blog ideas.');
    expect(plan.actions).toHaveLength(7);
    expect(plan.workMode).toBe('deep');
    expect(estimateHarnessCredits(plan)).toBe(4);
  });

  it('preserves explicit quantities when the parser summarizes the campaign brief', () => {
    const request = 'Create exactly 8 social posts, 4 Google ads, 4 Meta ads, and 4 blog outlines.';
    const plan = {
      ...understandCommandLocally(request),
      campaignBrief: 'A zero-emission mobility campaign.',
    };

    const missionPrompt = buildHarnessMissionPrompt(plan, request);
    expect(missionPrompt).toContain(request);
    expect(missionPrompt).toContain('authoritative for requested deliverables and quantities');
    expect(extractDeliverableContract(missionPrompt)).toMatchObject({
      socialPosts: 8,
      googleAds: 4,
      socialAds: 4,
      blogOutlines: 4,
      explicitCounts: true,
    });
  });
});
