do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'portal_review_posts'
    ) then
      alter publication supabase_realtime add table public.portal_review_posts;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'portal_comments'
    ) then
      alter publication supabase_realtime add table public.portal_comments;
    end if;
  end if;
end $$;
