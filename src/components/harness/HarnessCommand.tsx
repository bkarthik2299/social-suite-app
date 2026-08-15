import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  History,
  Loader2,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  WandSparkles,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { slugify } from '@/lib/routes';
import {
  approveHarnessRun,
  cancelHarnessRun,
  createHarnessRun,
  estimateHarnessCredits,
  executeHarnessRun,
  harnessOutputLabels,
  listHarnessRuns,
  parseHarnessCommand,
  refreshHarnessRun,
  startHarnessExecution,
  statusLabel,
} from '@/services/harness';
import type { HarnessOutput, HarnessPermissionMode, HarnessPlan, HarnessRun, HarnessRunStep } from '@/types/harness';

type View = 'input' | 'preview' | 'confirm' | 'running' | 'history';
type RecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<RecognitionResultLike> };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionConstructor = new () => RecognitionLike;

const suggestions = [
  'Create campaign from website',
  'Build a brand guide',
  'Turn a brief into drafts',
  'Resume last mission',
];

export function HarnessCommand() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('input');
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<HarnessPlan | null>(null);
  const [permissionMode, setPermissionMode] = useState<HarnessPermissionMode>('ask');
  const [parsing, setParsing] = useState(false);
  const [answer, setAnswer] = useState('');
  const [activeRun, setActiveRun] = useState<HarnessRun | null>(null);
  const [history, setHistory] = useState<HarnessRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const refreshHistory = useCallback(async () => {
    if (!organization?.id) return;
    try {
      setHistory(await listHarnessRuns(organization.id));
    } catch {
      // Mission history is secondary to the active command flow.
    }
  }, [organization?.id]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
      queryClient.invalidateQueries({ queryKey: ['all_folders'] }),
      queryClient.invalidateQueries({ queryKey: ['folders'] }),
      queryClient.invalidateQueries({ queryKey: ['brand_guides'] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOpen((current) => !current);
        setView('input');
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshHistory();
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open, refreshHistory]);

  useEffect(() => {
    if (open && view === 'history') void refreshHistory();
  }, [open, refreshHistory, view]);

  useEffect(() => {
    if (!activeRun || activeRun.status !== 'running') return;
    const check = async () => {
      try {
        const next = await refreshHarnessRun(activeRun);
        if (next.updated_at !== activeRun.updated_at || next.status !== activeRun.status) {
          setActiveRun(next);
          if (next.status === 'needs_approval' || next.status === 'completed' || next.status === 'failed') void refreshHistory();
        }
      } catch {
        // The next polling pass will retry without disrupting the user's panel.
      }
    };
    const timer = window.setInterval(() => void check(), 2500);
    void check();
    return () => window.clearInterval(timer);
  }, [activeRun, refreshHistory]);

  const submit = async () => {
    const command = prompt.trim();
    if (!command || parsing) return;
    setParsing(true);
    setError(null);
    try {
      const parsed = await parseHarnessCommand(command, { path: window.location.pathname, organizationId: organization?.id });
      setPlan(parsed);
      setAnswer('');
      setView('preview');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'I could not understand that request.');
    } finally {
      setParsing(false);
    }
  };

  const answerQuestion = (value = answer) => {
    if (!plan || !plan.missingQuestions.length || !value.trim()) return;
    const [question, ...remaining] = plan.missingQuestions;
    let next: HarnessPlan = { ...plan, missingQuestions: remaining };
    if (question.id === 'projectName') next = { ...next, projectName: value.trim() };
    else if (question.id === 'targetAudience') next = { ...next, targetAudience: value.trim() };
    else if (question.id === 'requestedOutputs') {
      const labels: Record<string, HarnessOutput> = {
        'Social posts': 'socialPosts',
        'Google ads': 'googleAds',
        'Meta ads': 'socialAds',
        'Blog ideas': 'blogOutlines',
      };
      next = { ...next, requestedOutputs: [labels[value] || 'socialPosts'] };
    }
    setPlan(next);
    setAnswer('');
  };

  const start = async () => {
    if (!plan || !organization?.id || !user?.id) return;
    setError(null);
    setView('running');
    try {
      const run = await createHarnessRun({
        orgId: organization.id,
        userId: user.id,
        prompt,
        plan,
        permissionMode,
      });
      setActiveRun(run);
      try {
        await startHarnessExecution(run.id);
        setActiveRun({ ...run, status: 'running' });
      } catch (executionError) {
        const message = executionError instanceof Error ? executionError.message : '';
        if (!/not found|failed to send|non-2xx|404|harness-execute-run/i.test(message)) throw executionError;
        await executeHarnessRun(run, setActiveRun);
      }
      void refreshWorkspace();
      void refreshHistory();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'The mission could not be started.');
      void refreshWorkspace();
      void refreshHistory();
    }
  };

  const retry = async () => {
    if (!activeRun) return;
    setError(null);
    try {
      try {
        await startHarnessExecution(activeRun.id);
        setActiveRun({ ...activeRun, status: 'running', error: null });
      } catch (executionError) {
        const message = executionError instanceof Error ? executionError.message : '';
        if (!/not found|failed to send|non-2xx|404|harness-execute-run/i.test(message)) throw executionError;
        await executeHarnessRun(activeRun, setActiveRun);
      }
      void refreshWorkspace();
      void refreshHistory();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Retry failed.');
      void refreshHistory();
    }
  };

  const approve = async () => {
    if (!activeRun) return;
    setError(null);
    const next = await approveHarnessRun(activeRun);
    setActiveRun(next);
    void refreshWorkspace();
    void refreshHistory();
  };

  const cancel = async () => {
    if (!activeRun) return;
    const next = await cancelHarnessRun(activeRun);
    setActiveRun(next);
    void refreshHistory();
  };

  const startVoice = () => {
    const recognitionConstructor = (window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;

    if (!recognitionConstructor) {
      setError('Voice input is not supported in this browser. You can still type your request.');
      return;
    }
    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) setPrompt((current) => `${current}${current.trim() ? ' ' : ''}${finalText.trim()}`);
      if (interimText) textareaRef.current?.setAttribute('placeholder', interimText);
    };
    recognition.onend = () => {
      setListening(false);
      textareaRef.current?.setAttribute('placeholder', 'Create a project, campaign, brand guide, or drafts…');
    };
    recognition.onerror = recognition.onend;
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopVoice = () => recognitionRef.current?.stop();

  const openRun = (run: HarnessRun) => {
    setActiveRun(run);
    setPlan(run.parsed_plan);
    setPrompt(run.user_prompt);
    setPermissionMode(run.permission_mode);
    setView('running');
  };

  const reset = () => {
    setView('input');
    setPlan(null);
    setActiveRun(null);
    setError(null);
    setAnswer('');
    window.setTimeout(() => textareaRef.current?.focus(), 80);
  };

  const completedSteps = activeRun?.harness_run_steps?.filter((step) => step.status === 'completed' || step.status === 'skipped').length || 0;
  const totalSteps = activeRun?.harness_run_steps?.length || plan?.actions.length || 0;
  const progress = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const activeLabel = activeRun?.parsed_plan.projectName || 'Social Suite mission';

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open Social Suite command harness"
        onClick={() => setOpen(true)}
        className="group fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2.5 rounded-full border border-blue-100/80 bg-white/95 px-3.5 text-sm font-semibold text-slate-700 shadow-[0_18px_55px_-22px_rgba(37,99,235,0.52)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_65px_-24px_rgba(37,99,235,0.65)]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
          {activeRun?.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
        </span>
        <span>{activeRun?.status === 'running' ? `${activeLabel}: ${completedSteps}/${totalSteps}` : 'Ask Social Suite…'}</span>
        <Mic className="h-3.5 w-3.5 text-slate-400" />
        <kbd className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 sm:inline">Ctrl J</kbd>
      </button>
    );
  }

  return (
    <section
      aria-label="Social Suite command harness"
      className="fixed bottom-5 right-5 z-50 flex max-h-[min(760px,calc(100vh-2.5rem))] w-[min(440px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-white/95 shadow-[0_32px_90px_-35px_rgba(30,64,175,0.55),0_18px_42px_-28px_rgba(15,23,42,0.35)] backdrop-blur-2xl"
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Social Suite Harness</p>
            <p className="text-[11px] text-slate-500">Tell the app what to get done</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-500" aria-label="Mission history" onClick={() => setView('history')}>
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-500" aria-label="Minimize" onClick={() => setOpen(false)}>
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-500" aria-label="Close" onClick={() => { setOpen(false); reset(); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {view === 'input' ? (
        <div className="p-4">
          <div className="mb-4 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
            <p className="text-base font-semibold text-slate-900">What do you want to get done?</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Create workspaces, research brands, and turn briefs into campaign drafts.</p>
          </div>
          <CommandComposer
            prompt={prompt}
            setPrompt={setPrompt}
            textareaRef={textareaRef}
            parsing={parsing}
            listening={listening}
            onSubmit={submit}
            onStartVoice={startVoice}
            onStopVoice={stopVoice}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left text-xs font-medium text-slate-600 transition hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700">
                {suggestion}
              </button>
            ))}
          </div>
          {error ? <ErrorMessage message={error} /> : null}
        </div>
      ) : null}

      {view === 'preview' && plan ? (
        <ScrollArea className="max-h-[650px]">
          <div className="p-4">
            <StepBack onClick={() => setView('input')} label="Edit request" />
            <p className="mt-4 text-sm font-semibold text-slate-900">Here’s what I understood</p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70">
              <UnderstandingRow label="Project" value={plan.projectName || 'Not provided'} />
              <UnderstandingRow label="Website" value={plan.websiteUrl?.replace(/^https?:\/\//, '') || 'Not provided'} />
              <UnderstandingRow label="Goal" value={plan.campaignBrief || plan.intent.replaceAll('_', ' ')} />
              <UnderstandingRow label="Audience" value={plan.targetAudience || 'From brief / brand research'} />
              <UnderstandingRow label="Outputs" value={plan.requestedOutputs.map((item) => harnessOutputLabels[item]).join(', ') || 'Not selected'} last />
            </div>

            {plan.missingQuestions.length ? (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">One essential question</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{plan.missingQuestions[0].question}</p>
                {plan.missingQuestions[0].options.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plan.missingQuestions[0].options.map((option) => (
                      <button key={option} type="button" onClick={() => answerQuestion(option)} className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-amber-300">
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <input value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') answerQuestion(); }} placeholder="Type your answer" className="h-10 min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                  <Button className="h-10 rounded-xl" disabled={!answer.trim()} onClick={() => answerQuestion()}>Continue</Button>
                </div>
              </div>
            ) : (
              <Button className="mt-4 h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => setView('confirm')}>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </ScrollArea>
      ) : null}

      {view === 'confirm' && plan ? (
        <div className="p-4">
          <StepBack onClick={() => setView('preview')} label="Review understanding" />
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-sm font-semibold text-slate-900">Ready to start {plan.projectName || 'this mission'}?</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">This will {plan.actions.map((action) => action.replaceAll('_', ' ')).join(', ')}. Every created object and retry is recorded in Mission History.</p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Permission mode</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ModeButton active={permissionMode === 'ask'} title="Ask mode" detail="Stop before drafts are committed" onClick={() => setPermissionMode('ask')} />
              <ModeButton active={permissionMode === 'autopilot'} title="Autopilot" detail="Create drafts when the pack is ready" onClick={() => setPermissionMode('autopilot')} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 text-xs">
            <span className="text-slate-500">Estimated credits</span>
            <span className="font-semibold text-slate-900">{estimateHarnessCredits(plan)}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={reset}>Cancel</Button>
            <Button className="h-11 flex-[1.5] rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={start}>
              <Sparkles className="mr-2 h-4 w-4" /> Start mission
            </Button>
          </div>
        </div>
      ) : null}

      {view === 'running' && activeRun ? (
        <ScrollArea className="max-h-[650px]">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{activeLabel} Campaign Setup</p>
                <p className="mt-1 text-xs text-slate-500">{statusLabel(activeRun.status)} · {completedSteps}/{totalSteps} steps</p>
              </div>
              <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide', activeRun.permission_mode === 'autopilot' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700')}>
                {activeRun.permission_mode}
              </span>
            </div>
            <Progress value={activeRun.status === 'needs_approval' ? Math.max(progress, 86) : activeRun.status === 'completed' ? 100 : progress} className="mt-4 h-1.5" />

            {activeRun.status === 'needs_approval' ? <ApprovalCard run={activeRun} onApprove={approve} /> : null}
            {activeRun.status === 'completed' ? <CompletedCard run={activeRun} onOpenProject={() => activeRun.project_id && navigate(`/projects/${slugify(activeRun.parsed_plan.projectName)}/folders`)} onOpenBrand={() => activeRun.brand_guide_id && navigate(`/tools/brand-guide/${slugify(activeRun.parsed_plan.projectName)}`)} /> : null}

            <div className="mt-4 space-y-1.5">
              {(activeRun.harness_run_steps || []).map((step) => <TimelineStep key={step.id} step={step} />)}
            </div>

            {activeRun.error || error ? <ErrorMessage message={activeRun.error || error || ''} /> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {activeRun.status === 'failed' ? <Button className="rounded-xl" onClick={retry}><RotateCcw className="mr-2 h-4 w-4" />Retry failed step</Button> : null}
              {activeRun.status === 'failed' && activeRun.project_id ? <Button variant="outline" className="rounded-xl" onClick={() => navigate(`/projects/${slugify(activeRun.parsed_plan.projectName)}/folders`)}>Open project</Button> : null}
              {activeRun.status === 'failed' && activeRun.brand_guide_id ? <Button variant="outline" className="rounded-xl" onClick={() => navigate(`/tools/brand-guide/${slugify(activeRun.parsed_plan.projectName)}`)}>Brand guide</Button> : null}
              {activeRun.status === 'running' ? <Button variant="outline" className="rounded-xl text-slate-600" onClick={cancel}><Square className="mr-2 h-3.5 w-3.5" />Cancel</Button> : null}
              {activeRun.status === 'needs_approval' && activeRun.ai_run_id ? (
                <Button variant="outline" className="rounded-xl" onClick={() => window.dispatchEvent(new CustomEvent('socialsuite:open-ai-run', { detail: { runId: activeRun.ai_run_id } }))}>
                  Review drafts <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
              ) : null}
              {['completed', 'failed', 'canceled'].includes(activeRun.status) ? <Button variant="outline" className="rounded-xl" onClick={reset}>New mission</Button> : null}
            </div>
          </div>
        </ScrollArea>
      ) : null}

      {view === 'history' ? (
        <ScrollArea className="max-h-[650px]">
          <div className="p-4">
            <StepBack onClick={() => setView(activeRun ? 'running' : 'input')} label="Back" />
            <div className="mt-4 flex items-center justify-between">
              <div><p className="text-sm font-semibold text-slate-900">Mission History</p><p className="mt-1 text-xs text-slate-500">Requests, progress, and created workspaces</p></div>
              <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => void refreshHistory()}><RotateCcw className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="mt-3 space-y-2">
              {history.length ? history.map((run) => (
                <button key={run.id} type="button" onClick={() => openRun(run)} className="w-full rounded-2xl border border-slate-100 bg-slate-50/60 p-3 text-left transition hover:border-blue-100 hover:bg-blue-50/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{run.parsed_plan.projectName ? `${run.parsed_plan.projectName} campaign workspace` : run.parsed_plan.intent.replaceAll('_', ' ')}</p>
                    <RunStatus status={run.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{run.user_prompt}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{new Date(run.created_at).toLocaleString()}</p>
                </button>
              )) : <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-500">Your completed and active missions will appear here.</div>}
            </div>
          </div>
        </ScrollArea>
      ) : null}
    </section>
  );
}

function CommandComposer({ prompt, setPrompt, textareaRef, parsing, listening, onSubmit, onStartVoice, onStopVoice }: {
  prompt: string;
  setPrompt: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  parsing: boolean;
  listening: boolean;
  onSubmit: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)] focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
      <Textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} placeholder="Create a project, campaign, brand guide, or drafts…" className="min-h-[96px] resize-none border-0 p-2 text-sm leading-6 shadow-none focus-visible:ring-0" />
      <div className="flex items-center justify-between px-1 pb-1">
        <Button type="button" variant="ghost" size="icon" aria-label={listening ? 'Stop voice input' : 'Start voice input'} onClick={listening ? onStopVoice : onStartVoice} className={cn('h-8 w-8 rounded-full', listening ? 'bg-red-50 text-red-600' : 'text-slate-500')}>
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button type="button" size="icon" aria-label="Send command" disabled={!prompt.trim() || parsing} onClick={onSubmit} className="h-9 w-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function UnderstandingRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <div className={cn('grid grid-cols-[78px_1fr] gap-3 px-3.5 py-3 text-xs', !last && 'border-b border-slate-100')}><span className="font-medium text-slate-500">{label}</span><span className="font-medium leading-5 text-slate-800">{value}</span></div>;
}

function StepBack({ onClick, label }: { onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3.5 w-3.5" />{label}</button>;
}

function ModeButton({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('rounded-xl border p-3 text-left transition', active ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-100 hover:border-slate-200')}><span className="flex items-center justify-between text-xs font-semibold text-slate-800">{title}{active ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{detail}</span></button>;
}

function TimelineStep({ step }: { step: HarnessRunStep }) {
  const icon = step.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    : step.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      : step.status === 'failed' ? <XCircle className="h-4 w-4 text-red-500" />
        : <Circle className="h-4 w-4 text-slate-300" />;
  return <div className={cn('flex gap-3 rounded-xl px-3 py-2.5', step.status === 'running' && 'bg-blue-50/70', step.status === 'failed' && 'bg-red-50/70')}><span className="mt-0.5 shrink-0">{icon}</span><div className="min-w-0"><p className={cn('text-xs font-medium', step.status === 'queued' ? 'text-slate-400' : 'text-slate-800')}>{step.label}</p>{step.detail || step.error ? <p className={cn('mt-0.5 text-[11px] leading-4', step.error ? 'text-red-600' : 'text-slate-500')}>{step.error || step.detail}</p> : null}</div></div>;
}

function ApprovalCard({ run, onApprove }: { run: HarnessRun; onApprove: () => void }) {
  const generated = run.result.generated as Record<string, number> | undefined;
  return <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><p className="text-sm font-semibold text-slate-900">Campaign pack ready</p></div>{generated ? <p className="mt-2 text-xs leading-5 text-slate-600">Generated {generated.socialPosts || 0} social posts, {generated.googleAds || 0} Google ads, {generated.socialAds || 0} Meta ads, {generated.blogOutlines || 0} blog outlines, and {generated.calendarItems || 0} calendar items.</p> : null}<Button className="mt-3 h-9 w-full rounded-xl bg-emerald-600 text-white hover:bg-emerald-700" onClick={onApprove}>Create all drafts</Button></div>;
}

function CompletedCard({ run, onOpenProject, onOpenBrand }: { run: HarnessRun; onOpenProject: () => void; onOpenBrand: () => void }) {
  const inserted = typeof run.result.contentCount === 'number' ? run.result.contentCount : null;
  return <div className="mt-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4"><p className="text-sm font-semibold text-slate-900">{run.parsed_plan.projectName || 'Your'} workspace is ready</p><p className="mt-1 text-xs text-slate-600">{inserted !== null ? `${inserted} drafts were created and saved.` : 'The mission completed successfully.'}</p><div className="mt-3 flex gap-2"><Button size="sm" className="rounded-lg" onClick={onOpenProject}>Open project</Button>{run.brand_guide_id ? <Button size="sm" variant="outline" className="rounded-lg" onClick={onOpenBrand}>Brand guide</Button> : null}</div></div>;
}

function RunStatus({ status }: { status: HarnessRun['status'] }) {
  const active = status === 'running' || status === 'queued';
  return <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold', status === 'completed' ? 'bg-emerald-50 text-emerald-700' : status === 'failed' ? 'bg-red-50 text-red-700' : status === 'needs_approval' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700')}>{active ? <Clock3 className="h-3 w-3" /> : null}{statusLabel(status)}</span>;
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message}</div>;
}
