CREATE TABLE public.task_stages (
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id text NOT NULL,
    title text NOT NULL,
    color text NOT NULL DEFAULT 'bg-slate-500',
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT task_stages_pkey PRIMARY KEY (org_id, id),
    CONSTRAINT task_stages_id_check CHECK (id ~ '^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$'),
    CONSTRAINT task_stages_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
    CONSTRAINT task_stages_color_check CHECK (color IN (
        'bg-blue-500',
        'bg-amber-500',
        'bg-green-500',
        'bg-purple-500',
        'bg-pink-500',
        'bg-red-500',
        'bg-cyan-500',
        'bg-slate-500'
    ))
);

CREATE INDEX task_stages_org_sort_order_idx
    ON public.task_stages (org_id, sort_order);

INSERT INTO public.task_stages (org_id, id, title, color, sort_order)
SELECT
    organizations.id,
    defaults.id,
    defaults.title,
    defaults.color,
    defaults.sort_order
FROM public.organizations
CROSS JOIN (
    VALUES
        ('todo', 'To-do', 'bg-blue-500', 0),
        ('in-progress', 'In Progress', 'bg-amber-500', 1),
        ('done', 'Completed', 'bg-green-500', 2)
) AS defaults(id, title, color, sort_order)
ON CONFLICT (org_id, id) DO NOTHING;

ALTER TABLE public.tasks
    DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_task_stage_fkey
    FOREIGN KEY (org_id, status)
    REFERENCES public.task_stages (org_id, id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

ALTER TABLE public.task_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view task stages"
    ON public.task_stages FOR SELECT
    TO authenticated
    USING (public.is_org_member(org_id));

CREATE POLICY "Editors can insert task stages"
    ON public.task_stages FOR INSERT
    TO authenticated
    WITH CHECK (public.can_edit_org(org_id));

CREATE POLICY "Editors can update task stages"
    ON public.task_stages FOR UPDATE
    TO authenticated
    USING (public.can_edit_org(org_id))
    WITH CHECK (public.can_edit_org(org_id));

CREATE POLICY "Editors can delete task stages"
    ON public.task_stages FOR DELETE
    TO authenticated
    USING (public.can_edit_org(org_id));

CREATE TRIGGER set_updated_at_task_stages
    BEFORE UPDATE ON public.task_stages
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.create_default_task_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.task_stages (org_id, id, title, color, sort_order)
    VALUES
        (NEW.id, 'todo', 'To-do', 'bg-blue-500', 0),
        (NEW.id, 'in-progress', 'In Progress', 'bg-amber-500', 1),
        (NEW.id, 'done', 'Completed', 'bg-green-500', 2);

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_task_stages() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_default_task_stages() FROM anon;
REVOKE ALL ON FUNCTION public.create_default_task_stages() FROM authenticated;

CREATE TRIGGER create_default_task_stages_after_org_insert
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.create_default_task_stages();
