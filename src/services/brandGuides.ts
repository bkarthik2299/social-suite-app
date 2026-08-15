import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { BrandGuide } from '@/hooks/useDatabase';
import type { BrandKnowledgeDocument } from '@/types/ai';
import { invokeFunction } from '@/services/edgeFunctions';

const db = supabase as unknown as SupabaseClient;

export async function createBrandGuide({
  orgId,
  projectId,
  brandName,
  websiteUrl,
}: {
  orgId: string;
  projectId?: string | null;
  brandName?: string;
  websiteUrl?: string | null;
}) {
  const { data, error } = await db
    .from('brand_guides')
    .insert({
      org_id: orgId,
      project_id: projectId || null,
      brand_name: brandName?.trim() || 'Untitled Brand',
      website_url: websiteUrl || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as BrandGuide;
}

export async function updateBrandGuide({ id, updates }: { id: string; updates: Partial<BrandGuide> }) {
  const { error } = await db.from('brand_guides').update(updates).eq('id', id);
  if (error) throw error;
}

export async function researchBrandWebsite({
  guideId,
  brandName,
  websiteUrl,
}: {
  guideId: string;
  brandName: string;
  websiteUrl: string;
}) {
  const result = await invokeFunction<{
    guide: BrandGuide;
    sourceCount: number;
    fieldsUpdated: string[];
    colorsInserted?: number;
    fontsInserted?: number;
    logosInserted?: number;
  }>('brand-research-website', { guideId, brandName, websiteUrl });
  await invokeFunction('brand-charge-ai-action', { guideId, action: 'brand_research' });
  return result;
}

export async function compileBrandKnowledge({ guideId }: { guideId: string }) {
  const result = await invokeFunction<{ document: BrandKnowledgeDocument }>('brand-compile-knowledge', { guideId });
  await invokeFunction('brand-charge-ai-action', { guideId, action: 'brand_knowledge' });
  return result;
}
