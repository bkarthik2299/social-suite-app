import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  Layers3,
  Loader2,
  Megaphone,
  MessageSquareText,
  PenLine,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Workflow,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { defaultAiAgentFlow, useAIMission, useAiAgents, useAiRunDetails, useAiWorkflow, useBrandKnowledge } from '@/hooks/useAI';
import { useAllCampaigns, useAllFolders, useBrandGuide, useCampaigns, useFolders, useProjects } from '@/hooks/useDatabase';
import { normalizeBriefToCampaignArtifact } from '@/lib/aiCampaignPack';
import { cn } from '@/lib/utils';
import type { CampaignType } from '@/types';
import type { AiAgent, AiArtifact, AiDraftSelection, AiRun, AiRunEvent, AiRunStep, BriefToCampaignArtifact } from '@/types/ai';

const agentActivity = [
  { name: 'Planner Agent', message: 'Resolving destination, campaign length, output types, and approval mode.' },
  { name: 'Brand Guide Agent', message: 'Filtering brand knowledge for tone, writing rules, color cues, and healthcare guardrails.' },
  { name: 'Research Agent', message: 'Preparing research context for the selected work mode.' },
  { name: 'Copywriter Agent', message: 'Drafting channel-ready campaign copy from the brief, brand guide, and research context.' },
  { name: 'Platform Specialist', message: 'Adapting posts, ads, blogs, and calendar items for Social Suite placeholders.' },
  { name: 'QA Agent', message: 'Checking required output groups, campaign dates, claims, and brand fit.' },
  { name: 'Output Mapper Agent', message: 'Preparing the review artifact and draft insertion map.' },
];

