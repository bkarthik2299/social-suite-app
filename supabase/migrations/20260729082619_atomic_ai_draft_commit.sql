CREATE OR REPLACE FUNCTION commit_ai_campaign_drafts(
  p_run_id uuid,
  p_artifact_id uuid DEFAULT NULL,
  p_selection jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_run ai_runs%ROWTYPE;
  v_artifact ai_artifacts%ROWTYPE;
  v_approval ai_run_approvals%ROWTYPE;
  v_pack jsonb;
  v_item jsonb;
  v_position integer;
  v_calendar_position integer;
  v_date text;
  v_content text;
  v_destination_folder_id uuid;
  v_destination_project_id uuid;
  v_destination_folder_name text;
  v_social_campaign_id uuid;
  v_google_campaign_id uuid;
  v_social_ad_campaign_id uuid;
  v_blog_campaign_id uuid;
  v_approval_id uuid := gen_random_uuid();
  v_content_count integer := 0;
  v_calendar_count integer := 0;
  v_social_cursor integer := 0;
  v_google_cursor integer := 0;
  v_social_ad_cursor integer := 0;
  v_blog_cursor integer := 0;
  v_need_social boolean;
  v_need_google boolean;
  v_need_social_ad boolean;
  v_need_blog boolean;
  v_result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  SELECT * INTO v_run FROM ai_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI run not found'; END IF;
  IF NOT can_edit_org(v_run.org_id) THEN RAISE EXCEPTION 'You cannot create drafts for this workspace'; END IF;

  IF v_run.status = 'completed' THEN
    SELECT * INTO v_approval
    FROM ai_run_approvals
    WHERE run_id = p_run_id AND approval_type = 'create_drafts' AND status = 'approved'
    ORDER BY created_at DESC
    LIMIT 1;
    IF FOUND AND v_approval.approved_payload ? 'result' THEN
      RETURN v_approval.approved_payload->'result';
    END IF;
    RAISE EXCEPTION 'Run is already completed';
  END IF;
  IF v_run.status <> 'needs_approval' THEN RAISE EXCEPTION 'Run is not waiting for approval'; END IF;

  IF p_artifact_id IS NOT NULL THEN
    SELECT * INTO v_artifact
    FROM ai_artifacts
    WHERE id = p_artifact_id AND run_id = p_run_id AND type = 'brief_to_campaign'
    FOR UPDATE;
  ELSE
    SELECT * INTO v_artifact
    FROM ai_artifacts
    WHERE run_id = p_run_id AND type = 'brief_to_campaign'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review artifact not found'; END IF;
  v_pack := v_artifact.content;

  v_destination_folder_id := v_run.folder_id;
  v_destination_project_id := v_run.project_id;

  IF v_destination_folder_id IS NULL AND v_run.campaign_id IS NOT NULL THEN
    SELECT campaign.folder_id, folder.project_id, folder.name
    INTO v_destination_folder_id, v_destination_project_id, v_destination_folder_name
    FROM campaigns campaign
    JOIN folders folder ON folder.id = campaign.folder_id
    WHERE campaign.id = v_run.campaign_id;
  END IF;

  IF v_destination_folder_id IS NULL AND v_run.project_id IS NOT NULL THEN
    SELECT folder.id, folder.project_id, folder.name
    INTO v_destination_folder_id, v_destination_project_id, v_destination_folder_name
    FROM folders folder
    WHERE folder.project_id = v_run.project_id AND folder.name ILIKE 'AI Campaigns'
    ORDER BY folder.created_at
    LIMIT 1;

    IF v_destination_folder_id IS NULL THEN
      INSERT INTO folders (project_id, name)
      VALUES (v_run.project_id, 'AI Campaigns')
      RETURNING id, project_id, name
      INTO v_destination_folder_id, v_destination_project_id, v_destination_folder_name;
    END IF;
    UPDATE ai_runs SET folder_id = v_destination_folder_id WHERE id = p_run_id;
  END IF;

  IF v_destination_folder_id IS NULL THEN
    RAISE EXCEPTION 'A project, folder, or campaign destination is required';
  END IF;

  IF v_destination_folder_name IS NULL THEN
    SELECT name, project_id INTO v_destination_folder_name, v_destination_project_id
    FROM folders WHERE id = v_destination_folder_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'socialPosts', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE p_selection IS NULL OR NOT (p_selection ? 'socialPosts') OR p_selection->'socialPosts' @> jsonb_build_array((position - 1)::integer)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE value->>'type' = 'socials' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
  ) INTO v_need_social;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'googleAds', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE p_selection IS NULL OR NOT (p_selection ? 'googleAds') OR p_selection->'googleAds' @> jsonb_build_array((position - 1)::integer)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE value->>'type' = 'google-ad' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
  ) INTO v_need_google;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'socialAds', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE p_selection IS NULL OR NOT (p_selection ? 'socialAds') OR p_selection->'socialAds' @> jsonb_build_array((position - 1)::integer)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE value->>'type' = 'meta-ad' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
  ) INTO v_need_social_ad;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'blogOutlines', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE p_selection IS NULL OR NOT (p_selection ? 'blogOutlines') OR p_selection->'blogOutlines' @> jsonb_build_array((position - 1)::integer)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY item(value, position)
    WHERE value->>'type' = 'blogs' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
  ) INTO v_need_blog;

  IF NOT (v_need_social OR v_need_google OR v_need_social_ad OR v_need_blog) THEN
    RAISE EXCEPTION 'Select at least one draft item before creating drafts';
  END IF;

  IF v_run.campaign_id IS NOT NULL THEN
    SELECT id INTO v_social_campaign_id FROM campaigns WHERE id = v_run.campaign_id AND type = 'socials';
    SELECT id INTO v_google_campaign_id FROM campaigns WHERE id = v_run.campaign_id AND type = 'google-ad';
    SELECT id INTO v_social_ad_campaign_id FROM campaigns WHERE id = v_run.campaign_id AND type = 'meta-ad';
    SELECT id INTO v_blog_campaign_id FROM campaigns WHERE id = v_run.campaign_id AND type = 'blogs';
  END IF;

  IF v_need_social AND v_social_campaign_id IS NULL THEN
    SELECT id INTO v_social_campaign_id FROM campaigns WHERE folder_id = v_destination_folder_id AND type = 'socials' AND name ILIKE 'AI Social Posts' ORDER BY created_at LIMIT 1;
    IF v_social_campaign_id IS NULL THEN INSERT INTO campaigns (folder_id, type, name) VALUES (v_destination_folder_id, 'socials', 'AI Social Posts') RETURNING id INTO v_social_campaign_id; END IF;
  END IF;
  IF v_need_google AND v_google_campaign_id IS NULL THEN
    SELECT id INTO v_google_campaign_id FROM campaigns WHERE folder_id = v_destination_folder_id AND type = 'google-ad' AND name ILIKE 'AI Google Ads' ORDER BY created_at LIMIT 1;
    IF v_google_campaign_id IS NULL THEN INSERT INTO campaigns (folder_id, type, name) VALUES (v_destination_folder_id, 'google-ad', 'AI Google Ads') RETURNING id INTO v_google_campaign_id; END IF;
  END IF;
  IF v_need_social_ad AND v_social_ad_campaign_id IS NULL THEN
    SELECT id INTO v_social_ad_campaign_id FROM campaigns WHERE folder_id = v_destination_folder_id AND type = 'meta-ad' AND name ILIKE 'AI Paid Social Ads' ORDER BY created_at LIMIT 1;
    IF v_social_ad_campaign_id IS NULL THEN INSERT INTO campaigns (folder_id, type, name) VALUES (v_destination_folder_id, 'meta-ad', 'AI Paid Social Ads') RETURNING id INTO v_social_ad_campaign_id; END IF;
  END IF;
  IF v_need_blog AND v_blog_campaign_id IS NULL THEN
    SELECT id INTO v_blog_campaign_id FROM campaigns WHERE folder_id = v_destination_folder_id AND type = 'blogs' AND name ILIKE 'AI Blog Outlines' ORDER BY created_at LIMIT 1;
    IF v_blog_campaign_id IS NULL THEN INSERT INTO campaigns (folder_id, type, name) VALUES (v_destination_folder_id, 'blogs', 'AI Blog Outlines') RETURNING id INTO v_blog_campaign_id; END IF;
  END IF;

  FOR v_item, v_position IN
    SELECT value, (position - 1)::integer FROM jsonb_array_elements(COALESCE(v_pack->'socialPosts', '[]'::jsonb)) WITH ORDINALITY item(value, position)
  LOOP
    IF p_selection IS NOT NULL AND p_selection ? 'socialPosts' AND NOT (p_selection->'socialPosts' @> jsonb_build_array(v_position)) THEN CONTINUE; END IF;
    v_date := NULLIF(v_item->>'scheduledDate', '');
    IF v_date IS NULL THEN
      SELECT value->>'date' INTO v_date FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY cal(value, position)
      WHERE value->>'type' = 'socials' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
      ORDER BY position OFFSET v_social_cursor LIMIT 1;
      v_social_cursor := v_social_cursor + 1;
    END IF;
    INSERT INTO content_items (campaign_id, type, name, status, payload)
    VALUES (v_social_campaign_id, 'social-post', COALESCE(NULLIF(v_item->>'name',''), NULLIF(v_item->>'topic',''), 'AI Social Post'), 'draft',
      v_item || jsonb_build_object('scheduledDate', v_date, 'campaignId', v_social_campaign_id, 'status', 'draft', 'ai', jsonb_build_object('runId', p_run_id, 'approvalId', v_approval_id, 'generatedAt', now(), 'sourceAgent', 'output-mapper')));
    v_content_count := v_content_count + 1;
  END LOOP;

  FOR v_item, v_position IN
    SELECT value, (position - 1)::integer FROM jsonb_array_elements(COALESCE(v_pack->'googleAds', '[]'::jsonb)) WITH ORDINALITY item(value, position)
  LOOP
    IF p_selection IS NOT NULL AND p_selection ? 'googleAds' AND NOT (p_selection->'googleAds' @> jsonb_build_array(v_position)) THEN CONTINUE; END IF;
    v_date := NULLIF(v_item->>'startDate', '');
    IF v_date IS NULL THEN
      SELECT value->>'date' INTO v_date FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY cal(value, position)
      WHERE value->>'type' = 'google-ad' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
      ORDER BY position OFFSET v_google_cursor LIMIT 1;
      v_google_cursor := v_google_cursor + 1;
    END IF;
    INSERT INTO content_items (campaign_id, type, name, status, payload)
    VALUES (v_google_campaign_id, 'google-ad', COALESCE(NULLIF(v_item->>'name',''), NULLIF(v_item->>'topic',''), 'AI Google Ad'), 'draft',
      v_item || jsonb_build_object('startDate', v_date, 'campaignId', v_google_campaign_id, 'status', 'draft', 'ai', jsonb_build_object('runId', p_run_id, 'approvalId', v_approval_id, 'generatedAt', now(), 'sourceAgent', 'output-mapper')));
    v_content_count := v_content_count + 1;
  END LOOP;

  FOR v_item, v_position IN
    SELECT value, (position - 1)::integer FROM jsonb_array_elements(COALESCE(v_pack->'socialAds', '[]'::jsonb)) WITH ORDINALITY item(value, position)
  LOOP
    IF p_selection IS NOT NULL AND p_selection ? 'socialAds' AND NOT (p_selection->'socialAds' @> jsonb_build_array(v_position)) THEN CONTINUE; END IF;
    v_date := NULLIF(v_item->>'scheduledDate', '');
    IF v_date IS NULL THEN
      SELECT value->>'date' INTO v_date FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY cal(value, position)
      WHERE value->>'type' = 'meta-ad' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
      ORDER BY position OFFSET v_social_ad_cursor LIMIT 1;
      v_social_ad_cursor := v_social_ad_cursor + 1;
    END IF;
    INSERT INTO content_items (campaign_id, type, name, status, payload)
    VALUES (v_social_ad_campaign_id, 'social-ad', COALESCE(NULLIF(v_item->>'name',''), NULLIF(v_item->>'topic',''), 'AI Paid Social Ad'), 'draft',
      v_item || jsonb_build_object('scheduledDate', v_date, 'campaignId', v_social_ad_campaign_id, 'status', 'draft', 'ai', jsonb_build_object('runId', p_run_id, 'approvalId', v_approval_id, 'generatedAt', now(), 'sourceAgent', 'output-mapper')));
    v_content_count := v_content_count + 1;
  END LOOP;

  FOR v_item, v_position IN
    SELECT value, (position - 1)::integer FROM jsonb_array_elements(COALESCE(v_pack->'blogOutlines', '[]'::jsonb)) WITH ORDINALITY item(value, position)
  LOOP
    IF p_selection IS NOT NULL AND p_selection ? 'blogOutlines' AND NOT (p_selection->'blogOutlines' @> jsonb_build_array(v_position)) THEN CONTINUE; END IF;
    v_date := NULLIF(v_item->>'publishDate', '');
    IF v_date IS NULL THEN
      SELECT value->>'date' INTO v_date FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY cal(value, position)
      WHERE value->>'type' = 'blogs' AND (p_selection IS NULL OR NOT (p_selection ? 'calendar') OR p_selection->'calendar' @> jsonb_build_array((position - 1)::integer))
      ORDER BY position OFFSET v_blog_cursor LIMIT 1;
      v_blog_cursor := v_blog_cursor + 1;
    END IF;
    SELECT string_agg('## ' || value, E'\n\n') INTO v_content FROM jsonb_array_elements_text(COALESCE(v_item->'outline', '[]'::jsonb));
    INSERT INTO content_items (campaign_id, type, name, status, payload)
    VALUES (v_blog_campaign_id, 'blog', COALESCE(NULLIF(v_item->>'title',''), 'AI Blog Outline'), 'draft',
      v_item || jsonb_build_object('publishDate', v_date, 'campaignId', v_blog_campaign_id, 'content', COALESCE(v_content, ''), 'status', 'draft', 'ai', jsonb_build_object('runId', p_run_id, 'approvalId', v_approval_id, 'generatedAt', now(), 'sourceAgent', 'output-mapper')));
    v_content_count := v_content_count + 1;
  END LOOP;

  FOR v_item, v_calendar_position IN
    SELECT value, (position - 1)::integer FROM jsonb_array_elements(COALESCE(v_pack->'calendar', '[]'::jsonb)) WITH ORDINALITY item(value, position)
  LOOP
    IF p_selection IS NOT NULL AND p_selection ? 'calendar' AND NOT (p_selection->'calendar' @> jsonb_build_array(v_calendar_position)) THEN CONTINUE; END IF;
    INSERT INTO calendar_events (campaign_id, title, event_date, type)
    VALUES (
      CASE v_item->>'type' WHEN 'socials' THEN v_social_campaign_id WHEN 'google-ad' THEN v_google_campaign_id WHEN 'meta-ad' THEN v_social_ad_campaign_id WHEN 'blogs' THEN v_blog_campaign_id END,
      COALESCE(NULLIF(v_item->>'title',''), 'AI campaign touchpoint'),
      (v_item->>'date')::date,
      v_item->>'type'
    );
    v_calendar_count := v_calendar_count + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'approval', jsonb_build_object('id', v_approval_id, 'run_id', p_run_id, 'status', 'approved', 'approval_type', 'create_drafts'),
    'inserted', jsonb_build_object(
      'contentCount', v_content_count,
      'calendarCount', v_calendar_count,
      'campaignIds', jsonb_strip_nulls(jsonb_build_object('socials', v_social_campaign_id, 'google-ad', v_google_campaign_id, 'meta-ad', v_social_ad_campaign_id, 'blogs', v_blog_campaign_id)),
      'destination', jsonb_build_object('projectId', v_destination_project_id, 'folderId', v_destination_folder_id, 'folderName', v_destination_folder_name)
    )
  );

  INSERT INTO ai_run_approvals (id, run_id, approved_by, approval_type, status, approved_payload)
  VALUES (v_approval_id, p_run_id, auth.uid(), 'create_drafts', 'approved', jsonb_build_object('artifactId', v_artifact.id, 'selection', p_selection, 'contentCount', v_content_count, 'calendarCount', v_calendar_count, 'result', v_result))
  RETURNING * INTO v_approval;

  UPDATE ai_artifacts SET status = 'inserted' WHERE id = v_artifact.id;
  UPDATE ai_runs SET status = 'completed', completed_at = now(), error = NULL WHERE id = p_run_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION commit_ai_campaign_drafts(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commit_ai_campaign_drafts(uuid, uuid, jsonb) TO authenticated;
