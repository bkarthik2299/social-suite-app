create table public.task_comments (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references public.organizations(id) on delete cascade,
    task_id uuid not null references public.tasks(id) on delete cascade,
    parent_id uuid references public.task_comments(id) on delete cascade,
    author_user_id uuid references auth.users(id) on delete set null,
    author_name text not null,
    author_avatar text,
    body text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint task_comments_author_name_check check (char_length(btrim(author_name)) between 1 and 80),
    constraint task_comments_body_check check (char_length(btrim(body)) between 1 and 4000)
);

create index task_comments_org_created_idx
    on public.task_comments(org_id, created_at desc);

create index task_comments_task_created_idx
    on public.task_comments(task_id, created_at asc);

create index task_comments_parent_idx
    on public.task_comments(parent_id)
    where parent_id is not null;

create table public.task_comment_reads (
    task_id uuid not null references public.tasks(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    org_id uuid not null references public.organizations(id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (task_id, user_id)
);

create index task_comment_reads_user_org_idx
    on public.task_comment_reads(user_id, org_id);

create or replace function public.ensure_task_comment_parent_matches()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
    if new.parent_id is not null and not exists (
        select 1
        from public.task_comments parent
        where parent.id = new.parent_id
          and parent.task_id = new.task_id
          and parent.org_id = new.org_id
          and parent.parent_id is null
    ) then
        raise exception 'Replies must belong to a top-level comment on the same task.' using errcode = '23514';
    end if;

    return new;
end;
$$;

create trigger ensure_task_comment_parent_matches
    before insert or update of parent_id, task_id, org_id on public.task_comments
    for each row execute function public.ensure_task_comment_parent_matches();

create trigger set_updated_at_task_comments
    before update on public.task_comments
    for each row execute function public.update_updated_at();

alter table public.task_comments enable row level security;
alter table public.task_comment_reads enable row level security;

grant select, insert, update, delete on public.task_comments to authenticated;
grant select, insert, update on public.task_comment_reads to authenticated;
grant all on public.task_comments to service_role;
grant all on public.task_comment_reads to service_role;

create policy "Members can view task comments"
    on public.task_comments
    for select
    to authenticated
    using (public.is_org_member(org_id));

create policy "Members can add task comments"
    on public.task_comments
    for insert
    to authenticated
    with check (
        public.is_org_member(org_id)
        and author_user_id = (select auth.uid())
        and exists (
            select 1
            from public.tasks task
            where task.id = task_comments.task_id
              and task.org_id = task_comments.org_id
              and public.is_org_member(task.org_id)
        )
        and (
            parent_id is null
            or exists (
                select 1
                from public.task_comments parent
                where parent.id = task_comments.parent_id
                  and parent.task_id = task_comments.task_id
                  and parent.org_id = task_comments.org_id
                  and parent.parent_id is null
            )
        )
    );

create policy "Authors can update task comments"
    on public.task_comments
    for update
    to authenticated
    using (
        public.is_org_member(org_id)
        and author_user_id = (select auth.uid())
    )
    with check (
        public.is_org_member(org_id)
        and author_user_id = (select auth.uid())
    );

create policy "Authors can delete task comments"
    on public.task_comments
    for delete
    to authenticated
    using (
        public.is_org_member(org_id)
        and author_user_id = (select auth.uid())
    );

create policy "Users can view their task read markers"
    on public.task_comment_reads
    for select
    to authenticated
    using (
        user_id = (select auth.uid())
        and public.is_org_member(org_id)
    );

create policy "Users can add their task read markers"
    on public.task_comment_reads
    for insert
    to authenticated
    with check (
        user_id = (select auth.uid())
        and public.is_org_member(org_id)
        and exists (
            select 1
            from public.tasks task
            where task.id = task_comment_reads.task_id
              and task.org_id = task_comment_reads.org_id
              and public.is_org_member(task.org_id)
        )
    );

create policy "Users can update their task read markers"
    on public.task_comment_reads
    for update
    to authenticated
    using (
        user_id = (select auth.uid())
        and public.is_org_member(org_id)
    )
    with check (
        user_id = (select auth.uid())
        and public.is_org_member(org_id)
        and exists (
            select 1
            from public.tasks task
            where task.id = task_comment_reads.task_id
              and task.org_id = task_comment_reads.org_id
              and public.is_org_member(task.org_id)
        )
    );

revoke all on function public.ensure_task_comment_parent_matches() from public;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'task_comments'
    ) then
      alter publication supabase_realtime add table public.task_comments;
    end if;
  end if;
end $$;