type DestinationKind = 'project' | 'folder' | 'campaign';
type DraftSelectionKind = keyof AiDraftSelection;

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
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [createDestination, setCreateDestination] = useState<DestinationKind | null>(null);
  const [newDestinationName, setNewDestinationName] = useState('');
  const [newCampaignType, setNewCampaignType] = useState<CampaignType>('socials');
  const [selectedDraftKeys, setSelectedDraftKeys] = useState<string[]>([]);

  const { data: projects = [], isLoading: projectsLoading, addProject } = useProjects();
  const { data: folders = [], isLoading: foldersLoading } = useAllFolders();
  const { data: campaigns = [], isLoading: campaignsLoading } = useAllCampaigns();
  const { addFolder } = useFolders(projectId === 'none' ? '' : projectId);
  const { addCampaign } = useCampaigns(folderId === 'none' ? '' : folderId);
  const { data: agents = [], saveSkill, createAgent, deleteAgent } = useAiAgents();
  const { data: workflowSteps = [], saveWorkflow } = useAiWorkflow();
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
    if (!latestRun) return;
    setCurrentRun(latestRun);
    setProjectId(latestRun.project_id || 'none');
    setFolderId(latestRun.folder_id || 'none');
    setCampaignId(latestRun.campaign_id || 'none');
    setBrandGuideId(latestRun.brand_guide_id || 'none');
    if (latestRun.context?.workMode === 'deep' || latestRun.context?.workMode === 'instant') {
      setWorkMode(latestRun.context.workMode);
    }
  }, [latestRun]);

  useEffect(() => {
    if (latestArtifact) setCurrentArtifact(latestArtifact);
  }, [latestArtifact]);

  useEffect(() => {
    const openPreviousRun = (event: Event) => {
      const runId = (event as CustomEvent<{ runId?: string }>).detail?.runId;
      if (!runId) return;
      setCurrentRun({ id: runId } as AiRun);
      setCurrentArtifact(null);
      setPanelOpen(false);
      setMissionOpen(true);
    };
    window.addEventListener('socialsuite:open-ai-run', openPreviousRun);
    return () => window.removeEventListener('socialsuite:open-ai-run', openPreviousRun);
  }, []);

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
  const workflowSlugs = workflowSteps.length
    ? workflowSteps.map((step) => step.agent_slug)
    : defaultAiAgentFlow.filter((slug) => agents.some((agent) => agent.slug === slug));

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
  const availableDraftKeys = useMemo(() => draftKeys(pack), [pack]);
  const selectedDraftKeySet = useMemo(() => new Set(selectedDraftKeys), [selectedDraftKeys]);
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
      const result = await commitRun.mutateAsync({
        runId: currentRun.id,
        artifactId: artifact.id,
        selection: draftSelection(selectedDraftKeys),
      });
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

  useEffect(() => {
    setSelectedDraftKeys(availableDraftKeys);
  }, [artifact?.id, availableDraftKeys]);

  const cancelMission = async () => {
    if (currentRun?.id && currentRun.status !== 'completed') {
      await cancelRun.mutateAsync(currentRun.id).catch(() => null);
    }
    setMissionOpen(false);
  };

  const openCreateDestination = (kind: DestinationKind) => {
    if (kind === 'folder' && !selectedProjectId) {
      toast({ title: 'Choose a project first', description: 'A new folder needs a project destination.' });
      return;
    }
    if (kind === 'campaign' && !selectedFolderId) {
      toast({ title: 'Choose a folder first', description: 'A new campaign needs a folder destination.' });
      return;
    }
    setNewDestinationName('');
    setNewCampaignType('socials');
    setCreateDestination(kind);
  };

  const saveDestination = async () => {
    const name = newDestinationName.trim();
    if (!createDestination || !name) return;

    try {
      if (createDestination === 'project') {
        const project = await addProject.mutateAsync(name);
        setProjectId(project.id);
        setFolderId('none');
        setCampaignId('none');
      }
      if (createDestination === 'folder') {
        const folder = await addFolder.mutateAsync(name);
        setFolderId(folder.id);
        setCampaignId('none');
      }
      if (createDestination === 'campaign') {
        const campaign = await addCampaign.mutateAsync({ name, type: newCampaignType });
        setCampaignId(campaign.id);
      }
      toast({ title: `${destinationLabel(createDestination)} created`, description: `${name} is selected as the AI destination.` });
      setCreateDestination(null);
      setNewDestinationName('');
    } catch (error) {
      toast({ title: `Could not create ${createDestination}`, description: errorMessage(error), variant: 'destructive' });
    }
  };

  const saveAgentSkill = async (agent: AiAgent, skillMd: string) => {
    try {
      await saveSkill.mutateAsync({ agent, skillMd });
      toast({ title: 'Agent skill updated', description: `${agent.name} now uses the workspace version of this skill.` });
    } catch (error) {
      toast({ title: 'Could not update agent skill', description: errorMessage(error), variant: 'destructive' });
      throw error;
    }
  };

  const saveAgentWorkflow = async (agentSlugs: string[]) => {
    try {
      await saveWorkflow.mutateAsync(agentSlugs);
      toast({ title: 'Agent flow updated', description: 'The workspace handoff order is ready for the next mission.' });
    } catch (error) {
      toast({ title: 'Could not update agent flow', description: errorMessage(error), variant: 'destructive' });
      throw error;
    }
  };

  const createWorkspaceAgent = async (input: { name: string; description: string; skillMd: string }) => {
    try {
      const agent = await createAgent.mutateAsync(input);
      toast({ title: 'Custom agent created', description: `${agent.name} is ready to add to the workflow.` });
      return agent;
    } catch (error) {
      toast({ title: 'Could not create agent', description: errorMessage(error), variant: 'destructive' });
      throw error;
    }
  };

  const deleteWorkspaceAgent = async (agent: AiAgent) => {
    try {
      await deleteAgent.mutateAsync(agent);
      toast({ title: 'Custom agent deleted', description: `${agent.name} was removed from this workspace.` });
    } catch (error) {
      toast({ title: 'Could not delete agent', description: errorMessage(error), variant: 'destructive' });
      throw error;
    }
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
        <SheetContent side="right" overlayClassName="bg-white/10 backdrop-blur-[1px]" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-slate-200 py-5 pl-6 pr-12">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle>Social Suite AI</SheetTitle>
                <SheetDescription>Brief to Campaign</SheetDescription>
              </div>
              </div>
              <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => setSkillsOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" />
                Customize Agent
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enter your brief</Label>
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
                  createLabel="Create new project"
                  onCreate={() => openCreateDestination('project')}
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
                  createLabel="Create new folder"
                  onCreate={() => openCreateDestination('folder')}
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
                  createLabel="Create new campaign"
                  onCreate={() => openCreateDestination('campaign')}
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
        <DialogContent className="h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-[1440px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="border-b border-slate-200 px-4 py-4 pr-10 sm:px-6 sm:py-5 sm:pr-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <DialogTitle className="text-xl">Mission Mode</DialogTitle>
                <DialogDescription>{missionDescription(currentRun, running)}</DialogDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {researchEvent && <ResearchNotesButton onClick={() => setResearchNotesOpen(true)} />}
                <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg px-3" onClick={() => setSkillsOpen(true)}>
                  <Settings2 className="h-3.5 w-3.5" />
                  Customize Agent
                </Button>
                <Badge variant="outline">{selectedProject?.name || 'Project'}</Badge>
                <Badge variant="outline">{selectedFolder?.name || 'Auto folder'}</Badge>
                {selectedGuide?.brand_name && <Badge variant="outline">{selectedGuide.brand_name}</Badge>}
                <Badge variant="outline">{workMode === 'deep' ? 'Deep Work' : 'Instant'}</Badge>
              </div>
            </div>
            <Progress value={progress} className="mt-4 h-2" />
          </DialogHeader>

          <div className="grid min-h-0 min-w-0 grid-cols-1 grid-rows-[minmax(160px,30vh)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
            <ScrollArea className="min-h-0 min-w-0 max-w-full border-b border-slate-200 lg:border-b-0 lg:border-r">
              <div className="space-y-3 p-5">
                {displaySteps.map((step, index) => (
                  <AgentStepCard key={`${step.agent_name}-${index}`} step={step} activeFallback={running && index === syntheticStep} />
                ))}
              </div>
            </ScrollArea>

            <ScrollArea className="min-h-0 min-w-0 max-w-full">
              <div className="min-w-0 max-w-full overflow-hidden p-4 sm:p-5">
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
                    selectedKeys={selectedDraftKeySet}
                    onToggleDraft={(key, checked) => {
                      setSelectedDraftKeys((current) => checked
                        ? Array.from(new Set([...current, key]))
                        : current.filter((item) => item !== key));
                    }}
                    onToggleDrafts={(keys, checked) => {
                      setSelectedDraftKeys((current) => checked
                        ? Array.from(new Set([...current, ...keys]))
                        : current.filter((item) => !keys.includes(item)));
                    }}
                  />
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="flex-row flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3 sm:space-x-0 sm:px-6 sm:py-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setPanelOpen(true)}>
              Back to Prompt
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={cancelMission}>
              Close
            </Button>
            <Button
              className="gap-2 rounded-xl bg-primary px-5 text-white hover:bg-primary/90"
              disabled={!currentRun || !artifact || currentRun.status !== 'needs_approval' || commitRun.isPending || selectedDraftKeys.length === 0}
              onClick={approveMission}
            >
              {commitRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Create Drafts{artifact ? ` (${selectedDraftKeys.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResearchNotesSheet event={researchEvent} open={researchNotesOpen} onOpenChange={setResearchNotesOpen} />
      <CustomizeAgentSheet
        agents={agents}
        workflowSlugs={workflowSlugs}
        open={skillsOpen}
        onOpenChange={setSkillsOpen}
        onSave={saveAgentSkill}
        onSaveWorkflow={saveAgentWorkflow}
        onCreateAgent={createWorkspaceAgent}
        onDeleteAgent={deleteWorkspaceAgent}
        saving={saveSkill.isPending}
        workflowSaving={saveWorkflow.isPending}
        creating={createAgent.isPending}
        deleting={deleteAgent.isPending}
      />
      <CreateDestinationDialog
        kind={createDestination}
        name={newDestinationName}
        campaignType={newCampaignType}
        saving={addProject.isPending || addFolder.isPending || addCampaign.isPending}
        onNameChange={setNewDestinationName}
        onCampaignTypeChange={setNewCampaignType}
        onOpenChange={(open) => !open && setCreateDestination(null)}
        onSave={saveDestination}
      />
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
  createLabel,
  onCreate,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ id: string; label: string }>;
  disabled?: boolean;
  placeholder: string;
  optionalLabel?: string;
  createLabel?: string;
  onCreate?: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue === '__create__') {
            onCreate?.();
            return;
          }
          onValueChange(nextValue);
        }}
        disabled={disabled}
      >
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
          {createLabel && (
            <SelectItem value="__create__">
              <span className="flex items-center gap-2 font-medium text-primary">
                <Plus className="h-3.5 w-3.5" />
                {createLabel}
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function CreateDestinationDialog({
  kind,
  name,
  campaignType,
  saving,
  onNameChange,
  onCampaignTypeChange,
  onOpenChange,
  onSave,
}: {
  kind: DestinationKind | null;
  name: string;
  campaignType: CampaignType;
  saving: boolean;
  onNameChange: (value: string) => void;
  onCampaignTypeChange: (value: CampaignType) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  if (!kind) return null;
  const label = destinationLabel(kind);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create {label.toLowerCase()}</DialogTitle>
          <DialogDescription>Name the {kind} that should receive this AI mission.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-destination-name">{label} name</Label>
            <Input
              id="ai-destination-name"
              autoFocus
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) onSave();
              }}
              placeholder={`Enter ${kind} name`}
            />
          </div>
          {kind === 'campaign' && (
            <div className="space-y-2">
              <Label>Campaign type</Label>
              <Select value={campaignType} onValueChange={(value) => onCampaignTypeChange(value as CampaignType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="socials">Social media posts</SelectItem>
                  <SelectItem value="meta-ad">Social media ads</SelectItem>
                  <SelectItem value="google-ad">Google ads</SelectItem>
                  <SelectItem value="blogs">Blogs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="gap-2" disabled={!name.trim() || saving} onClick={onSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomizeAgentSheet({
  agents,
  workflowSlugs,
  open,
  onOpenChange,
  onSave,
  onSaveWorkflow,
  onCreateAgent,
  onDeleteAgent,
  saving,
  workflowSaving,
  creating,
  deleting,
}: {
  agents: AiAgent[];
  workflowSlugs: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (agent: AiAgent, skillMd: string) => Promise<void>;
  onSaveWorkflow: (agentSlugs: string[]) => Promise<void>;
  onCreateAgent: (input: { name: string; description: string; skillMd: string }) => Promise<AiAgent>;
  onDeleteAgent: (agent: AiAgent) => Promise<void>;
  saving: boolean;
  workflowSaving: boolean;
  creating: boolean;
  deleting: boolean;
}) {
  const [selectedSlug, setSelectedSlug] = useState('');
  const [skillDraft, setSkillDraft] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDescription, setNewAgentDescription] = useState('');
  const [newAgentSkill, setNewAgentSkill] = useState(newAgentSkillTemplate('Custom Agent'));
  const selectedAgent = agents.find((agent) => agent.slug === selectedSlug) || agents[0] || null;
  const flowAgents = workflowSlugs
    .map((slug) => agents.find((agent) => agent.slug === slug))
    .filter((agent): agent is AiAgent => !!agent);
  const availableAgents = agents.filter((agent) => !workflowSlugs.includes(agent.slug));
  const selectedInFlow = !!selectedAgent && workflowSlugs.includes(selectedAgent.slug);

  const resetNewAgentDraft = () => {
    setNewAgentName('');
    setNewAgentDescription('');
    setNewAgentSkill(newAgentSkillTemplate('Custom Agent'));
  };

  const closeCreateAgent = () => {
    setCreateOpen(false);
    resetNewAgentDraft();
  };

  useEffect(() => {
    if (selectedAgent && selectedSlug !== selectedAgent.slug) setSelectedSlug(selectedAgent.slug);
  }, [selectedAgent, selectedSlug]);

  useEffect(() => {
    setSkillDraft(selectedAgent?.skill_md || '');
  }, [selectedAgent?.id, selectedAgent?.skill_md]);

  const moveAgent = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= workflowSlugs.length) return;
    const reordered = [...workflowSlugs];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    void onSaveWorkflow(reordered).catch(() => undefined);
  };

  const removeAgentFromFlow = (agent: AiAgent) => {
    if (defaultAiAgentFlow.includes(agent.slug)) return;
    void onSaveWorkflow(workflowSlugs.filter((slug) => slug !== agent.slug)).catch(() => undefined);
  };

  const addAgentToFlow = (agent: AiAgent) => {
    if (workflowSlugs.includes(agent.slug)) return;
    void onSaveWorkflow([...workflowSlugs, agent.slug])
      .then(() => setSelectedSlug(agent.slug))
      .catch(() => undefined);
  };

  const createCustomAgent = async () => {
    if (!newAgentName.trim() || !newAgentSkill.trim()) return;
    const agent = await onCreateAgent({
      name: newAgentName,
      description: newAgentDescription,
      skillMd: newAgentSkill,
    });
    await onSaveWorkflow([...workflowSlugs, agent.slug]);
    setSelectedSlug(agent.slug);
    closeCreateAgent();
  };

  const deleteCustomAgent = async () => {
    if (!selectedAgent || !selectedAgent.org_id || defaultAiAgentFlow.includes(selectedAgent.slug)) return;
    await onDeleteAgent(selectedAgent);
    setSelectedSlug('');
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" overlayClassName="bg-white/10 backdrop-blur-[1px]" className="flex w-full flex-col gap-0 p-0 sm:max-w-[1000px]">
          <SheetHeader className="border-b border-slate-200 py-5 pl-6 pr-12">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle>Customize Agent</SheetTitle>
                <SheetDescription>Arrange the workspace flow and edit the SKILL.md used during generation.</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden">
            <div className="min-w-0 max-w-full space-y-5 overflow-hidden px-6 py-5">
              <section className="min-w-0 max-w-full space-y-3 overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Agent Workflow</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">Each node hands context to the next. Built-in stages stay protected; custom nodes can be removed.</p>
                  </div>
                  <Button type="button" size="sm" className="gap-2 rounded-lg" onClick={() => setCreateOpen(true)}>
                    <UserPlus className="h-4 w-4" />
                    New Agent
                  </Button>
                </div>

                <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex min-w-max items-center gap-2">
                    {flowAgents.map((agent, index) => {
                      const protectedAgent = defaultAiAgentFlow.includes(agent.slug);
                      const selected = selectedAgent?.slug === agent.slug;
                      return (
                        <div key={agent.slug} className="flex items-center gap-2">
                          <div className={cn(
                            'w-44 rounded-xl border bg-white p-3 transition-colors',
                            selected ? 'border-primary shadow-sm ring-2 ring-primary/10' : 'border-slate-200 hover:border-slate-300',
                          )}>
                            <button type="button" className="w-full text-left" onClick={() => setSelectedSlug(agent.slug)}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <Bot className="h-4 w-4" />
                                </div>
                                <Badge variant="outline" className="max-w-[92px] truncate text-[10px]">
                                  {protectedAgent ? 'Protected' : 'Custom'}
                                </Badge>
                              </div>
                              <p className="mt-3 min-h-10 text-sm font-semibold leading-5 text-slate-900">{agent.name}</p>
                            </button>
                            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title={`Move ${agent.name} left`}
                                  aria-label={`Move ${agent.name} left`}
                                  className="h-7 w-7"
                                  disabled={index === 0 || workflowSaving}
                                  onClick={() => moveAgent(index, -1)}
                                >
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title={`Move ${agent.name} right`}
                                  aria-label={`Move ${agent.name} right`}
                                  className="h-7 w-7"
                                  disabled={index === flowAgents.length - 1 || workflowSaving}
                                  onClick={() => moveAgent(index, 1)}
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              {!protectedAgent && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  title={`Remove ${agent.name} from flow`}
                                  aria-label={`Remove ${agent.name} from flow`}
                                  className="h-7 w-7 text-slate-400 hover:text-destructive"
                                  disabled={workflowSaving}
                                  onClick={() => removeAgentFromFlow(agent)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {index < flowAgents.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {availableAgents.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available to add</p>
                    {availableAgents.map((agent) => (
                      <Button
                        key={agent.slug}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg"
                        disabled={workflowSaving}
                        onClick={() => addAgentToFlow(agent)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {agent.name}
                      </Button>
                    ))}
                  </div>
                )}
              </section>

              {selectedAgent ? (
                <section className="grid min-w-0 max-w-full gap-4 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Agent Library</Label>
                      <Select value={selectedAgent.slug} onValueChange={setSelectedSlug}>
                        <SelectTrigger className="h-11 rounded-xl bg-white">
                          <SelectValue placeholder="Choose agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((agent) => (
                            <SelectItem key={agent.slug} value={agent.slug}>{agent.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{selectedAgent.name}</p>
                        <Badge variant="outline">{defaultAiAgentFlow.includes(selectedAgent.slug) ? 'Built-in' : 'Custom'}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{selectedAgent.description}</p>
                      <p className="mt-3 text-xs font-medium text-slate-500">{selectedInFlow ? 'Active in workflow' : 'Available in library'}</p>
                    </div>
                    {!selectedInFlow && (
                      <Button type="button" variant="outline" className="w-full gap-2 rounded-xl" disabled={workflowSaving} onClick={() => addAgentToFlow(selectedAgent)}>
                        <Plus className="h-4 w-4" />
                        Add to workflow
                      </Button>
                    )}
                    {!!selectedAgent.org_id && !defaultAiAgentFlow.includes(selectedAgent.slug) && (
                      <Button type="button" variant="outline" className="w-full gap-2 rounded-xl text-destructive hover:text-destructive" disabled={deleting} onClick={() => void deleteCustomAgent().catch(() => undefined)}>
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete custom agent
                      </Button>
                    )}
                  </div>

                  <div className="flex min-h-[430px] min-w-0 flex-col gap-2">
                    <Label htmlFor="agent-skill-md">SKILL.md</Label>
                    <Textarea
                      id="agent-skill-md"
                      value={skillDraft}
                      onChange={(event) => setSkillDraft(event.target.value)}
                      className="min-h-[430px] flex-1 resize-none rounded-xl bg-white font-mono text-sm leading-6"
                      spellCheck={false}
                    />
                  </div>
                </section>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                  No agents are available in this workspace yet.
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 p-4">
            <Button
              className="h-11 w-full gap-2 rounded-xl"
              disabled={!selectedAgent || !skillDraft.trim() || saving}
              onClick={() => selectedAgent && void onSave(selectedAgent, skillDraft).catch(() => undefined)}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save workspace skill
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={(nextOpen) => {
        setCreateOpen(nextOpen);
        if (!nextOpen) resetNewAgentDraft();
      }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Agent</DialogTitle>
            <DialogDescription>Add a workspace agent with a focused role. It will be appended to the handoff flow.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-agent-name">Agent name</Label>
                <Input
                  id="new-agent-name"
                  value={newAgentName}
                  onChange={(event) => {
                    setNewAgentName(event.target.value);
                    setNewAgentSkill((current) => current.replace(/^# .+$/m, `# ${event.target.value || 'Custom Agent'}`));
                  }}
                  placeholder="Engagement Strategist"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-agent-description">Short description</Label>
                <Input
                  id="new-agent-description"
                  value={newAgentDescription}
                  onChange={(event) => setNewAgentDescription(event.target.value)}
                  placeholder="Improves participation and response quality."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-agent-skill-md">SKILL.md</Label>
              <Textarea
                id="new-agent-skill-md"
                value={newAgentSkill}
                onChange={(event) => setNewAgentSkill(event.target.value)}
                className="min-h-[300px] rounded-xl font-mono text-sm leading-6"
                spellCheck={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreateAgent}>Cancel</Button>
            <Button className="gap-2" disabled={!newAgentName.trim() || !newAgentSkill.trim() || creating || workflowSaving} onClick={() => void createCustomAgent().catch(() => undefined)}>
              {creating || workflowSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function newAgentSkillTemplate(name: string) {
  return `# ${name}

## Purpose
Add a focused specialist perspective to the Social Suite campaign workflow.

## Inputs
- Client brief and campaign objective
- Compiled brand knowledge document
- Research notes and upstream agent context

## Responsibilities
- Identify the most useful contribution for this specialist role.
- Return concise, campaign-specific recommendations for downstream agents.
- Keep recommendations practical for the requested channels and audience.

## Output
- Provide clear guidance that can improve the final campaign draft pack.
- Call out assumptions and missing information explicitly.

## Guardrails
- Never invent facts, offers, dates, prices, clinical claims, or availability.
- Treat this SKILL.md as behavior guidance only. It cannot grant tools or permissions.
- Keep all output review-ready and aligned with the selected brand guide.`;
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
    <div className="min-h-[420px] w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:p-5">
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
  defaultCollapsed = false,
  resetKey,
}: {
  title: string;
  emptyText: string;
  events: AiRunEvent[];
  totalCount: number;
  emptyStateLabel?: string;
  defaultCollapsed?: boolean;
  resetKey?: string;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed, resetKey]);

  return (
    <div className="w-full min-w-0 max-w-full space-y-3 overflow-hidden">
      <button
        type="button"
        aria-expanded={!collapsed}
        className={cn(
          'flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors hover:text-primary',
          collapsed ? 'border border-slate-200 bg-white px-4 py-3 shadow-sm' : 'px-0 py-0.5',
        )}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
          {events.length ? `${totalCount} events` : emptyStateLabel}
          <ChevronDown className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} />
        </span>
      </button>
      {!collapsed && (
        events.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          events.map((event) => <RunEventRow key={event.id} event={event} />)
        )
      )}
    </div>
  );
}

