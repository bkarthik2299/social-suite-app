import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpenText,
  Bot,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  Layers3,
  Loader2,
  Megaphone,
  MessageSquareText,
  PenLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAIMission, useAiRunDetails, useBrandKnowledge } from '@/hooks/useAI';
import { useAllCampaigns, useAllFolders, useBrandGuide, useProjects } from '@/hooks/useDatabase';
import { normalizeBriefToCampaignArtifact } from '@/lib/aiCampaignPack';
import { cn } from '@/lib/utils';
import type { AiArtifact, AiRun, AiRunEvent, AiRunStep, BriefToCampaignArtifact } from '@/types/ai';

const agentActivity = [
  { name: 'Planner Agent', message: 'Resolving destination, campaign length, output types, and approval mode.' },
  { name: 'Brand Guide Agent', message: 'Filtering brand knowledge for tone, writing rules, color cues, and healthcare guardrails.' },
  { name: 'Research Agent', message: 'Preparing research context for the selected work mode.' },
  { name: 'Copywriter Agent', message: 'Drafting channel-ready campaign copy from the brief, brand guide, and research context.' },
  { name: 'Platform Specialist', message: 'Adapting posts, ads, blogs, and calendar items for Social Suite placeholders.' },
  { name: 'QA Agent', message: 'Checking required output groups, campaign dates, claims, and brand fit.' },
  { name: 'Output Mapper Agent', message: 'Preparing the review artifact and draft insertion map.' },
];

