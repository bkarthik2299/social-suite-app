alter table public.tasks
add column folder_id uuid references public.folders(id) on delete set null;

update public.tasks as task
set folder_id = campaign.folder_id
from public.campaigns as campaign
where task.campaign_id = campaign.id
  and task.folder_id is null;

create index idx_tasks_folder on public.tasks(folder_id);