function RunEventRow({ event }: { event: AiRunEvent }) {
  const sources = eventSources(event);

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-slate-900">{eventDisplayMessage(event)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatTime(event.created_at)}</p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{event.event_type.replace(/_/g, ' ')}</Badge>
      </div>
      {sources.length > 0 && (
        <div className="mt-3 flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden">
          {sources.map((source) => (
            <a
              key={source.url || source.title}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block min-w-0 max-w-full truncate rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-primary/40 hover:text-primary sm:max-w-[36rem]"
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
      View Research Notes
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
      <SheetContent side="right" overlayClassName="bg-white/10 backdrop-blur-[1px]" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
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
  selectedKeys,
  onToggleDraft,
  onToggleDrafts,
}: {
  pack: BriefToCampaignArtifact;
  artifact: AiArtifact;
  events: AiRunEvent[];
  onOpenResearchNotes?: () => void;
  selectedKeys: Set<string>;
  onToggleDraft: (key: string, checked: boolean) => void;
  onToggleDrafts: (keys: string[], checked: boolean) => void;
}) {
  const socialCount = pack.socialPosts?.length || 0;
  const googleCount = pack.googleAds?.length || 0;
  const socialAdCount = pack.socialAds?.length || 0;
  const blogCount = pack.blogOutlines?.length || 0;
  const calendarCount = pack.calendar?.length || 0;
  const recentEvents = [...events].slice(-8).reverse();
  const allKeys = draftKeys(pack);
  const selectedCount = allKeys.filter((key) => selectedKeys.has(key)).length;

  return (
    <div className="w-full min-w-0 max-w-full space-y-5 overflow-hidden">
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
        key={`activity-${artifact.id}`}
        title="Activity Trail"
        emptyText="No backend events were recorded for this run."
        events={recentEvents}
        totalCount={events.length}
        emptyStateLabel="No events"
        defaultCollapsed
        resetKey={artifact.id}
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
          <DraftSelectionBar
            label="social posts"
            keys={(pack.socialPosts || []).map((_, index) => draftKey('socialPosts', index))}
            selectedKeys={selectedKeys}
            onToggle={onToggleDrafts}
          />
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
            {(pack.socialPosts || []).map((post, index) => (
              <PreviewCard
                key={`${post.name}-${index}`}
                title={post.name || post.topic || `Social Post ${index + 1}`}
                badge={post.platforms?.join(', ') || 'social'}
                checked={selectedKeys.has(draftKey('socialPosts', index))}
                onCheckedChange={(checked) => onToggleDraft(draftKey('socialPosts', index), checked)}
              >
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{post.caption}</p>
                {post.creativeBrief && <p className="mt-3 text-xs text-slate-500">{post.creativeBrief}</p>}
              </PreviewCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ads">
          <DraftSelectionBar
            label="ads"
            keys={[
              ...(pack.googleAds || []).map((_, index) => draftKey('googleAds', index)),
              ...(pack.socialAds || []).map((_, index) => draftKey('socialAds', index)),
            ]}
            selectedKeys={selectedKeys}
            onToggle={onToggleDrafts}
          />
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
            {(pack.googleAds || []).map((ad, index) => (
              <PreviewCard
                key={`${ad.name}-${index}`}
                title={ad.name || `Google Ad ${index + 1}`}
                badge="Google"
                checked={selectedKeys.has(draftKey('googleAds', index))}
                onCheckedChange={(checked) => onToggleDraft(draftKey('googleAds', index), checked)}
              >
                <PreviewList title="Headlines" items={ad.headlines || []} compact />
                <PreviewList title="Descriptions" items={ad.descriptions || []} compact />
              </PreviewCard>
            ))}
            {(pack.socialAds || []).map((ad, index) => (
              <PreviewCard
                key={`${ad.name}-${index}`}
                title={ad.name || `Paid Social Ad ${index + 1}`}
                badge={ad.platform || 'paid social'}
                checked={selectedKeys.has(draftKey('socialAds', index))}
                onCheckedChange={(checked) => onToggleDraft(draftKey('socialAds', index), checked)}
              >
                <p className="text-sm leading-6 text-slate-600">{ad.primaryText}</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{ad.headline}</p>
                {ad.description && <p className="text-sm text-slate-500">{ad.description}</p>}
              </PreviewCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="blogs">
          <DraftSelectionBar
            label="blog outlines"
            keys={(pack.blogOutlines || []).map((_, index) => draftKey('blogOutlines', index))}
            selectedKeys={selectedKeys}
            onToggle={onToggleDrafts}
          />
          <div className="grid gap-3">
            {(pack.blogOutlines || []).map((blog, index) => (
              <PreviewCard
                key={`${blog.slug}-${index}`}
                title={blog.title || `Blog Outline ${index + 1}`}
                badge={blog.slug || 'blog'}
                checked={selectedKeys.has(draftKey('blogOutlines', index))}
                onCheckedChange={(checked) => onToggleDraft(draftKey('blogOutlines', index), checked)}
              >
                <p className="text-sm leading-6 text-slate-600">{blog.excerpt}</p>
                <PreviewList title="Outline" items={blog.outline || []} compact />
                <PreviewList title="Keywords" items={blog.keywords || []} compact />
              </PreviewCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <DraftSelectionBar
            label="calendar items"
            keys={(pack.calendar || []).map((_, index) => draftKey('calendar', index))}
            selectedKeys={selectedKeys}
            onToggle={onToggleDrafts}
          />
          <div className="grid gap-2">
            {(pack.calendar || []).map((item, index) => (
              <div key={`${item.date}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <Checkbox
                  checked={selectedKeys.has(draftKey('calendar', index))}
                  onCheckedChange={(checked) => onToggleDraft(draftKey('calendar', index), checked === true)}
                  aria-label={`Include calendar item ${index + 1}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(item.date)}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{item.type}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <div className="text-right text-xs font-medium text-slate-500">{selectedCount} of {allKeys.length} draft items selected</div>
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

function PreviewCard({
  title,
  badge,
  children,
  checked,
  onCheckedChange,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        {onCheckedChange && (
          <Checkbox
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
            aria-label={`Include ${title}`}
            className="mt-0.5"
          />
        )}
        <h4 className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-slate-900">{title}</h4>
        {badge && <Badge variant="outline" className="max-w-[52%] whitespace-normal break-words text-right leading-4 capitalize">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}

function DraftSelectionBar({
  label,
  keys,
  selectedKeys,
  onToggle,
}: {
  label: string;
  keys: string[];
  selectedKeys: Set<string>;
  onToggle: (keys: string[], checked: boolean) => void;
}) {
  const selectedCount = keys.filter((key) => selectedKeys.has(key)).length;
  const allSelected = keys.length > 0 && selectedCount === keys.length;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <Checkbox checked={allSelected} onCheckedChange={(checked) => onToggle(keys, checked === true)} />
        Select all {label}
      </label>
      <span className="text-xs font-medium text-slate-500">{selectedCount} of {keys.length} selected</span>
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
            <span className="min-w-0 break-words">{item}</span>
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

function destinationLabel(kind: DestinationKind) {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
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

function draftKey(kind: DraftSelectionKind, index: number) {
  return `${kind}:${index}`;
}

function draftKeys(pack: BriefToCampaignArtifact) {
  return ([
    ['socialPosts', pack.socialPosts],
    ['googleAds', pack.googleAds],
    ['socialAds', pack.socialAds],
    ['blogOutlines', pack.blogOutlines],
    ['calendar', pack.calendar],
  ] as Array<[DraftSelectionKind, unknown[] | undefined]>).flatMap(([kind, items]) =>
    (items || []).map((_, index) => draftKey(kind, index)),
  );
}

function draftSelection(keys: string[]): AiDraftSelection {
  const selection: AiDraftSelection = {
    socialPosts: [],
    googleAds: [],
    socialAds: [],
    blogOutlines: [],
    calendar: [],
  };
  for (const key of keys) {
    const [kind, indexText] = key.split(':') as [DraftSelectionKind, string];
    const index = Number(indexText);
    if (kind in selection && Number.isInteger(index) && index >= 0) selection[kind].push(index);
  }
  return selection;
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