export function AIAssistant() {
  const { toast } = useToast();
  const [panelOpen, setPanelOpen] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState('none');
  const [folderId, setFolderId] = useState('none');
  const [campaignId, setCampaignId] = useState('none');
  const [brandGuideId, setBrandGuideId] = useState('none');
  const [currentRun, setCurrentRun] = useState<AiRun | null>(null);
  const [currentArtifact, setCurrentArtifact] = useState<AiArtifact | null>(null);
  const [syntheticStep, setSyntheticStep] = useState(0);
  const [workMode, setWorkMode] = useState<'instant' | 'deep'>('instant');
  const [readyToastRunId, setReadyToastRunId] = useState<string | null>(null);
  const [researchNotesOpen, setResearchNotesOpen] = useState(false);

  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: folders = [], isLoading: foldersLoading } = useAllFolders();
  const { data: campaigns = [], isLoading: campaignsLoading } = useAllCampaigns();
  const { guides = [] } = useBrandGuide(brandGuideId === 'none' ? '' : brandGuideId);
  const selectedBrandGuideId = brandGuideId === 'none' ? '' : brandGuideId;
  const selectedRemoteBrandGuideId = isUuid(selectedBrandGuideId) ? selectedBrandGuideId : '';
  const {
    document: brandKnowledgeDocument,
    compileKnowledge,
  } = useBrandKnowledge(selectedRemoteBrandGuideId);
  const { startRun, commitRun, cancelRun } = useAIMission();
  const { run: latestRun, steps, events, artifacts } = useAiRunDetails(currentRun?.id || null);
  const latestArtifact = artifacts[0] || null;
  const researchEvent = useMemo(
    () => [...events].reverse().find((event) => event.event_type === 'web_sources') || null,
    [events],
  );

  useEffect(() => {
    if (latestRun) setCurrentRun(latestRun);
  }, [latestRun]);

  useEffect(() => {
    if (latestArtifact) setCurrentArtifact(latestArtifact);
  }, [latestArtifact]);

  useEffect(() => {
    if (!latestRun || latestRun.status !== 'needs_approval' || !latestArtifact || readyToastRunId === latestRun.id) return;
    setReadyToastRunId(latestRun.id);
    toast({ title: 'Campaign draft pack ready', description: 'Review the output before creating drafts.' });
  }, [latestArtifact, latestRun, readyToastRunId, toast]);

  const running = startRun.isPending || compileKnowledge.isPending || currentRun?.status === 'running';

  useEffect(() => {
    if (!running) {
      setSyntheticStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      setSyntheticStep((current) => Math.min(current + 1, agentActivity.length - 1));
    }, 1700);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (brandGuideId !== 'none' || projectId === 'none') return;
    const projectGuide = guides.find((guide) => guide.project_id === projectId);
    if (projectGuide?.id) setBrandGuideId(projectGuide.id);
  }, [brandGuideId, guides, projectId]);

  const selectedProjectId = projectId === 'none' ? null : projectId;
  const selectedFolderId = folderId === 'none' ? null : folderId;
  const selectedCampaignId = campaignId === 'none' ? null : campaignId;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) || null;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  const selectedGuide = guides.find((guide) => guide.id === selectedBrandGuideId) || null;

  const availableFolders = useMemo(
    () => selectedProjectId ? folders.filter((folder) => folder.projectId === selectedProjectId) : folders,
    [folders, selectedProjectId],
  );

  const availableCampaigns = useMemo(() => {
    if (selectedFolderId) return campaigns.filter((campaign) => campaign.folderId === selectedFolderId);
    if (selectedProjectId) return campaigns.filter((campaign) => campaign.projectId === selectedProjectId);
    return campaigns;
  }, [campaigns, selectedFolderId, selectedProjectId]);

  const promptReady = prompt.trim().length >= 12 && !!selectedProjectId;
  const artifact = currentArtifact;
  const pack = useMemo(
    () => normalizeBriefToCampaignArtifact(artifact?.content || {}),
    [artifact?.content],
  );
  const displaySteps = steps.length > 0
    ? steps
    : syntheticSteps(running, syntheticStep, {
      workMode,
      projectName: selectedProject?.name,
      brandName: selectedGuide?.brand_name,
      compilingBrandKnowledge: compileKnowledge.isPending,
      startingRun: startRun.isPending,
    });
  const completedSteps = displaySteps.filter((step) => step.status === 'done' || step.status === 'skipped').length;
  const progress = currentRun?.status === 'completed'
    ? 100
    : currentRun?.status === 'needs_approval'
      ? 92
      : running
        ? Math.min(Math.max(12, Math.round((completedSteps / Math.max(displaySteps.length, 1)) * 88)), 84)
        : 0;

  const startMission = async () => {
    if (!prompt.trim()) {
      toast({ title: 'Add a brief first', description: 'Paste meeting notes or campaign requirements before starting.' });
      return;
    }
    if (!selectedProjectId) {
      toast({ title: 'Choose a project', description: 'AI drafts need a project destination before they can be prepared.' });
      return;
    }

    setMissionOpen(true);
    setPanelOpen(false);
    setCurrentRun(null);
    setCurrentArtifact(null);

    let brandKnowledgeDocumentId = brandKnowledgeDocument?.status === 'ready' ? brandKnowledgeDocument.id : null;
    if (selectedRemoteBrandGuideId && !brandKnowledgeDocumentId) {
      try {
        const compiled = await compileKnowledge.mutateAsync();
        brandKnowledgeDocumentId = compiled.document.id;
      } catch (error) {
        toast({
          title: 'Brand knowledge was skipped',
          description: errorMessage(error),
          variant: 'destructive',
        });
      }
    }

    try {
      const result = await startRun.mutateAsync({
        prompt: prompt.trim(),
        projectId: selectedProjectId,
        folderId: selectedFolderId,
        campaignId: selectedCampaignId,
        brandGuideId: selectedRemoteBrandGuideId || null,
        brandKnowledgeDocumentId,
        context: {
          permissionMode: 'approval',
          workMode,
          outputPack: 'balanced-v1',
          requestedOutputs: ['strategy', 'socialPosts', 'googleAds', 'socialAds', 'blogOutlines', 'calendar'],
        },
      });
      setCurrentRun(result.run);
      if (result.artifact) setCurrentArtifact(result.artifact);
      toast({
        title: workMode === 'deep' ? 'Deep Work started' : 'Instant mission started',
        description: workMode === 'deep' ? 'Research and generation steps are now running.' : 'Generation steps are now running.',
      });
    } catch (error) {
      toast({ title: 'AI mission failed', description: errorMessage(error), variant: 'destructive' });
    }
  };

  const approveMission = async () => {
    if (!currentRun || !artifact) return;
    try {
      const result = await commitRun.mutateAsync({ runId: currentRun.id, artifactId: artifact.id });
      setCurrentRun((run) => run ? { ...run, status: 'completed' } : run);
      setCurrentArtifact((item) => item ? { ...item, status: 'inserted' } : item);
      toast({
        title: 'Drafts created',
        description: `${result.inserted.contentCount} content drafts and ${result.inserted.calendarCount} calendar items were added.`,
      });
    } catch (error) {
      toast({ title: 'Could not create drafts', description: errorMessage(error), variant: 'destructive' });
    }
  };

  const cancelMission = async () => {
    if (currentRun?.id && currentRun.status !== 'completed') {
      await cancelRun.mutateAsync(currentRun.id).catch(() => null);
    }
    setMissionOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-9 gap-2 rounded-full border-primary/20 bg-primary/5 px-3 text-primary hover:bg-primary/10"
        onClick={() => setPanelOpen(true)}
      >
        <Sparkles className="h-4 w-4" />
        AI
      </Button>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle>Social Suite AI</SheetTitle>
                <SheetDescription>Brief to Campaign</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client Brief</Label>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[220px] rounded-xl bg-white px-4 py-3 text-sm leading-6"
                  placeholder="Paste meeting notes, campaign goals, audience details, must-have offers, constraints, and any client requirements."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSelect
                  label="Project"
                  value={projectId}
                  onValueChange={(value) => {
                    setProjectId(value);
                    setFolderId('none');
                    setCampaignId('none');
                  }}
                  disabled={projectsLoading}
                  placeholder="Choose project"
                  items={projects.map((project) => ({ id: project.id, label: project.name }))}
                />
                <FieldSelect
                  label="Folder"
                  value={folderId}
                  onValueChange={(value) => {
                    setFolderId(value);
                    setCampaignId('none');
                  }}
                  disabled={foldersLoading}
                  placeholder="Auto folder"
                  optionalLabel="Auto folder"
                  items={availableFolders.map((folder) => ({ id: folder.id, label: folder.name }))}
                />
                <FieldSelect
                  label="Campaign"
                  value={campaignId}
                  onValueChange={(value) => {
                    setCampaignId(value);
                    const campaign = campaigns.find((item) => item.id === value);
                    if (campaign?.folderId) setFolderId(campaign.folderId);
                    if (campaign?.projectId) setProjectId(campaign.projectId);
                  }}
                  disabled={campaignsLoading}
                  placeholder="New AI campaigns"
                  optionalLabel="New AI campaigns"
                  items={availableCampaigns.map((campaign) => ({ id: campaign.id, label: `${campaign.name} (${campaign.type})` }))}
                />
                <FieldSelect
                  label="Brand Guide"
                  value={brandGuideId}
                  onValueChange={setBrandGuideId}
                  placeholder="No brand guide"
                  optionalLabel="No brand guide"
                  items={guides.map((guide) => ({ id: guide.id, label: guide.brand_name || 'Untitled Brand' }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Work Mode</Label>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setWorkMode('instant')}
                    className={cn(
                      'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                      workMode === 'instant' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    <Zap className="h-4 w-4" />
                    Instant
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkMode('deep')}
                    className={cn(
                      'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
                      workMode === 'deep' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    <Search className="h-4 w-4" />
                    Deep Work
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Approval Mode</p>
                    <p className="text-sm text-slate-500">Drafts are created only after review.</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">Restricted</Badge>
                </div>
                <div className="grid gap-2 text-sm text-slate-600">
                  <DestinationLine label="Project" value={selectedProject?.name || 'Required'} />
                  <DestinationLine label="Folder" value={selectedFolder?.name || 'Auto folder'} />
                <DestinationLine label="Campaign" value={selectedCampaign?.name || 'New AI campaigns'} />
                  <DestinationLine label="Brand" value={brandDestinationLabel(selectedGuide?.brand_name || null, selectedBrandGuideId)} />
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="border-t border-slate-200 p-4">
            <Button
              className="h-11 w-full gap-2 rounded-xl bg-primary font-medium text-white hover:bg-primary/90"
              disabled={!promptReady || running}
              onClick={startMission}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Start Mission
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={missionOpen} onOpenChange={setMissionOpen}>
        <DialogContent className="h-[88vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <DialogTitle className="text-xl">Mission Mode</DialogTitle>
                <DialogDescription>{missionDescription(currentRun, running)}</DialogDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{selectedProject?.name || 'Project'}</Badge>
                <Badge variant="outline">{selectedFolder?.name || 'Auto folder'}</Badge>
                {selectedGuide?.brand_name && <Badge variant="outline">{selectedGuide.brand_name}</Badge>}
                <Badge variant="outline">{workMode === 'deep' ? 'Deep Work' : 'Instant'}</Badge>
              </div>
            </div>
            <Progress value={progress} className="mt-4 h-2" />
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ScrollArea className="border-b border-slate-200 lg:border-b-0 lg:border-r">
              <div className="space-y-3 p-5">
                {displaySteps.map((step, index) => (
                  <AgentStepCard key={`${step.agent_name}-${index}`} step={step} activeFallback={running && index === syntheticStep} />
                ))}
              </div>
            </ScrollArea>

            <ScrollArea>
              <div className="p-5">
                {!artifact ? (
                  <RunningPanel
                    running={running}
                    steps={displaySteps}
                    events={events}
                    workMode={workMode}
                    onOpenResearchNotes={researchEvent ? () => setResearchNotesOpen(true) : undefined}
                  />
                ) : (
                  <ArtifactPreview
                    pack={pack}
                    artifact={artifact}
                    events={events}
                    onOpenResearchNotes={researchEvent ? () => setResearchNotesOpen(true) : undefined}
                  />
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="border-t border-slate-200 px-6 py-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setPanelOpen(true)}>
              Back to Prompt
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={cancelMission}>
              Close
            </Button>
            <Button
              className="gap-2 rounded-xl bg-primary px-5 text-white hover:bg-primary/90"
              disabled={!currentRun || !artifact || currentRun.status !== 'needs_approval' || commitRun.isPending}
              onClick={approveMission}
            >
              {commitRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Create Drafts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResearchNotesSheet event={researchEvent} open={researchNotesOpen} onOpenChange={setResearchNotesOpen} />
    </>
  );
}

function FieldSelect({
  label,
  value,
  onValueChange,
  items,
  disabled,
  placeholder,
  optionalLabel,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ id: string; label: string }>;
  disabled?: boolean;
  placeholder: string;
  optionalLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className="h-11 rounded-xl bg-white">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {optionalLabel && <SelectItem value="none">{optionalLabel}</SelectItem>}
          {!optionalLabel && <SelectItem value="none" disabled>{placeholder}</SelectItem>}
          {items.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DestinationLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[220px] truncate font-medium text-slate-800">{value}</span>
    </div>
  );
}

function AgentStepCard({ step, activeFallback }: { step: AiRunStep; activeFallback?: boolean }) {
  const status = activeFallback ? 'working' : step.status;
  const Icon = status === 'done'
    ? CheckCircle2
    : status === 'working'
      ? Loader2
      : status === 'failed'
        ? Circle
        : Clock3;

  return (
    <div className={cn(
      'rounded-xl border bg-white p-4 transition-colors',
      status === 'working' ? 'border-primary/30 bg-primary/5' : 'border-slate-200',
      status === 'failed' && 'border-red-200 bg-red-50',
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500',
          status === 'working' && 'bg-primary/10 text-primary',
          status === 'done' && 'bg-emerald-50 text-emerald-600',
        )}>
          <Icon className={cn('h-4 w-4', status === 'working' && 'animate-spin')} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{step.agent_name}</p>
          <p className="mt-1 text-sm leading-5 text-slate-500">{sanitizeActivityText(stepCardMessage(step))}</p>
        </div>
      </div>
    </div>
  );
}

function stepCardMessage(step: AiRunStep) {
  const message = step.message || step.title || '';
  if (message && message !== step.agent_name && message !== step.title) return message;
  return agentActivity.find((agent) => agent.name === step.agent_name)?.message || step.agent_name;
}

function RunningPanel({
  running,
  steps,
  events,
  workMode,
  onOpenResearchNotes,
}: {
  running: boolean;
  steps: AiRunStep[];
  events: AiRunEvent[];
  workMode: 'instant' | 'deep';
  onOpenResearchNotes?: () => void;
}) {
  const activeStep = steps.find((step) => step.status === 'working')
    || [...steps].reverse().find((step) => step.status === 'done' || step.status === 'skipped')
    || steps[0];
  const recentEvents = [...events].slice(-6).reverse();

  return (
    <div className="min-h-[420px] rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5">
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {running ? <Loader2 className="h-6 w-6 animate-spin" /> : <Sparkles className="h-6 w-6" />}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{activeStep?.agent_name || 'Starting mission'}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {sanitizeActivityText(activeStep?.message || (workMode === 'deep' ? 'Preparing research and brand context.' : 'Preparing campaign generation.'))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit">{workMode === 'deep' ? 'Deep Work' : 'Instant'}</Badge>
          {onOpenResearchNotes && <ResearchNotesButton onClick={onOpenResearchNotes} />}
        </div>
      </div>

      <RunActivityTrail
        title="Live Activity"
        emptyText={activeStep?.message || 'The run has been queued.'}
        events={recentEvents}
        totalCount={events.length}
      />
    </div>
  );
}

function RunActivityTrail({
  title,
  emptyText,
  events,
  totalCount,
  emptyStateLabel = 'Waiting for first event',
}: {
  title: string;
  emptyText: string;
  events: AiRunEvent[];
  totalCount: number;
  emptyStateLabel?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <span className="text-xs text-slate-500">{events.length ? `${totalCount} events` : emptyStateLabel}</span>
      </div>
      {events.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        events.map((event) => <RunEventRow key={event.id} event={event} />)
      )}
    </div>
  );
}

function RunEventRow({ event }: { event: AiRunEvent }) {
  const sources = eventSources(event);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{eventDisplayMessage(event)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatTime(event.created_at)}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{event.event_type.replace(/_/g, ' ')}</Badge>
      </div>
      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sources.map((source) => (
            <a
              key={source.url || source.title}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="max-w-full truncate rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-primary/40 hover:text-primary"
            >
              {source.title || source.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ResearchNotesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg px-3" onClick={onClick}>
      <BookOpenText className="h-3.5 w-3.5" />
      Research Notes
    </Button>
  );
}

function ResearchNotesSheet({
  event,
  open,
  onOpenChange,
}: {
  event: AiRunEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const notes = researchNotesFromEvent(event);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpenText className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle>Research Notes</SheetTitle>
              <SheetDescription>Web context used while preparing this campaign pack.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 px-6 py-5">
            <ResearchNoteSection title="Research Question">
              <p className="break-words text-sm leading-6 text-slate-700">{notes.query || 'No research query was recorded.'}</p>
            </ResearchNoteSection>

            {notes.campaignGuidance && (
              <ResearchNoteSection title="Campaign Focus">
                <p className="text-sm leading-6 text-slate-700">{notes.campaignGuidance}</p>
              </ResearchNoteSection>
            )}

            <ResearchNoteSection title="Key Findings">
              {notes.findings.length ? (
                <ul className="space-y-3">
                  {notes.findings.map((finding, index) => (
                    <li key={`${finding}-${index}`} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-slate-600">The research step completed without a separate summary.</p>
              )}
            </ResearchNoteSection>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sources Used</h3>
                <Badge variant="outline">{notes.sources.length} sources</Badge>
              </div>
              {notes.sources.map((source, index) => (
                <div key={source.url || `${source.title}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-5 text-slate-900">{source.title || source.url}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{sourceDomain(source.url)}</p>
                      </div>
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open source: ${source.title || source.url}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-primary/40 hover:text-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {typeof source.score === 'number' && (
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${relevancePercent(source.score)}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {relevancePercent(source.score)}% relevant
                      </span>
                    </div>
                  )}
                  {source.content && (
                    <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Referenced Excerpt</p>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">{source.content}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ResearchNoteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function ArtifactPreview({
  pack,
  artifact,
  events,
  onOpenResearchNotes,
}: {
  pack: BriefToCampaignArtifact;
  artifact: AiArtifact;
  events: AiRunEvent[];
  onOpenResearchNotes?: () => void;
}) {
  const socialCount = pack.socialPosts?.length || 0;
  const googleCount = pack.googleAds?.length || 0;
  const socialAdCount = pack.socialAds?.length || 0;
  const blogCount = pack.blogOutlines?.length || 0;
  const calendarCount = pack.calendar?.length || 0;
  const recentEvents = [...events].slice(-8).reverse();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{artifact.title}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{pack.strategy?.summary || 'Campaign pack is ready for review.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenResearchNotes && <ResearchNotesButton onClick={onOpenResearchNotes} />}
          <Badge variant={artifact.status === 'inserted' ? 'default' : 'secondary'} className="w-fit capitalize">
            {artifact.status}
          </Badge>
        </div>
      </div>

      <RunActivityTrail
        title="Activity Trail"
        emptyText="No backend events were recorded for this run."
        events={recentEvents}
        totalCount={events.length}
        emptyStateLabel="No events"
      />

      <Tabs defaultValue="strategy" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="strategy" className="gap-2 rounded-lg"><Layers3 className="h-4 w-4" />Strategy</TabsTrigger>
          <TabsTrigger value="social" className="gap-2 rounded-lg"><MessageSquareText className="h-4 w-4" />Social {socialCount}</TabsTrigger>
          <TabsTrigger value="ads" className="gap-2 rounded-lg"><Megaphone className="h-4 w-4" />Ads {googleCount + socialAdCount}</TabsTrigger>
          <TabsTrigger value="blogs" className="gap-2 rounded-lg"><FileText className="h-4 w-4" />Blogs {blogCount}</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2 rounded-lg"><CalendarDays className="h-4 w-4" />Calendar {calendarCount}</TabsTrigger>
        </TabsList>

        <TabsContent value="strategy">
          <PreviewSection icon={ShieldCheck} title={pack.strategy?.title || 'Campaign Strategy'}>
            <p className="text-sm leading-6 text-slate-600">{pack.strategy?.summary || 'No strategy summary returned.'}</p>
            <PreviewList title="Objectives" items={pack.strategy?.objectives || []} />
            <PreviewList title="Content Pillars" items={pack.strategy?.contentPillars || []} />
          </PreviewSection>
        </TabsContent>

        <TabsContent value="social">
          <div className="grid gap-3 md:grid-cols-2">
            {(pack.socialPosts || []).map((post, index) => (
              <PreviewCard key={`${post.name}-${index}`} title={post.name || post.topic || `Social Post ${index + 1}`} badge={post.platforms?.join(', ') || 'social'}>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{post.caption}</p>
                {post.creativeBrief && <p className="mt-3 text-xs text-slate-500">{post.creativeBrief}</p>}
              </PreviewCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ads">
          <div className="grid gap-3 lg:grid-cols-2">
            {(pack.googleAds || []).map((ad, index) => (
              <PreviewCard key={`${ad.name}-${index}`} title={ad.name || `Google Ad ${index + 1}`} badge="Google">
                <PreviewList title="Headlines" items={ad.headlines || []} compact />
                <PreviewList title="Descriptions" items={ad.descriptions || []} compact />
              </PreviewCard>
            ))}
            {(pack.socialAds || []).map((ad, index) => (
              <PreviewCard key={`${ad.name}-${index}`} title={ad.name || `Paid Social Ad ${index + 1}`} badge={ad.platform || 'paid social'}>
                <p className="text-sm leading-6 text-slate-600">{ad.primaryText}</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{ad.headline}</p>
                {ad.description && <p className="text-sm text-slate-500">{ad.description}</p>}
              </PreviewCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="blogs">
          <div className="grid gap-3">
            {(pack.blogOutlines || []).map((blog, index) => (
              <PreviewCard key={`${blog.slug}-${index}`} title={blog.title || `Blog Outline ${index + 1}`} badge={blog.slug || 'blog'}>
                <p className="text-sm leading-6 text-slate-600">{blog.excerpt}</p>
                <PreviewList title="Outline" items={blog.outline || []} compact />
                <PreviewList title="Keywords" items={blog.keywords || []} compact />
              </PreviewCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid gap-2">
            {(pack.calendar || []).map((item, index) => (
              <div key={`${item.date}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(item.date)}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{item.type}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewSection({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function PreviewCard({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold leading-5 text-slate-900">{title}</h4>
        {badge && <Badge variant="outline" className="max-w-[180px] truncate capitalize">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}

function PreviewList({ title, items, compact }: { title: string; items: string[]; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={compact ? 'mt-3' : ''}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-5 text-slate-600">
            <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function syntheticSteps(
  isRunning: boolean,
  activeIndex: number,
  options: {
    workMode: 'instant' | 'deep';
    projectName?: string;
    brandName?: string;
    compilingBrandKnowledge: boolean;
    startingRun: boolean;
  },
): AiRunStep[] {
  const projectLabel = options.projectName || 'the selected project';
  const brandLabel = options.brandName || 'the selected brand guide';
  const agents = agentActivity.map((agent) => {
    if (agent.name === 'Planner Agent' && options.startingRun) {
      return { ...agent, message: `Starting the backend mission for ${projectLabel} and sending the requested output map.` };
    }
    if (agent.name === 'Brand Guide Agent' && options.compilingBrandKnowledge) {
      return { ...agent, message: `Compiling ${brandLabel} into a concise brand knowledge source before generation.` };
    }
    if (agent.name === 'Research Agent') {
      return {
        ...agent,
        message: options.workMode === 'deep'
          ? 'Deep Work is enabled, so the backend will research the web and attach source links to the run.'
          : 'Instant mode is enabled, so web research will be skipped and the run will use brand context only.',
      };
    }
    return agent;
  });

  return agents.map((agent, index) => ({
    id: `${agent.name}-${index}`,
    run_id: 'pending',
    agent_id: null,
    agent_name: agent.name,
    title: agent.name,
    status: !isRunning ? 'queued' : index < activeIndex ? 'done' : index === activeIndex ? 'working' : 'queued',
    message: agent.message,
    sort_order: index,
    started_at: null,
    completed_at: null,
    created_at: null,
    updated_at: null,
  }));
}

function missionDescription(run: AiRun | null, running: boolean) {
  if (running) return 'Agents are working through the brief now.';
  if (run?.status === 'completed') return 'Drafts have been created in Social Suite.';
  if (run?.status === 'needs_approval') return 'Review the campaign pack before creating drafts.';
  if (run?.status === 'failed') return run.error || 'The mission could not complete.';
  return 'Prepare, review, and approve campaign drafts.';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function brandDestinationLabel(name: string | null, guideId: string) {
  if (!name) return 'No brand guide';
  if (!isUuid(guideId)) return `${name} (local only)`;
  return name;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value: string | null) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function eventSources(event: AiRunEvent): Array<{ title: string; url: string; score?: number; content?: string }> {
  const sources = event.payload?.sources;
  if (!Array.isArray(sources)) return [];

  return sources.flatMap((source) => {
    if (!source || typeof source !== 'object') return [];
    const item = source as { title?: unknown; url?: unknown; score?: unknown; content?: unknown };
    if (typeof item.url !== 'string' || !item.url) return [];
    return [{
      title: typeof item.title === 'string' && item.title ? item.title : item.url,
      url: item.url,
      score: typeof item.score === 'number' ? item.score : undefined,
      content: typeof item.content === 'string' ? item.content : undefined,
    }];
  });
}

function researchNotesFromEvent(event: AiRunEvent | null) {
  const answer = typeof event?.payload?.answer === 'string' ? event.payload.answer : '';
  return {
    query: typeof event?.payload?.query === 'string' ? event.payload.query : '',
    campaignGuidance: typeof event?.payload?.campaignGuidance === 'string' ? event.payload.campaignGuidance : '',
    findings: splitResearchFindings(answer),
    sources: event ? eventSources(event) : [],
  };
}

function splitResearchFindings(value: string) {
  return value
    .split(/;\s+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .flatMap(splitLongResearchFinding)
    .map((item) => sanitizeActivityText(item.trim()))
    .filter(Boolean);
}

function splitLongResearchFinding(value: string) {
  if (value.length <= 320) return [value];
  return value.split(/,\s+(?=(?:beginning with|followed by|accompanied by|while|using|featuring|emphasizing|introduce|launch|push|and close with|each ad))/i);
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function relevancePercent(value: number) {
  return Math.min(Math.max(Math.round(value * 100), 0), 100);
}

function eventDisplayMessage(event: AiRunEvent) {
  const sources = eventSources(event);
  const query = typeof event.payload?.query === 'string' ? event.payload.query : '';
  if (event.event_type === 'web_search') return `Web research started${query ? ` for: ${query}` : '.'}`;
  if (event.event_type === 'web_sources') return `Research found ${sources.length} useful sources and extracted campaign context.`;
  if (event.event_type === 'web_search_failed') return 'Web research could not be completed. Continuing with the brief and brand guide.';
  if (event.event_type === 'model_call') return 'Draft generation started using the selected work mode.';
  if (event.event_type === 'model_fallback') return 'Primary generation could not complete. Structured draft placeholders were prepared for review.';
  return sanitizeActivityText(event.message || event.event_type);
}

function sanitizeActivityText(value: string) {
  return value
    .replace(/Tavily/gi, 'web research')
    .replace(/OpenRouter model\s+\S+/gi, 'the selected AI route')
    .replace(/OpenRouter/gi, 'AI generation');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
