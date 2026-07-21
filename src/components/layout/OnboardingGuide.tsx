import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Check,
  Rocket,
  X,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  useAllCampaigns,
  useAllContentItems,
  useAllFolders,
  useBrandGuide,
  useFeedFolders,
  useNotes,
  usePortalClients,
  useProjects,
  useTasks,
  useVault,
} from '@/hooks/useDatabase';
import { useAiRuns } from '@/hooks/useAI';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { campaignPath, folderPath, projectPath } from '@/lib/routes';
import {
  hasScheduledContent,
  onboardingStorageKey,
  type OnboardingVisitId,
} from '@/lib/onboarding';

type ChecklistStep = {
  id: string;
  title: string;
  summary: string;
  complete: boolean;
  action: () => void;
};

const visitRoutes: Array<{ id: OnboardingVisitId; prefix: string }> = [
  { id: 'notes', prefix: '/tools/notes' },
  { id: 'reference-feed', prefix: '/tools/feed' },
  { id: 'client-portal', prefix: '/tools/client-portal' },
  { id: 'social-preview', prefix: '/tools/sm-preview' },
  { id: 'password-vault', prefix: '/tools/vault' },
  { id: 'teams', prefix: '/teams' },
];

export function OnboardingGuide() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, organization, membership } = useAuth();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState<Set<OnboardingVisitId>>(new Set());

  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: folders = [], isLoading: foldersLoading } = useAllFolders();
  const { data: campaigns = [], isLoading: campaignsLoading } = useAllCampaigns();
  const { data: contentItems = [], isLoading: contentLoading } = useAllContentItems();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { guides = [], isLoading: guidesLoading } = useBrandGuide('');
  const { data: aiRuns = [], isLoading: aiRunsLoading } = useAiRuns();
  const { data: notes = [], isLoading: notesLoading } = useNotes();
  const { data: feedFolders = [], isLoading: feedFoldersLoading } = useFeedFolders();
  const { data: portalClients = [], isLoading: portalClientsLoading } = usePortalClients();
  const { data: credentials = [], isLoading: credentialsLoading } = useVault();

  const userId = user?.id || '';
  const organizationId = organization?.id || '';
  const canCreate = membership?.role !== 'viewer';
  const progressLoading = projectsLoading
    || foldersLoading
    || campaignsLoading
    || contentLoading
    || tasksLoading
    || guidesLoading
    || aiRunsLoading
    || notesLoading
    || feedFoldersLoading
    || portalClientsLoading
    || credentialsLoading;

  useEffect(() => {
    if (!userId || !organizationId || progressLoading) return;
    const raw = window.localStorage.getItem(onboardingStorageKey('visited', userId, organizationId));
    if (!raw) {
      setVisited(new Set());
      return;
    }

    try {
      const values = JSON.parse(raw) as OnboardingVisitId[];
      setVisited(new Set(values));
    } catch {
      setVisited(new Set());
    }
  }, [organizationId, progressLoading, userId]);

  useEffect(() => {
    if (!userId || !organizationId) return;
    const seenKey = onboardingStorageKey('seen', userId, organizationId);
    if (window.localStorage.getItem(seenKey)) return;

    window.localStorage.setItem(seenKey, new Date().toISOString());
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [organizationId, userId]);

  useEffect(() => {
    const matchedVisit = visitRoutes.find((item) => location.pathname.startsWith(item.prefix));
    if (!matchedVisit || !userId || !organizationId) return;

    setVisited((current) => {
      if (current.has(matchedVisit.id)) return current;
      const next = new Set(current);
      next.add(matchedVisit.id);
      window.localStorage.setItem(
        onboardingStorageKey('visited', userId, organizationId),
        JSON.stringify([...next]),
      );
      return next;
    });
  }, [location.pathname, organizationId, userId]);

  const markVisited = (id: OnboardingVisitId) => {
    setVisited((current) => {
      const next = new Set(current);
      next.add(id);
      if (userId && organizationId) {
        window.localStorage.setItem(
          onboardingStorageKey('visited', userId, organizationId),
          JSON.stringify([...next]),
        );
      }
      return next;
    });
  };

  const go = (path: string, state?: Record<string, unknown>) => {
    setOpen(false);
    navigate(path, state ? { state } : undefined);
  };

  const openAi = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('socialsuite:open-ai'));
  };

  const firstProject = projects[0];
  const firstFolder = folders[0];
  const firstCampaign = campaigns[0];
  const folderProject = firstFolder ? projects.find((item) => item.id === firstFolder.projectId) : undefined;
  const campaignFolder = firstCampaign ? folders.find((item) => item.id === firstCampaign.folderId) : undefined;
  const campaignProject = campaignFolder ? projects.find((item) => item.id === campaignFolder.projectId) : undefined;

  const goToFolderCreation = () => {
    if (!firstProject) {
      go('/projects', canCreate ? { onboardingAction: 'create-project' } : undefined);
      return;
    }
    go(projectPath(firstProject, projects), canCreate ? { onboardingAction: 'create-folder' } : undefined);
  };

  const goToCampaignCreation = () => {
    if (!firstFolder || !folderProject) {
      goToFolderCreation();
      return;
    }
    go(
      folderPath(
        folderProject,
        firstFolder,
        projects,
        folders.filter((item) => item.projectId === folderProject.id),
      ),
      canCreate ? { onboardingAction: 'create-campaign' } : undefined,
    );
  };

  const goToScheduling = () => {
    if (!firstCampaign || !campaignFolder || !campaignProject) {
      goToCampaignCreation();
      return;
    }
    go(
      campaignPath(
        campaignProject,
        campaignFolder,
        firstCampaign,
        projects,
        folders.filter((item) => item.projectId === campaignProject.id),
        campaigns.filter((item) => item.folderId === campaignFolder.id),
      ),
      { type: firstCampaign.type, onboardingAction: 'schedule-content' },
    );
  };

  const coreSteps = useMemo<ChecklistStep[]>(() => [
    {
      id: 'project',
      title: 'Create your first project',
      summary: 'Set up a workspace for a client or initiative.',
      complete: projects.length > 0,
      action: () => go('/projects', canCreate ? { onboardingAction: 'create-project' } : undefined),
    },
    {
      id: 'folder',
      title: 'Create a folder',
      summary: 'Group related campaigns inside a project.',
      complete: folders.length > 0,
      action: goToFolderCreation,
    },
    {
      id: 'campaign',
      title: 'Create campaign content',
      summary: 'Choose a channel and start producing work.',
      complete: campaigns.length > 0,
      action: goToCampaignCreation,
    },
    {
      id: 'brand-guide',
      title: 'Create a Brand Guide',
      summary: 'Give your team and AI a consistent brand foundation.',
      complete: guides.length > 0,
      action: () => go('/tools/brand-guide', canCreate ? { onboardingAction: 'create-brand-guide' } : undefined),
    },
    {
      id: 'ai',
      title: 'Create with AI',
      summary: 'Turn a brief into a structured campaign pack.',
      complete: aiRuns.length > 0,
      action: openAi,
    },
    {
      id: 'task',
      title: 'Add your first task',
      summary: 'Track a piece of work across the workspace.',
      complete: tasks.length > 0,
      action: () => go('/tasks', canCreate ? { onboardingAction: 'create-task' } : undefined),
    },
    {
      id: 'calendar',
      title: 'Schedule content on Calendar',
      summary: 'Add a date and see your campaign take shape.',
      complete: hasScheduledContent(contentItems),
      action: hasScheduledContent(contentItems) ? () => go('/calendar') : goToScheduling,
    },
  // Navigation helpers intentionally use the latest workspace collections.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [aiRuns, campaigns, canCreate, contentItems, folders, guides, projects, tasks]);

  const exploreSteps: ChecklistStep[] = [
    {
      id: 'notes', title: 'Notes',
      summary: 'Capture ideas and working context.',
      complete: notes.length > 0 || visited.has('notes'),
      action: () => { markVisited('notes'); go('/tools/notes'); },
    },
    {
      id: 'reference-feed', title: 'Reference Feed',
      summary: 'Collect inspiration in one place.',
      complete: feedFolders.length > 0 || visited.has('reference-feed'),
      action: () => { markVisited('reference-feed'); go('/tools/feed'); },
    },
    {
      id: 'client-portal', title: 'Client Portal',
      summary: 'Share work for client review.',
      complete: portalClients.length > 0 || visited.has('client-portal'),
      action: () => { markVisited('client-portal'); go('/tools/client-portal'); },
    },
    {
      id: 'social-preview', title: 'Social Preview',
      summary: 'Check creative fit before publishing.',
      complete: visited.has('social-preview'),
      action: () => { markVisited('social-preview'); go('/tools/sm-preview'); },
    },
    {
      id: 'password-vault', title: 'Password Vault',
      summary: 'Keep shared credentials organized.',
      complete: credentials.length > 0 || visited.has('password-vault'),
      action: () => { markVisited('password-vault'); go('/tools/vault'); },
    },
    {
      id: 'teams', title: 'Teams',
      summary: 'See members and invite collaborators.',
      complete: visited.has('teams'),
      action: () => { markVisited('teams'); go('/teams'); },
    },
  ];

  const allSteps = [...coreSteps, ...exploreSteps];
  const completedCount = allSteps.filter((step) => step.complete).length;
  const pendingCount = allSteps.length - completedCount;
  const progress = Math.round((completedCount / allSteps.length) * 100);
  const nextStep = coreSteps.find((step) => !step.complete)?.id;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="soft-card relative h-9 w-9 overflow-visible rounded-full text-primary transition-colors hover:bg-white hover:text-primary"
              aria-label={`Getting started, ${pendingCount} item${pendingCount === 1 ? '' : 's'} remaining`}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                <Rocket className="h-5 w-5" />
              </span>
              {!progressLoading && pendingCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white shadow-sm ring-2 ring-white"
                >
                  {pendingCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Getting started · {pendingCount} remaining
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="soft-card w-[min(92vw,410px)] overflow-hidden rounded-2xl border-0 bg-white p-0 !shadow-[0_22px_58px_-30px_rgba(37,99,235,0.42),0_14px_34px_-28px_rgba(15,23,42,0.24)]"
      >
        <div className="border-b border-blue-100/70 bg-gradient-to-br from-blue-50/80 via-white to-white px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight text-slate-950">Explore Social Suite</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">A quiet guide to help you get useful work moving.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
              onClick={() => setOpen(false)}
              aria-label="Close getting started guide"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={progress} className="h-1.5 flex-1 bg-blue-100" />
            <span className="whitespace-nowrap text-[11px] font-semibold text-primary">{completedCount} of {allSteps.length}</span>
          </div>
        </div>

        <div className="onboarding-guide-scrollbar max-h-[min(68vh,590px)] overflow-y-auto px-3 py-3">
          <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">Workspace essentials</p>
          <div className="space-y-1">
            {coreSteps.map((step) => (
              <ChecklistRow
                key={step.id}
                step={step}
                recommended={nextStep === step.id}
              />
            ))}
          </div>

          <div className="mt-3 border-t border-blue-100/70 pt-3">
            <div className="px-2 pb-2 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-slate-400">Explore more tools</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Optional features for planning, review, and inspiration.</p>
            </div>
            <ExploreChecklist steps={exploreSteps} />
          </div>
        </div>

        <div className="border-t border-blue-100/70 bg-slate-50/70 px-5 py-3 text-[10.5px] leading-4 text-slate-500">
          This guide stays available here and never blocks the rest of your workspace.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExploreChecklist({ steps }: { steps: ChecklistStep[] }) {
  return (
    <div className="mt-1 space-y-1">
      {steps.map((step) => (
        <ChecklistRow
          key={step.id}
          step={step}
        />
      ))}
    </div>
  );
}

function ChecklistRow({
  step,
  recommended = false,
}: {
  step: ChecklistStep;
  recommended?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border border-transparent transition-colors duration-200 hover:bg-slate-50/80',
      recommended && !step.complete && 'border-blue-100 bg-blue-50/55',
    )}>
      <div className="flex items-start px-2 py-2.5">
        <button
          type="button"
          onClick={step.action}
          className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          <span className={cn(
            'mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md border shadow-sm transition-all duration-300 ease-out',
            step.complete
              ? 'scale-100 border-primary bg-primary text-white shadow-blue-200/70'
              : 'border-slate-300 bg-white text-transparent group-hover:border-primary/55 group-hover:shadow-blue-100',
          )}>
            <Check
              className={cn(
                'h-3 w-3 transition-all duration-300 ease-out',
                step.complete ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
              )}
              strokeWidth={3}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="relative min-w-0 truncate">
                <span className={cn(
                  'block truncate text-[12.5px] font-semibold leading-5 transition-colors duration-300',
                  step.complete ? 'text-slate-500' : 'text-slate-900',
                )}>
                  {step.title}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 right-0 top-1/2 h-px origin-left bg-slate-400/80 transition-transform duration-500 ease-out',
                    step.complete ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
              {recommended && !step.complete && (
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary shadow-sm">Next</span>
              )}
            </span>
            <span className={cn(
              'mt-0.5 block text-[11px] leading-4 transition-colors duration-300',
              step.complete ? 'text-slate-400' : 'text-slate-600',
            )}>
              {step.summary}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
