import type { AiCreditPlan } from '@/types/ai';

export const AI_CREDIT_PLANS: Record<AiCreditPlan, { label: string; allowance: number }> = {
  growth: { label: 'Growth', allowance: 200 },
  scale: { label: 'Scale', allowance: 600 },
  agency_pro: { label: 'Agency Pro', allowance: 1500 },
};

export const aiCreditCost = (workMode: 'instant' | 'deep') => workMode === 'deep' ? 2 : 1;

export const aiCreditPlanLabel = (plan: AiCreditPlan) => AI_CREDIT_PLANS[plan].label;

export const aiCreditProgress = (remaining: number, allowance: number) => {
  if (allowance <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / allowance) * 100));
};

export const formatAiCredits = (credits: number) => new Intl.NumberFormat().format(credits);
