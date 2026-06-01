import { currentUserId, getUserClient, jsonResponse, readJson, requireMethod } from '../_shared/http.ts';
import { normalizeCampaignPack, type CampaignPack } from '../_shared/campaign_pack.ts';

type RequestBody = {
  runId: string;
  artifactId?: string;
};

Deno.serve(async (req) => {
  const methodResponse = requireMethod(req);
  if (methodResponse) return methodResponse;

  try {
    const supabase = getUserClient(req);
    const userId = await currentUserId(supabase);
    const { runId, artifactId } = await readJson<RequestBody>(req);
    if (!runId) return jsonResponse({ error: 'runId is required' }, 400);

    const { data: run, error: runError } = await supabase.from('ai_runs').select('*').eq('id', runId).single();
    if (runError) throw runError;
    if (run.status !== 'needs_approval') return jsonResponse({ error: 'Run is not waiting for approval' }, 409);

    let destinationFolderId = run.folder_id as string | null;
    if (!destinationFolderId && run.campaign_id) {
      const { data: selectedCampaign, error } = await supabase
        .from('campaigns')
        .select('id,folder_id')
        .eq('id', run.campaign_id)
        .single();
      if (error) throw error;
      destinationFolderId = selectedCampaign?.folder_id || null;
    }

    if (!destinationFolderId && run.project_id) {
      const { data: existingFolder } = await supabase
        .from('folders')
        .select('id')
        .eq('project_id', run.project_id)
        .ilike('name', 'AI Campaigns')
        .maybeSingle();

      if (existingFolder?.id) {
        destinationFolderId = existingFolder.id;
      } else {
        const { data: createdFolder, error } = await supabase
          .from('folders')
          .insert({ project_id: run.project_id, name: 'AI Campaigns' })
          .select('id')
          .single();
        if (error) throw error;
        destinationFolderId = createdFolder.id;
      }

      await supabase.from('ai_runs').update({ folder_id: destinationFolderId }).eq('id', runId);
    }

    if (!destinationFolderId && !run.campaign_id) {
      return jsonResponse({ error: 'A project, folder, or campaign destination is required' }, 400);
    }

    const artifactQuery = supabase.from('ai_artifacts').select('*').eq('run_id', runId).eq('type', 'brief_to_campaign');
    const { data: artifact, error: artifactError } = artifactId
      ? await artifactQuery.eq('id', artifactId).single()
      : await artifactQuery.order('created_at', { ascending: false }).limit(1).single();
    if (artifactError) throw artifactError;

    const pack = normalizeCampaignPack(artifact.content) as CampaignPack;
    const campaignIds: Record<string, string> = {};

    const ensureCampaign = async (type: 'socials' | 'google-ad' | 'meta-ad' | 'blogs', name: string) => {
      if (run.campaign_id) {
        const { data } = await supabase.from('campaigns').select('id,type').eq('id', run.campaign_id).single();
        if (data?.type === type) {
          campaignIds[type] = data.id;
          return data.id;
        }
      }

      if (campaignIds[type]) return campaignIds[type];

      const { data: existing } = await supabase
        .from('campaigns')
        .select('id')
        .eq('folder_id', destinationFolderId)
        .eq('type', type)
        .ilike('name', name)
        .maybeSingle();
      if (existing?.id) {
        campaignIds[type] = existing.id;
        return existing.id;
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert({ folder_id: destinationFolderId, type, name })
        .select('id')
        .single();
      if (error) throw error;
      campaignIds[type] = data.id;
      return data.id;
    };

    const socialCampaignId = await ensureCampaign('socials', 'AI Social Posts');
    const googleCampaignId = await ensureCampaign('google-ad', 'AI Google Ads');
    const socialAdCampaignId = await ensureCampaign('meta-ad', 'AI Paid Social Ads');
    const blogCampaignId = await ensureCampaign('blogs', 'AI Blog Outlines');

    const aiMeta = {
      runId,
      approvalId: null,
      generatedAt: new Date().toISOString(),
      sourceAgent: 'output-mapper',
    };

    const calendarDatesByType: Record<'socials' | 'google-ad' | 'meta-ad' | 'blogs', string[]> = {
      socials: [],
      'google-ad': [],
      'meta-ad': [],
      blogs: [],
    };
    for (const item of pack.calendar) {
      if (item.date) calendarDatesByType[item.type].push(item.date);
    }

    const calendarCursor: Record<'socials' | 'google-ad' | 'meta-ad' | 'blogs', number> = {
      socials: 0,
      'google-ad': 0,
      'meta-ad': 0,
      blogs: 0,
    };

    const nextCalendarDate = (type: 'socials' | 'google-ad' | 'meta-ad' | 'blogs') => {
      const dates = calendarDatesByType[type];
      const index = calendarCursor[type];
      calendarCursor[type] += 1;
      return dates[index] || dates[dates.length - 1];
    };

    const contentRows: Array<Record<string, unknown>> = [];
    for (const post of pack.socialPosts) {
      const scheduledDate = post.scheduledDate || nextCalendarDate('socials');
      contentRows.push({
        campaign_id: socialCampaignId,
        type: 'social-post',
        name: post.name || post.topic || 'AI Social Post',
        status: 'draft',
        payload: { ...post, scheduledDate, campaignId: socialCampaignId, status: 'draft', ai: aiMeta },
      });
    }
    for (const ad of pack.googleAds) {
      const startDate = ad.startDate || nextCalendarDate('google-ad');
      contentRows.push({
        campaign_id: googleCampaignId,
        type: 'google-ad',
        name: ad.name || ad.topic || 'AI Google Ad',
        status: 'draft',
        payload: { ...ad, startDate, campaignId: googleCampaignId, status: 'draft', ai: aiMeta },
      });
    }
    for (const ad of pack.socialAds) {
      const scheduledDate = ad.scheduledDate || nextCalendarDate('meta-ad');
      contentRows.push({
        campaign_id: socialAdCampaignId,
        type: 'social-ad',
        name: ad.name || ad.topic || 'AI Paid Social Ad',
        status: 'draft',
        payload: { ...ad, scheduledDate, campaignId: socialAdCampaignId, status: 'draft', ai: aiMeta },
      });
    }
    for (const blog of pack.blogOutlines) {
      const publishDate = blog.publishDate || nextCalendarDate('blogs');
      contentRows.push({
        campaign_id: blogCampaignId,
        type: 'blog',
        name: blog.title || 'AI Blog Outline',
        status: 'draft',
        payload: {
          ...blog,
          publishDate,
          campaignId: blogCampaignId,
          content: Array.isArray(blog.outline) ? blog.outline.map((item) => `## ${item}`).join('\n\n') : '',
          status: 'draft',
          ai: aiMeta,
        },
      });
    }

    if (contentRows.length > 0) {
      const { error } = await supabase.from('content_items').insert(contentRows);
      if (error) throw error;
    }

    const calendarRows = pack.calendar.map((item) => {
      const type = item.type;
      return {
        campaign_id: campaignIds[type] || socialCampaignId,
        title: item.title || 'AI campaign touchpoint',
        event_date: item.date,
        type,
      };
    }).filter((item) => item.event_date);
    if (calendarRows.length > 0) {
      await supabase.from('calendar_events').insert(calendarRows);
    }

    const { data: approval, error: approvalError } = await supabase
      .from('ai_run_approvals')
      .insert({
        run_id: runId,
        approved_by: userId,
        approved_payload: { artifactId: artifact.id, contentCount: contentRows.length, calendarCount: calendarRows.length },
      })
      .select()
      .single();
    if (approvalError) throw approvalError;

    await supabase.from('ai_artifacts').update({ status: 'inserted' }).eq('id', artifact.id);
    await supabase.from('ai_runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', runId);

    return jsonResponse({ approval, inserted: { contentCount: contentRows.length, calendarCount: calendarRows.length, campaignIds } });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
