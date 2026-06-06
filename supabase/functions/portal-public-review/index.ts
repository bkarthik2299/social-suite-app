import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const cleanText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Portal review service is not configured.' }, 500);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const action = cleanText(body.action) || 'get';
  const token = cleanText(body.token);
  if (!token) return jsonResponse({ error: 'Review token is required.' }, 400);

  try {
    if (action === 'get') {
      return await getPortal(service, token, cleanText(body.feedId));
    }

    if (action === 'status') {
      return await updateStatus(service, token, cleanText(body.postId), cleanText(body.status));
    }

    if (action === 'comment') {
      return await addComment(
        service,
        token,
        cleanText(body.postId),
        cleanText(body.reviewerName).slice(0, 80),
        cleanText(body.text).slice(0, 2000),
      );
    }

    return jsonResponse({ error: 'Unsupported portal action.' }, 400);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Portal review request failed.',
    }, 500);
  }
});

async function getPortal(service: ReturnType<typeof createClient>, token: string, requestedFeedId: string) {
  const client = await findClient(service, token);

  if (!requestedFeedId) {
    return jsonResponse({ error: 'This review link is missing a feed id. Please ask for a new review link.' });
  }

  const { data: feed, error: feedError } = await service
    .from('portal_feeds')
    .select('id, name')
    .eq('client_id', client.id)
    .eq('id', requestedFeedId)
    .maybeSingle();
  if (feedError) throw feedError;
  if (!feed) return jsonResponse({ error: 'This review feed is invalid or no longer shared.' });

  const posts = await listPosts(service, feed.id);

  return jsonResponse({
    client: {
      name: client.name,
      company: client.company,
      logo: client.logo,
    },
    feeds: [feed],
    selectedFeedId: feed.id,
    posts,
  });
}

async function updateStatus(service: ReturnType<typeof createClient>, token: string, postId: string, status: string) {
  if (!['pending', 'approved', 'rejected', 'changes_requested'].includes(status)) {
    return jsonResponse({ error: 'Unsupported review status.' }, 400);
  }

  const post = await findPostForToken(service, token, postId);

  const { error } = await service
    .from('portal_review_posts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', post.id);
  if (error) throw error;

  return jsonResponse({ ok: true });
}

async function addComment(
  service: ReturnType<typeof createClient>,
  token: string,
  postId: string,
  reviewerName: string,
  text: string,
) {
  if (!reviewerName) return jsonResponse({ error: 'Reviewer name is required.' }, 400);
  if (!text) return jsonResponse({ error: 'Comment text is required.' }, 400);

  const post = await findPostForToken(service, token, postId);

  const { error } = await service
    .from('portal_comments')
    .insert({
      post_id: post.id,
      author: reviewerName,
      text,
      is_client: true,
    });
  if (error) throw error;

  return jsonResponse({ ok: true });
}

async function findClient(service: ReturnType<typeof createClient>, token: string) {
  const { data, error } = await service
    .from('portal_clients')
    .select('id, name, company, logo')
    .eq('access_token', token)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('This review link is invalid or has been revoked.');

  return data;
}

async function findPostForToken(service: ReturnType<typeof createClient>, token: string, postId: string) {
  if (!postId) throw new Error('Post id is required.');

  const client = await findClient(service, token);
  const { data: post, error: postError } = await service
    .from('portal_review_posts')
    .select('id, feed_id')
    .eq('id', postId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post) throw new Error('Review post was not found.');

  const { data: feed, error: feedError } = await service
    .from('portal_feeds')
    .select('id')
    .eq('id', post.feed_id)
    .eq('client_id', client.id)
    .maybeSingle();
  if (feedError) throw feedError;
  if (!feed) throw new Error('Review post does not belong to this client link.');

  return post;
}

async function listPosts(service: ReturnType<typeof createClient>, feedId: string) {
  const { data, error } = await service
    .from('portal_review_posts')
    .select('id, feed_id, content_type, snapshot, status, created_at, portal_comments(id, author, text, created_at, avatar, is_client)')
    .eq('feed_id', feedId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data || [];
}
