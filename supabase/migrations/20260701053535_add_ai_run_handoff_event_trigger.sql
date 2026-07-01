CREATE OR REPLACE FUNCTION public.ai_insert_handoff_event(
    p_run_id uuid,
    p_step_id uuid,
    p_agent_name text,
    p_agent_slug text,
    p_next_agent text,
    p_title text,
    p_summary text,
    p_sections jsonb DEFAULT '[]'::jsonb,
    p_metrics jsonb DEFAULT '{}'::jsonb,
    p_sources jsonb DEFAULT NULL::jsonb,
    p_source_event_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.ai_run_events (run_id, step_id, event_type, message, payload)
    SELECT
        p_run_id,
        p_step_id,
        'agent_handoff',
        p_agent_name || ' prepared a handoff' || COALESCE(' for ' || NULLIF(p_next_agent, ''), '') || '.',
        jsonb_strip_nulls(jsonb_build_object(
            'title', p_title,
            'summary', p_summary,
            'agentName', p_agent_name,
            'agentSlug', p_agent_slug,
            'nextAgent', p_next_agent,
            'sections', COALESCE(p_sections, '[]'::jsonb),
            'metrics', COALESCE(p_metrics, '{}'::jsonb),
            'sources', p_sources,
            'sourceEventId', p_source_event_id,
            'generatedBy', 'database_handoff_trigger'
        ))
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.ai_run_events existing
        WHERE existing.run_id = p_run_id
          AND existing.event_type = 'agent_handoff'
          AND existing.step_id IS NOT DISTINCT FROM p_step_id
          AND existing.payload->>'title' = p_title
          AND (
            p_source_event_id IS NULL
            OR existing.payload->>'sourceEventId' = p_source_event_id::text
          )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_run_event_create_handoff()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_contract jsonb;
    v_contract_text text;
    v_artifact_content jsonb;
    v_step_id uuid;
    v_sections jsonb;
    v_metrics jsonb;
BEGIN
    IF NEW.event_type = 'agent_handoff' THEN
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'research_plan' THEN
        v_contract := COALESCE(NEW.payload->'deliverableContract', '{}'::jsonb);
        v_contract_text := concat_ws(', ',
            COALESCE(v_contract->>'socialPosts', '0') || ' social posts',
            COALESCE(v_contract->>'googleAds', '0') || ' Google ads',
            COALESCE(v_contract->>'socialAds', '0') || ' paid social ads',
            COALESCE(v_contract->>'blogOutlines', '0') || ' blog outlines',
            COALESCE(v_contract->>'calendarItems', '0') || ' calendar items'
        );

        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'Planner Agent',
            'planner',
            'Brand Guide Agent',
            'Planner handoff',
            'Planner prepared ' || v_contract_text || ' and a focused research question for downstream agents.',
            jsonb_build_array(
                jsonb_build_object('title', 'Research question', 'body', COALESCE(NULLIF(NEW.payload->>'researchQuery', ''), 'No outside research question was needed.')),
                jsonb_build_object('title', 'Campaign guidance', 'body', COALESCE(NULLIF(NEW.payload->>'campaignGuidance', ''), 'No separate campaign guidance was recorded.')),
                jsonb_build_object('title', 'Requested output map', 'body', v_contract_text)
            ),
            jsonb_build_object('deliverableContract', v_contract),
            NULL,
            NEW.id
        );
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'brand_context' THEN
        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'Brand Guide Agent',
            'brand-guide',
            'Research Agent',
            'Brand context handoff',
            CASE
                WHEN NEW.payload ? 'title' THEN 'Loaded brand context and passed it to downstream agents.'
                ELSE 'No compiled brand knowledge document was selected, so downstream agents used the brief and planner guidance.'
            END,
            jsonb_build_array(
                jsonb_build_object('title', 'Brand source', 'body', COALESCE(NULLIF(NEW.payload->>'title', ''), 'No compiled brand knowledge document selected.'))
            ),
            jsonb_strip_nulls(jsonb_build_object('characters', NEW.payload->'characters')),
            NULL,
            NEW.id
        );
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'web_sources' THEN
        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'Research Agent',
            'research',
            'Copywriter Agent',
            'Research handoff',
            'Research distilled source-grounded campaign context for drafting.',
            jsonb_build_array(
                jsonb_build_object('title', 'Research question', 'body', COALESCE(NULLIF(NEW.payload->>'researchQuestion', ''), NULLIF(NEW.payload->>'query', ''), 'No research question was recorded.')),
                jsonb_build_object('title', 'Key findings', 'body', COALESCE(NULLIF(NEW.payload->>'answer', ''), 'No separate research digest was recorded.')),
                jsonb_build_object('title', 'Campaign focus', 'body', COALESCE(NULLIF(NEW.payload->>'campaignGuidance', ''), 'No separate campaign focus was recorded.'))
            ),
            jsonb_strip_nulls(jsonb_build_object(
                'provider', NEW.payload->'provider',
                'sourceCount', jsonb_array_length(COALESCE(NEW.payload->'sources', '[]'::jsonb)),
                'credits', NEW.payload->'credits',
                'responseTime', NEW.payload->'responseTime'
            )),
            NEW.payload->'sources',
            NEW.id
        );
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'instant_mode' OR NEW.event_type = 'web_search_failed' THEN
        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'Research Agent',
            'research',
            'Copywriter Agent',
            'Research handoff',
            CASE
                WHEN NEW.event_type = 'instant_mode' THEN 'Instant mode skipped web research, so downstream agents used the brief, planner guidance, and brand context.'
                ELSE 'Web research could not be completed, so downstream agents continued with the brief, planner guidance, and brand context.'
            END,
            jsonb_build_array(
                jsonb_build_object('title', 'Research status', 'body', COALESCE(NEW.message, 'No external research was passed forward.'))
            ),
            jsonb_strip_nulls(jsonb_build_object('skipped', true)),
            NULL,
            NEW.id
        );
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'platform_mapping' THEN
        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'Platform Specialist',
            'platform-specialist',
            'QA Agent',
            'Platform mapping handoff',
            'Platform Specialist normalized the draft pack for Social Suite fields, channel names, ad structures, and calendar dates.',
            jsonb_build_array(
                jsonb_build_object('title', 'Mapping result', 'body', COALESCE(NEW.message, 'Platform mapping completed.'))
            ),
            jsonb_strip_nulls(jsonb_build_object(
                'socialPosts', NEW.payload->'socialPosts',
                'googleAds', NEW.payload->'googleAds',
                'socialAds', NEW.payload->'socialAds',
                'blogOutlines', NEW.payload->'blogOutlines',
                'calendarItems', NEW.payload->'calendarItems'
            )),
            NULL,
            NEW.id
        );
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'qa_review' THEN
        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'QA Agent',
            'qa',
            'Output Mapper Agent',
            'QA handoff',
            COALESCE(NEW.message, 'QA completed review for the campaign pack.'),
            jsonb_build_array(
                jsonb_build_object('title', CASE WHEN jsonb_array_length(COALESCE(NEW.payload->'findings', '[]'::jsonb)) > 0 THEN 'QA notes' ELSE 'QA result' END,
                                   'body', CASE WHEN jsonb_array_length(COALESCE(NEW.payload->'findings', '[]'::jsonb)) > 0 THEN NEW.payload->'findings' ELSE to_jsonb('No blocking QA notes were recorded.'::text) END)
            ),
            jsonb_build_object('findingCount', jsonb_array_length(COALESCE(NEW.payload->'findings', '[]'::jsonb))),
            NULL,
            NEW.id
        );
        RETURN NEW;
    END IF;

    IF NEW.event_type = 'artifact_ready' THEN
        SELECT content
        INTO v_artifact_content
        FROM public.ai_artifacts
        WHERE run_id = NEW.run_id
        ORDER BY created_at DESC
        LIMIT 1;

        v_artifact_content := COALESCE(v_artifact_content, '{}'::jsonb);
        v_sections := jsonb_build_array(
            jsonb_build_object('title', 'Strategy', 'body', COALESCE(NULLIF(v_artifact_content#>>'{strategy,summary}', ''), 'Campaign draft pack is ready for review.')),
            jsonb_build_object('title', 'Artifact', 'body', 'Brief to Campaign Draft Pack')
        );
        v_metrics := jsonb_build_object(
            'socialPosts', jsonb_array_length(COALESCE(v_artifact_content->'socialPosts', '[]'::jsonb)),
            'googleAds', jsonb_array_length(COALESCE(v_artifact_content->'googleAds', '[]'::jsonb)),
            'socialAds', jsonb_array_length(COALESCE(v_artifact_content->'socialAds', '[]'::jsonb)),
            'blogOutlines', jsonb_array_length(COALESCE(v_artifact_content->'blogOutlines', '[]'::jsonb)),
            'calendarItems', jsonb_array_length(COALESCE(v_artifact_content->'calendar', '[]'::jsonb)),
            'artifactId', NEW.payload->'artifactId'
        );

        SELECT id INTO v_step_id
        FROM public.ai_run_steps
        WHERE run_id = NEW.run_id AND agent_name = 'Copywriter Agent'
        LIMIT 1;

        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            v_step_id,
            'Copywriter Agent',
            'copywriter',
            'Platform Specialist',
            'Draft pack handoff',
            'Copywriter created the campaign draft pack for platform review.',
            v_sections,
            v_metrics,
            NULL,
            NEW.id
        );

        PERFORM public.ai_insert_handoff_event(
            NEW.run_id,
            NEW.step_id,
            'Output Mapper Agent',
            'output-mapper',
            NULL,
            'Review artifact handoff',
            'Output Mapper saved the campaign pack as a review artifact for approval before draft creation.',
            v_sections,
            v_metrics,
            NULL,
            NEW.id
        );
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_run_events_create_handoff ON public.ai_run_events;
CREATE TRIGGER ai_run_events_create_handoff
AFTER INSERT ON public.ai_run_events
FOR EACH ROW
EXECUTE FUNCTION public.ai_run_event_create_handoff();
