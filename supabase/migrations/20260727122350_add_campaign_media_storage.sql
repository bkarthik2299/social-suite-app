-- Ordered campaign media for social posts and paid social ads.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'campaign-media',
  'campaign-media',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Campaign editors can upload campaign media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campaign-media'
  and exists (
    select 1
    from public.campaigns c
    join public.folders f on f.id = c.folder_id
    join public.projects p on p.id = f.project_id
    where c.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_edit_org(p.org_id)
  )
);

create policy "Campaign members can inspect campaign media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campaign-media'
  and exists (
    select 1
    from public.campaigns c
    join public.folders f on f.id = c.folder_id
    join public.projects p on p.id = f.project_id
    where c.id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_org_member(p.org_id)
  )
);

create policy "Campaign editors can update campaign media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'campaign-media'
  and exists (
    select 1
    from public.campaigns c
    join public.folders f on f.id = c.folder_id
    join public.projects p on p.id = f.project_id
    where c.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_edit_org(p.org_id)
  )
)
with check (
  bucket_id = 'campaign-media'
  and exists (
    select 1
    from public.campaigns c
    join public.folders f on f.id = c.folder_id
    join public.projects p on p.id = f.project_id
    where c.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_edit_org(p.org_id)
  )
);

create policy "Campaign editors can delete campaign media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campaign-media'
  and exists (
    select 1
    from public.campaigns c
    join public.folders f on f.id = c.folder_id
    join public.projects p on p.id = f.project_id
    where c.id::text = (storage.foldername(storage.objects.name))[1]
      and public.can_edit_org(p.org_id)
  )
);
