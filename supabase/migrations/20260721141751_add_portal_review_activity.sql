create table public.portal_review_events (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.portal_review_posts(id) on delete cascade,
    status text not null check (status in ('approved', 'rejected', 'changes_requested')),
    reviewer_name text not null check (char_length(reviewer_name) between 1 and 80),
    reviewer_is_client boolean not null default false,
    actor_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index portal_review_events_post_created_idx
    on public.portal_review_events(post_id, created_at desc);

alter table public.portal_review_events enable row level security;

grant select, insert on public.portal_review_events to authenticated;
grant all on public.portal_review_events to service_role;

create policy "Members can view review activity"
    on public.portal_review_events
    for select
    to authenticated
    using (exists (
        select 1
        from public.portal_review_posts prp
        join public.portal_feeds pf on pf.id = prp.feed_id
        join public.portal_clients pc on pc.id = pf.client_id
        where prp.id = portal_review_events.post_id
          and public.is_org_member(pc.org_id)
    ));

create policy "Editors can record review activity"
    on public.portal_review_events
    for insert
    to authenticated
    with check (
        reviewer_is_client = false
        and actor_user_id = (select auth.uid())
        and exists (
            select 1
            from public.portal_review_posts prp
            join public.portal_feeds pf on pf.id = prp.feed_id
            join public.portal_clients pc on pc.id = pf.client_id
            where prp.id = portal_review_events.post_id
              and public.can_edit_org(pc.org_id)
        )
    );

create or replace function public.record_portal_review_action(
    p_post_id uuid,
    p_status text,
    p_reviewer_name text,
    p_is_client boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
    clean_reviewer_name text := left(btrim(regexp_replace(coalesce(p_reviewer_name, ''), '\s+', ' ', 'g')), 80);
begin
    if p_status not in ('approved', 'rejected', 'changes_requested') then
        raise exception 'Unsupported review status.' using errcode = '22023';
    end if;

    if clean_reviewer_name = '' then
        raise exception 'Reviewer name is required.' using errcode = '22023';
    end if;

    update public.portal_review_posts
    set status = p_status,
        updated_at = now()
    where id = p_post_id;

    if not found then
        raise exception 'Review post was not found.' using errcode = 'P0002';
    end if;

    insert into public.portal_review_events (
        post_id,
        status,
        reviewer_name,
        reviewer_is_client,
        actor_user_id
    ) values (
        p_post_id,
        p_status,
        clean_reviewer_name,
        p_is_client,
        case when p_is_client then null else (select auth.uid()) end
    );
end;
$$;

revoke all on function public.record_portal_review_action(uuid, text, text, boolean) from public;
grant execute on function public.record_portal_review_action(uuid, text, text, boolean) to authenticated, service_role;
