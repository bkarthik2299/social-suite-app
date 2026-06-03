import { useEffect, useMemo, useState } from 'react';
import {
    BadgeInfo,
    Copy,
    Download,
    ExternalLink,
    FileText,
    Globe,
    Image as ImageIcon,
    Link2,
    Mic2,
    Palette,
    Plus,
    RefreshCw,
    Save,
    Shapes,
    Sparkles,
    Trash2,
    Type,
} from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import {
    BrandColor,
    BrandFont,
    BrandGuide,
    BrandLogo,
    BrandLogoRule,
    BrandMoodImage,
    useBrandGuide,
    useProjects,
} from '@/hooks/useDatabase';
import { useBrandKnowledge, useBrandResearch } from '@/hooks/useAI';
import { cn } from '@/lib/utils';

type ToneSpectrum = {
    formality?: number;
    humor?: number;
    enthusiasm?: number;
};

type TypeScale = {
    h1?: string;
    h2?: string;
    h3?: string;
    body?: string;
    caption?: string;
    button?: string;
};

type DeleteConfirm = {
    title: string;
    description: string;
    action: () => void;
};

const sections = [
    { id: 'identity', label: 'Brand Identity', icon: BadgeInfo },
    { id: 'knowledge', label: 'Knowledge Base', icon: FileText },
    { id: 'social', label: 'Social Links', icon: Link2 },
    { id: 'logos', label: 'Logos', icon: Shapes },
    { id: 'colors', label: 'Colors', icon: Palette },
    { id: 'typography', label: 'Typography', icon: Type },
    { id: 'voice', label: 'Voice & Tone', icon: Mic2 },
];

const colorRoles: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'neutral', 'background'];
const fontCategories: BrandFont['category'][] = ['heading', 'body', 'accent', 'code'];
const logoVariants: BrandLogo['variant'][] = ['primary', 'secondary', 'icon', 'monochrome', 'reversed'];
const logoFormats: NonNullable<BrandLogo['format']>[] = ['svg', 'png', 'jpg', 'webp'];

const socialPlatforms = [
    { id: 'instagram', label: 'Instagram', placeholder: 'instagram.com/brand' },
    { id: 'facebook', label: 'Facebook', placeholder: 'facebook.com/brand' },
    { id: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/company/brand' },
    { id: 'x', label: 'X / Twitter', placeholder: 'x.com/brand' },
    { id: 'tiktok', label: 'TikTok', placeholder: 'tiktok.com/@brand' },
    { id: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@brand' },
    { id: 'pinterest', label: 'Pinterest', placeholder: 'pinterest.com/brand' },
];

const emptyColorForm: Omit<BrandColor, 'id' | 'created_at'> = {
    guide_id: '',
    name: '',
    role: 'primary',
    hex: '#2563EB',
    rgb: '37, 99, 235',
    hsl: '217, 91%, 60%',
    sort_order: 0,
};

const emptyFontForm: Omit<BrandFont, 'id' | 'created_at'> = {
    guide_id: '',
    font_family: 'Inter',
    weight: '400, 500, 600, 700',
    category: 'body',
    source_url: '',
    license: '',
    type_scale: {
        h1: '48px',
        h2: '36px',
        h3: '28px',
        body: '16px',
        caption: '12px',
        button: '14px',
    },
    sort_order: 0,
};

const emptyLogoForm: Omit<BrandLogo, 'id' | 'created_at'> = {
    guide_id: '',
    label: '',
    variant: 'primary',
    file_url: '',
    format: 'svg',
    dimensions: '',
    sort_order: 0,
};

const emptyMoodImageForm: Omit<BrandMoodImage, 'id' | 'created_at'> = {
    guide_id: '',
    image_url: '',
    caption: '',
    sort_order: 0,
};

export default function BrandGuidePage() {
    const { toast } = useToast();
    const { data: projects = [], isLoading: projectsLoading } = useProjects();
    const [selectedGuideId, setSelectedGuideId] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [newGuideName, setNewGuideName] = useState('');
    const [newGuideProjectId, setNewGuideProjectId] = useState('none');
    const [openSections, setOpenSections] = useState<string[]>(['identity']);
    const [activeSection, setActiveSection] = useState(sections[0].id);
    const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);

    const {
        guides,
        guide,
        colors,
        fonts,
        logos,
        logoRules,
        moodImages,
        isLoading,
        createGuide,
        updateGuide,
        addColor,
        updateColor,
        deleteColor,
        addFont,
        updateFont,
        deleteFont,
        addLogo,
        updateLogo,
        deleteLogo,
        addLogoRule,
        updateLogoRule,
        deleteLogoRule,
        addMoodImage,
        updateMoodImage,
        deleteMoodImage,
    } = useBrandGuide(selectedGuideId);

    const [draft, setDraft] = useState<Partial<BrandGuide>>({});
    const [knowledgeDraft, setKnowledgeDraft] = useState('');
    const [moodOpen, setMoodOpen] = useState(false);

    const [colorForm, setColorForm] = useState(emptyColorForm);
    const [logoForm, setLogoForm] = useState(emptyLogoForm);
    const [moodImageForm, setMoodImageForm] = useState(emptyMoodImageForm);

    useEffect(() => {
        if (!selectedGuideId && guides.length > 0) {
            setSelectedGuideId(guides[0].id);
        }
    }, [guides, selectedGuideId]);

    useEffect(() => {
        setDraft(guide || {});
    }, [guide?.id]);

    useEffect(() => {
        fonts.forEach((font) => {
            const href = fontHref(font);
            if (!href || document.querySelector(`link[data-brand-font="${href}"]`)) return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.setAttribute('data-brand-font', href);
            document.head.appendChild(link);
        });
    }, [fonts]);

    const guideId = guide?.id || '';
    const hasGuide = !!guideId;
    const {
        document: brandKnowledgeDocument,
        isLoading: knowledgeLoading,
        compileKnowledge,
        updateMarkdown,
    } = useBrandKnowledge(guideId);
    const researchWebsite = useBrandResearch(guideId);

    useEffect(() => {
        setKnowledgeDraft(brandKnowledgeDocument?.markdown || '');
    }, [brandKnowledgeDocument?.id, brandKnowledgeDocument?.markdown]);

    useEffect(() => {
        if (!hasGuide) return;

        const scrollRoot = document.querySelector('main');
        const updateActiveSection = () => {
            const rootTop = scrollRoot?.getBoundingClientRect().top ?? 0;
            const activationLine = rootTop + 96;
            let nextSection = sections[0].id;

            sections.forEach((section) => {
                const element = document.getElementById(section.id);
                if (!element) return;
                if (element.getBoundingClientRect().top <= activationLine) {
                    nextSection = section.id;
                }
            });

            setActiveSection((current) => current === nextSection ? current : nextSection);
        };

        updateActiveSection();
        scrollRoot?.addEventListener('scroll', updateActiveSection, { passive: true });
        window.addEventListener('resize', updateActiveSection);

        return () => {
            scrollRoot?.removeEventListener('scroll', updateActiveSection);
            window.removeEventListener('resize', updateActiveSection);
        };
    }, [hasGuide, openSections]);

    const updateDraft = (field: keyof BrandGuide, value: unknown) => {
        setDraft((current) => ({ ...current, [field]: value }));
    };

    const commitGuideField = (field: keyof BrandGuide) => {
        if (!guide) return;
        const nextValue = draft[field];
        const currentValue = guide[field];
        if (JSON.stringify(nextValue ?? null) === JSON.stringify(currentValue ?? null)) return;
        updateGuide.mutate({ id: guide.id, updates: { [field]: nextValue } as Partial<BrandGuide> });
    };

    const saveGuideValue = (field: keyof BrandGuide, value: unknown) => {
        updateDraft(field, value);
        if (!guide) return;
        updateGuide.mutate({ id: guide.id, updates: { [field]: value } as Partial<BrandGuide> });
    };

    const openCreateGuide = () => {
        setNewGuideName('');
        setNewGuideProjectId('none');
        setCreateOpen(true);
    };

    const createNewGuide = async () => {
        const brandName = newGuideName.trim() || 'Untitled Brand';
        const projectId = newGuideProjectId === 'none' ? null : newGuideProjectId;
        try {
            const created = await createGuide.mutateAsync({ project_id: projectId, brand_name: brandName });
            setSelectedGuideId(created.id);
            setCreateOpen(false);
            toast({ title: 'Brand Guide created', description: `${brandName} is ready for brand details.` });
        } catch (error) {
            toast({ title: 'Could not create Brand Guide', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const scrollToSection = (sectionId: string) => {
        setActiveSection(sectionId);
        setOpenSections((current) => current.includes(sectionId) ? current : [...current, sectionId]);
        requestAnimationFrame(() => {
            document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        window.history.replaceState(null, '', `#${sectionId}`);
    };

    const submitColor = async () => {
        if (!guideId) return;
        const hex = normalizeHex(colorForm.hex);
        const name = colorForm.name.trim() || `Brand Color ${colors.length + 1}`;
        try {
            await addColor.mutateAsync({
                ...colorForm,
                guide_id: guideId,
                name,
                hex,
                rgb: hexToRgbString(hex),
                hsl: hexToHslString(hex),
            });
            setColorForm({ ...emptyColorForm, guide_id: guideId, sort_order: colors.length + 1 });
            toast({ title: 'Color added', description: `${name} was added to the palette.` });
        } catch (error) {
            toast({ title: 'Could not add color', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const submitLogoUrl = async () => {
        if (!guideId || !logoForm.file_url.trim()) return;
        try {
            await addLogo.mutateAsync({
                ...logoForm,
                guide_id: guideId,
                label: logoForm.label.trim() || `Logo ${logos.length + 1}`,
                file_url: logoForm.file_url.trim(),
                variant: 'primary',
                format: logoFormatFromName(logoForm.file_url),
                dimensions: logoForm.dimensions || null,
            });
            setLogoForm({ ...emptyLogoForm, guide_id: guideId, sort_order: logos.length + 1 });
            toast({ title: 'Logo added', description: 'The logo was added to this guide.' });
        } catch (error) {
            toast({ title: 'Could not add logo', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const submitLogoFile = async (file: File | null) => {
        if (!guideId || !file) return;
        try {
            const fileUrl = await fileToDataUrl(file);
            await addLogo.mutateAsync({
                ...emptyLogoForm,
                guide_id: guideId,
                label: logoForm.label.trim() || file.name.replace(/\.[^.]+$/, ''),
                variant: 'primary',
                file_url: fileUrl,
                format: logoFormatFromName(file.name),
                dimensions: logoForm.dimensions || null,
                sort_order: logos.length,
            });
            setLogoForm({ ...emptyLogoForm, guide_id: guideId, sort_order: logos.length + 1 });
            toast({ title: 'Logo uploaded', description: `${file.name} was added to this guide.` });
        } catch (error) {
            toast({ title: 'Could not add logo', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const saveSimpleFont = (category: 'heading' | 'body', fontFamily: string) => {
        const nextFont = fontFamily.trim();
        const existing = fonts.find((font) => font.category === category);
        if (existing) {
            updateFont.mutate({ id: existing.id, updates: { font_family: nextFont, category } });
            return;
        }
        if (!guideId || !nextFont) return;
        addFont.mutate({
            ...emptyFontForm,
            guide_id: guideId,
            font_family: nextFont,
            category,
            weight: null,
            source_url: null,
            license: null,
            type_scale: {},
            sort_order: fonts.length,
        });
    };

    const openMoodSheet = () => {
        setMoodImageForm({ ...emptyMoodImageForm, guide_id: guideId, sort_order: moodImages.length });
        setMoodOpen(true);
    };

    const submitMoodImage = async () => {
        if (!guideId || !moodImageForm.image_url.trim()) return;
        try {
            await addMoodImage.mutateAsync({
                ...moodImageForm,
                guide_id: guideId,
                image_url: moodImageForm.image_url.trim(),
                caption: moodImageForm.caption || null,
            });
            setMoodOpen(false);
            toast({ title: 'Mood image added', description: 'The mood board has a new reference.' });
        } catch (error) {
            toast({ title: 'Could not add mood image', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const copyValue = (value: string, label: string) => {
        navigator.clipboard.writeText(value);
        toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    };

    const generateBrandKnowledge = async () => {
        if (!guideId) return;
        try {
            const result = await compileKnowledge.mutateAsync();
            setKnowledgeDraft(result.document.markdown || '');
            toast({ title: 'Brand Knowledge generated', description: 'The canonical markdown guide is ready for AI runs.' });
        } catch (error) {
            toast({ title: 'Could not generate Brand Knowledge', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const researchBrandWebsite = async () => {
        if (!guideId) return;
        const brandName = stringValue(draft.brand_name).trim();
        const websiteUrl = stringValue(draft.website_url).trim();
        if (!brandName || !websiteUrl) {
            toast({ title: 'Brand name and website are required', description: 'Add both before running website research.', variant: 'destructive' });
            return;
        }

        try {
            const result = await researchWebsite.mutateAsync({ brandName, websiteUrl });
            setDraft(result.guide || {});
            setOpenSections((current) => current.includes('knowledge') ? current : [...current, 'knowledge']);
            toast({
                title: 'Website research complete',
                description: `Updated ${result.fieldsUpdated.length || 0} brand fields from ${result.sourceCount || 0} source pages.`,
            });
        } catch (error) {
            toast({ title: 'Could not research website', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const saveBrandKnowledge = async () => {
        if (!brandKnowledgeDocument?.id) return;
        try {
            await updateMarkdown.mutateAsync({ documentId: brandKnowledgeDocument.id, markdown: knowledgeDraft });
            toast({ title: 'Brand Knowledge saved', description: 'Manual markdown edits were saved.' });
        } catch (error) {
            toast({ title: 'Could not save Brand Knowledge', description: errorMessage(error), variant: 'destructive' });
        }
    };

    const downloadBrandKnowledge = () => {
        const blob = new Blob([knowledgeDraft || ''], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slugifyFileName(guide?.brand_name || 'brand-knowledge')}.md`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const primaryFont = useMemo(() => fonts.find((font) => font.category === 'heading') || null, [fonts]);
    const bodyFont = useMemo(() => fonts.find((font) => font.category === 'body') || null, [fonts]);
    const knowledgeStatus = brandKnowledgeDocument?.status || 'missing';
    const knowledgeUpdatedAt = brandKnowledgeDocument?.generated_at || brandKnowledgeDocument?.updated_at || '';

    return (
        <AppLayout breadcrumbs={[{ label: 'Tools', path: '#' }, { label: 'Brand Guide', path: '/tools/brand-guide' }]}>
            <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-10">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Palette className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Brand Guide</h1>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Select value={selectedGuideId} onValueChange={setSelectedGuideId} disabled={guides.length === 0}>
                            <SelectTrigger className="h-11 w-full rounded-xl bg-white shadow-sm sm:w-[280px]">
                                <SelectValue placeholder="Select brand guide" />
                            </SelectTrigger>
                            <SelectContent>
                                {guides.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.brand_name || 'Untitled Brand'}
                                        {item.project_id ? ` - ${projects.find((project) => project.id === item.project_id)?.name || 'Assigned project'}` : ' - No project'}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button className="gap-2 rounded-full bg-primary px-6 text-white hover:bg-primary/90" onClick={openCreateGuide}>
                            <Plus className="h-4 w-4" />
                            New Brand Guide
                        </Button>
                    </div>
                </div>

                {!hasGuide && !isLoading ? (
                    <EmptyPanel
                        icon={Palette}
                        title="Create your first Brand Guide"
                        description="Add a brand once, then optionally assign it to a project when it makes sense."
                        actionLabel="Create Brand Guide"
                        onAction={openCreateGuide}
                    />
                ) : isLoading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200 bg-white">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                ) : guide ? (
                    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <aside className="lg:sticky lg:top-6 lg:self-start">
                            <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
                                {sections.map((section) => (
                                    <a
                                        key={section.id}
                                        href={`#${section.id}`}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            scrollToSection(section.id);
                                        }}
                                        className={cn(
                                            'flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                            activeSection === section.id
                                                ? 'bg-primary/10 text-primary shadow-sm'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                                        )}
                                    >
                                        <section.icon className={cn('h-4 w-4', activeSection === section.id ? 'text-primary' : 'text-slate-500')} />
                                        {section.label}
                                    </a>
                                ))}
                            </div>
                        </aside>

                        <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-4">
                            <AccordionItem value="identity" id="identity" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={BadgeInfo} title="Brand Identity" description="The simple brand context your team needs before writing or designing." />
                                <AccordionContent className="space-y-7 pb-6 pt-2">
                                    <div className="grid gap-5 md:grid-cols-2">
                                        <GuideTextField label="Brand / Client Name" value={stringValue(draft.brand_name)} disabled={false} placeholder="NaruvI, Acme Studio, Bright Foods..." onChange={(value) => updateDraft('brand_name', value)} onBlur={() => commitGuideField('brand_name')} />
                                        <GuideTextField label="Website" value={stringValue(draft.website_url)} disabled={false} placeholder="https://brand.com" onChange={(value) => updateDraft('website_url', value)} onBlur={() => commitGuideField('website_url')} />
                                        <GuideTextField label="Short Tagline" value={stringValue(draft.tagline)} disabled={false} placeholder="A short line people remember" onChange={(value) => updateDraft('tagline', value)} onBlur={() => commitGuideField('tagline')} />
                                        <div className="grid gap-2.5">
                                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Project</Label>
                                            <Select
                                                value={stringValue(draft.project_id) || 'none'}
                                                onValueChange={(value) => saveGuideValue('project_id', value === 'none' ? null : value)}
                                                disabled={projectsLoading}
                                            >
                                                <SelectTrigger className="h-12 rounded-xl bg-white px-4">
                                                    <SelectValue placeholder="No project assigned" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No project assigned</SelectItem>
                                                    {projects.map((project) => (
                                                        <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <GuideTextField label="About the Brand" value={stringValue(draft.elevator_pitch)} disabled={false} textarea placeholder="Describe the brand in plain language: what they do, who they serve, what makes them different, and anything a social media manager should know before creating content." onChange={(value) => updateDraft('elevator_pitch', value)} onBlur={() => commitGuideField('elevator_pitch')} />
                                        </div>
                                    </div>
                                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="min-w-0 space-y-1">
                                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                                    <Globe className="h-4 w-4 text-primary" />
                                                    Research Website
                                                </div>
                                                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                                                    Pull website copy, visual cues, and positioning into this guide. Review the fields, then use Generate Knowledge Base to compile the canonical markdown.
                                                </p>
                                            </div>
                                            <Button
                                                className="h-10 gap-2 rounded-xl bg-primary px-4 font-medium text-white hover:bg-primary/90"
                                                onClick={researchBrandWebsite}
                                                disabled={researchWebsite.isPending || !guideId}
                                            >
                                                {researchWebsite.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                                {researchWebsite.isPending ? 'Researching...' : 'Research Website'}
                                            </Button>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="knowledge" id="knowledge" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={FileText} title="Brand Knowledge Base" description="A single markdown source for Social Suite AI runs." />
                                <AccordionContent className="space-y-5 pb-6 pt-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="min-w-0 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant={knowledgeStatus === 'ready' ? 'default' : 'secondary'} className="capitalize">
                                                        {knowledgeStatus}
                                                    </Badge>
                                                    {brandKnowledgeDocument?.manual_edit && <Badge variant="outline">Manual edit</Badge>}
                                                </div>
                                                <p className="text-sm text-slate-500">
                                                    {knowledgeUpdatedAt ? `Last updated ${new Date(knowledgeUpdatedAt).toLocaleString()}` : 'No compiled knowledge document yet.'}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    className="h-10 gap-2 rounded-xl bg-primary px-4 font-medium text-white hover:bg-primary/90"
                                                    onClick={generateBrandKnowledge}
                                                    disabled={compileKnowledge.isPending || !guideId}
                                                >
                                                    {brandKnowledgeDocument ? <RefreshCw className={cn('h-4 w-4', compileKnowledge.isPending && 'animate-spin')} /> : <Sparkles className="h-4 w-4" />}
                                                    {brandKnowledgeDocument ? 'Refresh' : 'Generate'}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="h-10 gap-2 rounded-xl"
                                                    onClick={saveBrandKnowledge}
                                                    disabled={!brandKnowledgeDocument?.id || updateMarkdown.isPending}
                                                >
                                                    <Save className="h-4 w-4" />
                                                    Save
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="h-10 gap-2 rounded-xl"
                                                    onClick={() => copyValue(knowledgeDraft, 'Brand Knowledge')}
                                                    disabled={!knowledgeDraft.trim()}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                    Copy
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="h-10 gap-2 rounded-xl"
                                                    onClick={downloadBrandKnowledge}
                                                    disabled={!knowledgeDraft.trim()}
                                                >
                                                    <Download className="h-4 w-4" />
                                                    Export
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid gap-2.5">
                                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Canonical Markdown</Label>
                                        <Textarea
                                            value={knowledgeDraft}
                                            onChange={(event) => setKnowledgeDraft(event.target.value)}
                                            className="min-h-[360px] rounded-xl bg-white px-4 py-3 font-mono text-sm leading-6"
                                            placeholder="Generate the brand knowledge document after adding identity, links, colors, logo rules, and tone inputs."
                                            disabled={knowledgeLoading || compileKnowledge.isPending}
                                        />
                                    </div>
                                    {brandKnowledgeDocument?.error && (
                                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                            {brandKnowledgeDocument.error}
                                        </div>
                                    )}
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="social" id="social" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={Link2} title="Social Links" description="Keep the brand's live social profiles close to the guide." />
                                <AccordionContent className="space-y-7 pb-6 pt-2">
                                    <SocialLinksEditor
                                        value={draft.custom_sections}
                                        onChange={(platform, url) => saveGuideValue('custom_sections', setSocialLink(draft.custom_sections, platform, url))}
                                    />
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="logos" id="logos" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={Shapes} title="Logos" description="Upload the logo files your team needs in different sizes or layouts." />
                                <AccordionContent className="space-y-7 pb-6 pt-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)]">
                                            <GuideTextField label="Logo Name" value={logoForm.label} placeholder="Primary logo, icon logo, story logo..." onChange={(value) => setLogoForm((form) => ({ ...form, label: value }))} />
                                            <GuideTextField label="Dimension / Use" value={stringValue(logoForm.dimensions)} placeholder="Square, wide, 1080x1080..." onChange={(value) => setLogoForm((form) => ({ ...form, dimensions: value }))} />
                                            <GuideTextField label="Paste Logo Link" value={logoForm.file_url} placeholder="https://..." onChange={(value) => setLogoForm((form) => ({ ...form, file_url: value }))} />
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <Input
                                                type="file"
                                                accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
                                                className="h-11 rounded-xl bg-white file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                                                onChange={(event) => {
                                                    submitLogoFile(event.target.files?.[0] || null);
                                                    event.currentTarget.value = '';
                                                }}
                                            />
                                            <Button className="h-10 gap-2 rounded-xl bg-primary px-4 font-medium text-white hover:bg-primary/90" onClick={submitLogoUrl}>
                                                <Plus className="h-4 w-4" />
                                                Add Logo Link
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {logos.length === 0 ? (
                                            <MutedState text="No logos yet." />
                                        ) : logos.map((logo) => (
                                            <LogoCard
                                                key={logo.id}
                                                logo={logo}
                                                disabled={false}
                                                onUpdate={(updates) => updateLogo.mutate({ id: logo.id, updates })}
                                                onDelete={() => setDeleteConfirm({
                                                    title: 'Delete logo?',
                                                    description: `This removes ${logo.label} from the Brand Guide.`,
                                                    action: () => deleteLogo.mutate(logo.id),
                                                })}
                                            />
                                        ))}
                                    </div>

                                    <LogoUsageRulesTextarea
                                        guideId={guideId}
                                        rules={logoRules}
                                        onAdd={(rule) => addLogoRule.mutate(rule)}
                                        onUpdate={(rule, updates) => updateLogoRule.mutate({ id: rule.id, updates })}
                                        onDelete={(rule) => deleteLogoRule.mutate(rule.id)}
                                    />
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="colors" id="colors" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={Palette} title="Colors" description="Add brand colors with a picker or by pasting a color code." />
                                <AccordionContent className="space-y-7 pb-6 pt-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                                        <div className="grid gap-3 md:grid-cols-[64px_minmax(0,1fr)_180px_auto] md:items-end">
                                            <div className="grid gap-2.5">
                                                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pick</Label>
                                                <Input
                                                    type="color"
                                                    className="h-11 w-16 rounded-xl bg-white p-1"
                                                    value={normalizeHex(colorForm.hex)}
                                                    onChange={(event) => {
                                                        const hex = event.target.value;
                                                        setColorForm((form) => ({ ...form, hex, rgb: hexToRgbString(hex), hsl: hexToHslString(hex) }));
                                                    }}
                                                />
                                            </div>
                                            <GuideTextField label="Color Name" value={colorForm.name} placeholder="Primary blue, cream, accent..." onChange={(value) => setColorForm((form) => ({ ...form, name: value }))} />
                                            <GuideTextField label="Color Code" value={colorForm.hex} placeholder="#2563EB" onChange={(value) => setColorForm((form) => ({ ...form, hex: value }))} />
                                            <Button className="h-10 gap-2 rounded-xl bg-primary px-4 font-medium text-white hover:bg-primary/90" onClick={submitColor}>
                                                <Plus className="h-4 w-4" />
                                                Add
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="h-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                        {colors.length > 0 ? (
                                            <div className="flex h-full">
                                                {colors.map((color) => (
                                                    <div key={color.id} className="h-full flex-1" style={{ backgroundColor: normalizeHex(color.hex) }} />
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-sm text-slate-400">Add colors to build the palette preview.</div>
                                        )}
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {colors.length === 0 ? (
                                            <MutedState text="No colors yet." />
                                        ) : colors.map((color) => (
                                            <CompactColorCard
                                                key={color.id}
                                                color={color}
                                                onCopy={copyValue}
                                                onUpdate={(updates) => updateColor.mutate({ id: color.id, updates })}
                                                onDelete={() => setDeleteConfirm({
                                                    title: 'Delete color?',
                                                    description: `This removes ${color.name} from the palette.`,
                                                    action: () => deleteColor.mutate(color.id),
                                                })}
                                            />
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="typography" id="typography" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={Type} title="Typography" description="Keep only the everyday font choices and text rules." />
                                <AccordionContent className="space-y-7 pb-6 pt-2">
                                    <SimpleTypographyEditor
                                        primaryFont={primaryFont?.font_family || ''}
                                        bodyFont={bodyFont?.font_family || ''}
                                        textRules={stringValue(draft.social_rules)}
                                        onFontChange={saveSimpleFont}
                                        onTextRulesChange={(value) => saveGuideValue('social_rules', value)}
                                    />
                                </AccordionContent>
                            </AccordionItem>

                            <AccordionItem value="voice" id="voice" className="scroll-mt-24 rounded-xl border border-slate-200 bg-white px-6 shadow-sm">
                                <SectionTrigger icon={Mic2} title="Voice and Tone" description="Capture how the brand should sound and the visual mood it should keep." />
                                <AccordionContent className="space-y-7 pb-6 pt-2">
                                    <ToneSpectrumEditor
                                        value={safeToneSpectrum(draft.tone_spectrum)}
                                        disabled={false}
                                        onChange={(value) => saveGuideValue('tone_spectrum', value)}
                                    />
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <TextArrayEditor label="Writing Do's" values={safeStringArray(draft.writing_dos)} disabled={false} placeholder={'Use short, useful sentences\nMake CTAs clear and specific'} onChange={(values) => saveGuideValue('writing_dos', values)} />
                                        <TextArrayEditor label="Writing Don'ts" values={safeStringArray(draft.writing_donts)} disabled={false} placeholder={'Avoid heavy jargon\nDo not overuse exclamation marks'} onChange={(values) => saveGuideValue('writing_donts', values)} />
                                        <div className="lg:col-span-2">
                                            <TextArrayEditor label="Sample Captions / Headlines" values={safeStringArrayFromJson(draft.sample_copy)} disabled={false} placeholder="Add examples that already sound right for this brand." onChange={(values) => saveGuideValue('sample_copy', values)} />
                                        </div>
                                    </div>

                                    <div className="space-y-5 rounded-xl border border-slate-200 p-5">
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-900">Visual Direction</h3>
                                            <p className="text-sm text-slate-500">The look and feel for images, graphics, icons, and references.</p>
                                        </div>
                                        <div className="grid gap-5 lg:grid-cols-3">
                                            <GuideTextField label="Photo Style" value={stringValue(draft.photography_style)} disabled={false} textarea placeholder="Bright and natural, studio product shots, candid people, bold close-ups..." onChange={(value) => updateDraft('photography_style', value)} onBlur={() => commitGuideField('photography_style')} />
                                            <GuideTextField label="Graphic / Illustration Style" value={stringValue(draft.illustration_style)} disabled={false} textarea placeholder="Minimal line art, soft gradients, editorial collage, no illustrations..." onChange={(value) => updateDraft('illustration_style', value)} onBlur={() => commitGuideField('illustration_style')} />
                                            <GuideTextField label="Icon Style" value={stringValue(draft.iconography_rules)} disabled={false} textarea placeholder="Outline icons, simple filled icons, rounded corners, avoid detailed icons..." onChange={(value) => updateDraft('iconography_rules', value)} onBlur={() => commitGuideField('iconography_rules')} />
                                        </div>
                                        <SectionActions title="Mood Board" actionLabel="Add Image" disabled={moodImages.length >= 12} onAction={openMoodSheet} />
                                        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                                            {moodImages.length === 0 ? (
                                                <MutedState text="No mood board images yet." />
                                            ) : moodImages.map((image) => (
                                                <MoodImageCard
                                                    key={image.id}
                                                    image={image}
                                                    disabled={false}
                                                    onUpdate={(updates) => updateMoodImage.mutate({ id: image.id, updates })}
                                                    onDelete={() => setDeleteConfirm({
                                                        title: 'Delete mood image?',
                                                        description: 'This removes the reference image from the mood board.',
                                                        action: () => deleteMoodImage.mutate(image.id),
                                                    })}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                ) : null}
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create Brand Guide</DialogTitle>
                        <DialogDescription>
                            Create a standalone brand guide, or assign it to a project now.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-2">
                        <GuideTextField
                            label="Brand / Client Name"
                            value={newGuideName}
                            placeholder="e.g. NaruvI"
                            onChange={setNewGuideName}
                        />
                        <div className="grid gap-2.5">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assign to Project</Label>
                            <Select value={newGuideProjectId} onValueChange={setNewGuideProjectId} disabled={projectsLoading}>
                                <SelectTrigger className="h-12 rounded-xl bg-white px-4">
                                    <SelectValue placeholder="No project assigned" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No project assigned</SelectItem>
                                    {projects.map((project) => (
                                        <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button className="bg-primary text-white hover:bg-primary/90" onClick={createNewGuide} disabled={createGuide.isPending}>
                            {createGuide.isPending ? 'Creating...' : 'Create Brand Guide'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Sheet open={moodOpen} onOpenChange={setMoodOpen}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle>Add Mood Board Image</SheetTitle>
                        <SheetDescription>Add a reference image for the brand's visual style.</SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-5">
                        <GuideTextField label="Image Link" value={moodImageForm.image_url} placeholder="Paste an image URL" onChange={(value) => setMoodImageForm((form) => ({ ...form, image_url: value }))} />
                        <GuideTextField label="Why this image fits" value={stringValue(moodImageForm.caption)} placeholder="Bright product shot, warm lifestyle feel, bold editorial angle..." onChange={(value) => setMoodImageForm((form) => ({ ...form, caption: value }))} />
                        <Button className="w-full gap-2 bg-primary text-white hover:bg-primary/90" onClick={submitMoodImage}>
                            <Plus className="h-4 w-4" />
                            Add Image
                        </Button>
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{deleteConfirm?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{deleteConfirm?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => {
                                deleteConfirm?.action();
                                setDeleteConfirm(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}

function SectionTrigger({ icon: Icon, title, description }: { icon: typeof Palette; title: string; description: string }) {
    return (
        <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex items-center gap-3 text-left">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    <p className="text-sm font-normal text-muted-foreground mt-0.5">{description}</p>
                </div>
            </div>
        </AccordionTrigger>
    );
}

function SectionActions({ title, actionLabel, disabled, onAction }: { title: string; actionLabel: string; disabled?: boolean; onAction: () => void }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl bg-white px-3" disabled={disabled} onClick={onAction}>
                <Plus className="h-4 w-4" />
                {actionLabel}
            </Button>
        </div>
    );
}

function GuideTextField({
    label,
    value,
    onChange,
    onBlur,
    disabled = false,
    textarea = false,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    disabled?: boolean;
    textarea?: boolean;
    placeholder?: string;
}) {
    return (
        <div className="grid gap-2.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
            {textarea ? (
                <Textarea
                    value={value}
                    disabled={disabled}
                    placeholder={placeholder}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={onBlur}
                    className="min-h-[132px] resize-y rounded-xl bg-white px-4 py-3 leading-6 disabled:opacity-100"
                />
            ) : (
                <Input
                    value={value}
                    disabled={disabled}
                    placeholder={placeholder}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={onBlur}
                    className="h-12 rounded-xl bg-white px-4 disabled:opacity-100"
                />
            )}
        </div>
    );
}

function TagEditor({
    label,
    values,
    disabled,
    tone,
    onChange,
}: {
    label: string;
    values: string[];
    disabled?: boolean;
    tone: 'blue' | 'violet' | 'emerald';
    onChange: (values: string[]) => void;
}) {
    const [input, setInput] = useState('');
    const toneClass = {
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        violet: 'bg-violet-50 text-violet-700 border-violet-100',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    }[tone];

    const add = () => {
        const next = input.trim();
        if (!next || values.includes(next)) return;
        onChange([...values, next]);
        setInput('');
    };

    return (
        <div className="rounded-xl border border-slate-200 p-5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
            <div className="mt-3 flex flex-wrap gap-2">
                {values.length === 0 && <span className="text-sm text-slate-400">No tags yet.</span>}
                {values.map((value) => (
                    <Badge key={value} variant="outline" className={cn('gap-1 border px-3 py-1', toneClass)}>
                        {value}
                        {!disabled && (
                            <button
                                type="button"
                                className="ml-1 text-current opacity-60 hover:opacity-100"
                                onClick={() => onChange(values.filter((item) => item !== value))}
                            >
                                x
                            </button>
                        )}
                    </Badge>
                ))}
            </div>
            {!disabled && (
                <div className="mt-3 flex gap-2">
                    <Input
                        value={input}
                        placeholder="Add a word"
                        className="h-11 rounded-xl"
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                add();
                            }
                        }}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={add}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}

function TextArrayEditor({
    label,
    values,
    disabled,
    placeholder = 'One item per line',
    onChange,
}: {
    label: string;
    values: string[];
    disabled?: boolean;
    placeholder?: string;
    onChange: (values: string[]) => void;
}) {
    const [text, setText] = useState(values.join('\n'));

    useEffect(() => {
        setText(values.join('\n'));
    }, [values.join('|')]);

    return (
        <div className="grid gap-2.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
            <Textarea
                value={text}
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                onBlur={() => onChange(linesToArray(text))}
                className="min-h-[140px] rounded-xl bg-white px-4 py-3 leading-6 disabled:opacity-100"
                placeholder={placeholder}
            />
        </div>
    );
}

function ToneSpectrumEditor({ value, disabled, onChange }: { value: ToneSpectrum; disabled?: boolean; onChange: (value: ToneSpectrum) => void }) {
    const [local, setLocal] = useState<ToneSpectrum>(value);

    useEffect(() => {
        setLocal(value);
    }, [JSON.stringify(value)]);

    const slider = (key: keyof ToneSpectrum, left: string, right: string) => (
        <div className="grid gap-3 rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="flex justify-between text-sm font-medium text-slate-600">
                <span>{left}</span>
                <span className="font-semibold text-slate-900">{local[key] ?? 50}</span>
                <span>{right}</span>
            </div>
            <Slider
                disabled={disabled}
                value={[local[key] ?? 50]}
                min={0}
                max={100}
                step={5}
                onValueChange={(values) => setLocal((current) => ({ ...current, [key]: values[0] }))}
                onValueCommit={(values) => onChange({ ...local, [key]: values[0] })}
            />
        </div>
    );

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Tone Spectrum</h3>
            <div className="grid gap-3 lg:grid-cols-3">
                {slider('formality', 'Casual', 'Formal')}
                {slider('humor', 'Serious', 'Playful')}
                {slider('enthusiasm', 'Calm', 'High Energy')}
            </div>
        </div>
    );
}

function SocialLinksEditor({
    value,
    onChange,
}: {
    value: unknown;
    onChange: (platform: string, url: string) => void;
}) {
    const [local, setLocal] = useState<Record<string, string>>({});

    useEffect(() => {
        setLocal(socialLinkMap(value));
    }, [JSON.stringify(value)]);

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {socialPlatforms.map((platform) => {
                const url = local[platform.id] || '';
                const normalizedUrl = normalizeExternalUrl(url);
                return (
                    <div key={platform.id} className="grid gap-2.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{platform.label}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={url}
                                placeholder={platform.placeholder}
                                className="h-12 rounded-xl bg-white px-4"
                                onChange={(event) => setLocal((current) => ({ ...current, [platform.id]: event.target.value }))}
                                onBlur={(event) => onChange(platform.id, event.currentTarget.value)}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-12 w-12 shrink-0 rounded-xl bg-white"
                                disabled={!normalizedUrl}
                                onClick={() => window.open(normalizedUrl, '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function CompactColorCard({
    color,
    onCopy,
    onUpdate,
    onDelete,
}: {
    color: BrandColor;
    onCopy: (value: string, label: string) => void;
    onUpdate: (updates: Partial<BrandColor>) => void;
    onDelete: () => void;
}) {
    const [local, setLocal] = useState(color);
    const hex = normalizeHex(local.hex);

    useEffect(() => {
        setLocal(color);
    }, [color.id, color.name, color.hex]);

    const commit = () => {
        const nextHex = normalizeHex(local.hex);
        onUpdate({
            name: local.name || 'Brand Color',
            hex: nextHex,
            rgb: hexToRgbString(nextHex),
            hsl: hexToHslString(nextHex),
        });
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex gap-3">
                <Input
                    type="color"
                    className="h-11 w-14 shrink-0 rounded-xl p-1"
                    value={hex}
                    onChange={(event) => setLocal((current) => ({ ...current, hex: event.target.value }))}
                    onBlur={commit}
                />
                <div className="min-w-0 flex-1 space-y-2">
                    <Input
                        value={local.name}
                        placeholder="Color name"
                        className="h-10 rounded-xl"
                        onChange={(event) => setLocal((current) => ({ ...current, name: event.target.value }))}
                        onBlur={commit}
                    />
                    <Input
                        value={local.hex}
                        placeholder="#000000"
                        className="h-10 rounded-xl font-mono text-sm"
                        onChange={(event) => setLocal((current) => ({ ...current, hex: event.target.value }))}
                        onBlur={commit}
                    />
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => onCopy(hex, 'HEX')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={onDelete}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

function SimpleTypographyEditor({
    primaryFont,
    bodyFont,
    textRules,
    onFontChange,
    onTextRulesChange,
}: {
    primaryFont: string;
    bodyFont: string;
    textRules: string;
    onFontChange: (category: 'heading' | 'body', fontFamily: string) => void;
    onTextRulesChange: (value: string) => void;
}) {
    const [local, setLocal] = useState({ primaryFont, bodyFont, textRules });

    useEffect(() => {
        setLocal({ primaryFont, bodyFont, textRules });
    }, [primaryFont, bodyFont, textRules]);

    return (
        <div className="grid gap-5">
            <div className="grid gap-5 md:grid-cols-2">
                <GuideTextField
                    label="Primary Font"
                    value={local.primaryFont}
                    placeholder="e.g. Poppins"
                    onChange={(value) => setLocal((current) => ({ ...current, primaryFont: value }))}
                    onBlur={() => onFontChange('heading', local.primaryFont)}
                />
                <GuideTextField
                    label="Body Font"
                    value={local.bodyFont}
                    placeholder="e.g. Inter"
                    onChange={(value) => setLocal((current) => ({ ...current, bodyFont: value }))}
                    onBlur={() => onFontChange('body', local.bodyFont)}
                />
            </div>
            <GuideTextField
                label="Text Rules"
                value={local.textRules}
                textarea
                placeholder="Example: Keep captions short. Use sentence case. Avoid all caps unless it is a launch announcement."
                onChange={(value) => setLocal((current) => ({ ...current, textRules: value }))}
                onBlur={() => onTextRulesChange(local.textRules)}
            />
        </div>
    );
}

function ColorCard({
    color,
    disabled,
    onCopy,
    onUpdate,
    onDelete,
}: {
    color: BrandColor;
    disabled?: boolean;
    onCopy: (value: string, label: string) => void;
    onUpdate: (updates: Partial<BrandColor>) => void;
    onDelete: () => void;
}) {
    const [local, setLocal] = useState(color);
    const hex = normalizeHex(local.hex);
    const textTone = readableText(hex);

    useEffect(() => {
        setLocal(color);
    }, [color.id, color.name, color.hex, color.role]);

    const commit = () => {
        const nextHex = normalizeHex(local.hex);
        onUpdate({
            name: local.name,
            role: local.role,
            hex: nextHex,
            rgb: hexToRgbString(nextHex),
            hsl: hexToHslString(nextHex),
        });
    };

    return (
        <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            <div className="flex min-h-[120px] items-end justify-between p-4" style={{ backgroundColor: hex, color: textTone }}>
                <div>
                    <p className="text-lg font-semibold">{local.name || 'Untitled Color'}</p>
                    <p className="text-xs font-medium uppercase tracking-wide opacity-80 mt-1">{local.role}</p>
                </div>
                {!disabled && (
                    <Button size="icon" variant="secondary" className="h-8 w-8 bg-white/90 text-slate-700 hover:bg-white hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
            <div className="space-y-3 p-4">
                {!disabled && (
                    <div className="grid gap-2">
                        <Input value={local.name} onChange={(event) => setLocal((current) => ({ ...current, name: event.target.value }))} onBlur={commit} />
                        <div className="flex gap-2">
                            <Input type="color" className="h-10 w-14 p-1" value={hex} onChange={(event) => setLocal((current) => ({ ...current, hex: event.target.value }))} onBlur={commit} />
                            <Input value={local.hex} onChange={(event) => setLocal((current) => ({ ...current, hex: event.target.value }))} onBlur={commit} />
                        </div>
                        <Select value={local.role} onValueChange={(role: BrandColor['role']) => {
                            setLocal((current) => ({ ...current, role }));
                            onUpdate({ role });
                        }}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {colorRoles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                <div className="grid gap-2 text-sm">
                    <CopyRow label="HEX" value={hex} onCopy={onCopy} />
                    <CopyRow label="RGB" value={local.rgb || hexToRgbString(hex)} onCopy={onCopy} />
                    <CopyRow label="HSL" value={local.hsl || hexToHslString(hex)} onCopy={onCopy} />
                </div>
            </div>
        </div>
    );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string, label: string) => void }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-400">{label}</span>
            <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-slate-700">{value}</span>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCopy(value, label)}>
                        <Copy className="h-3.5 w-3.5" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Copy {label}</TooltipContent>
            </Tooltip>
        </div>
    );
}

function FontCard({ font, disabled, onUpdate, onDelete }: { font: BrandFont; disabled?: boolean; onUpdate: (updates: Partial<BrandFont>) => void; onDelete: () => void }) {
    const [local, setLocal] = useState(font);

    useEffect(() => {
        setLocal(font);
    }, [font.id, font.font_family, font.weight, font.category]);

    const commit = () => {
        onUpdate({
            font_family: local.font_family,
            weight: local.weight,
            category: local.category,
            source_url: local.source_url,
            license: local.license,
            type_scale: local.type_scale,
        });
    };

    const scale = safeTypeScale(local.type_scale);

    return (
        <div className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            <div className="mb-5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{local.category}</p>
                    <h3 className="truncate text-2xl font-semibold text-slate-900" style={{ fontFamily: local.font_family }}>{local.font_family}</h3>
                </div>
                {!disabled && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all" onClick={onDelete}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                )}
            </div>
            <p className="mb-4 text-lg text-slate-700" style={{ fontFamily: local.font_family }}>
                The quick brand system keeps every touchpoint precise and human.
            </p>
            <div className="mb-5 grid gap-2 text-sm text-slate-600">
                {Object.entries(scale).filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span className="font-semibold uppercase text-slate-400">{label}</span>
                        <span style={{ fontFamily: local.font_family, fontSize: value }}>{value}</span>
                    </div>
                ))}
            </div>
            {!disabled && (
                <div className="grid gap-3">
                    <GuideTextField label="Font Name" value={local.font_family} onChange={(value) => setLocal((current) => ({ ...current, font_family: value }))} onBlur={commit} />
                    <GuideTextField label="Styles / Weights" value={stringValue(local.weight)} onChange={(value) => setLocal((current) => ({ ...current, weight: value }))} onBlur={commit} />
                    <div className="grid gap-2.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Used For</Label>
                        <Select value={local.category} onValueChange={(category: BrandFont['category']) => {
                            setLocal((current) => ({ ...current, category }));
                            onUpdate({ category });
                        }}>
                            <SelectTrigger className="h-12 rounded-xl bg-white px-4"><SelectValue /></SelectTrigger>
                            <SelectContent>{fontCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <GuideTextField label="Font Link" value={stringValue(local.source_url)} onChange={(value) => setLocal((current) => ({ ...current, source_url: value }))} onBlur={commit} />
                    <GuideTextField label="Usage Notes" value={stringValue(local.license)} textarea onChange={(value) => setLocal((current) => ({ ...current, license: value }))} onBlur={commit} />
                    <TypeScaleEditor value={scale} disabled={disabled} onChange={(type_scale) => {
                        setLocal((current) => ({ ...current, type_scale }));
                        onUpdate({ type_scale });
                    }} />
                </div>
            )}
        </div>
    );
}

function TypeScaleEditor({ value, disabled, onChange }: { value: TypeScale; disabled?: boolean; onChange: (value: TypeScale) => void }) {
    const [local, setLocal] = useState(value);

    useEffect(() => {
        setLocal(value);
    }, [JSON.stringify(value)]);

    const update = (key: keyof TypeScale, nextValue: string) => {
        const next = { ...local, [key]: nextValue };
        setLocal(next);
    };

    return (
        <div className="grid gap-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Text Sizes</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {(['h1', 'h2', 'h3', 'body', 'caption', 'button'] as (keyof TypeScale)[]).map((key) => (
                    <Input
                        key={key}
                        disabled={disabled}
                        value={local[key] || ''}
                        placeholder={textSizeLabel(key)}
                        onChange={(event) => update(key, event.target.value)}
                        onBlur={() => onChange(local)}
                        className="h-11 rounded-xl"
                    />
                ))}
            </div>
        </div>
    );
}

function PairingPreview({ fonts, guide }: { fonts: BrandFont[]; guide: BrandGuide }) {
    const heading = fonts.find((font) => font.category === 'heading') || fonts[0];
    const body = fonts.find((font) => font.category === 'body') || fonts[1] || fonts[0];

    if (!heading && !body) return null;

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Pairing Preview</p>
            <h3 className="mb-3 text-3xl font-semibold text-slate-950" style={{ fontFamily: heading?.font_family }}>
                {guide.brand_name || 'Brand Name'} launches the next campaign standard
            </h3>
            <p className="max-w-2xl text-base leading-7 text-slate-600" style={{ fontFamily: body?.font_family }}>
                {guide.elevator_pitch || 'Use this area to judge the relationship between heading and body typography in a realistic content layout.'}
            </p>
        </div>
    );
}

function LogoCard({ logo, disabled, onUpdate, onDelete }: { logo: BrandLogo; disabled?: boolean; onUpdate: (updates: Partial<BrandLogo>) => void; onDelete: () => void }) {
    const [local, setLocal] = useState(logo);

    useEffect(() => {
        setLocal(logo);
    }, [logo.id, logo.label, logo.file_url, logo.variant]);

    const commit = () => {
        onUpdate({
            label: local.label,
            variant: local.variant,
            file_url: local.file_url,
            format: local.format,
            dimensions: local.dimensions,
        });
    };

    return (
        <div className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            <div className="mb-4 flex aspect-[5/3] items-center justify-center rounded-lg border border-slate-100 bg-slate-50 p-4">
                {local.file_url ? (
                    <img src={local.file_url} alt={local.label} className="max-h-full max-w-full object-contain" />
                ) : (
                    <ImageIcon className="h-10 w-10 text-slate-300" />
                )}
            </div>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate font-semibold text-slate-900">{local.label || 'Untitled Logo'}</h3>
                    <p className="text-xs capitalize text-slate-500">{local.variant} {local.format ? `/${local.format}` : ''}</p>
                    {local.dimensions && <p className="text-xs text-slate-400">{local.dimensions}</p>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg" asChild>
                        <a href={local.file_url} download target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />
                        </a>
                    </Button>
                    {!disabled && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" onClick={onDelete}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
            {!disabled && (
                <div className="grid gap-2">
                    <Input className="h-11 rounded-xl" value={local.label} placeholder="Logo name" onChange={(event) => setLocal((current) => ({ ...current, label: event.target.value }))} onBlur={commit} />
                    <Input className="h-11 rounded-xl" value={local.file_url} placeholder="Logo file link" onChange={(event) => setLocal((current) => ({ ...current, file_url: event.target.value }))} onBlur={commit} />
                    <Input className="h-11 rounded-xl" value={local.dimensions || ''} placeholder="Size notes" onChange={(event) => setLocal((current) => ({ ...current, dimensions: event.target.value }))} onBlur={commit} />
                </div>
            )}
        </div>
    );
}

function LogoUsageRulesTextarea({
    guideId,
    rules,
    onAdd,
    onUpdate,
    onDelete,
}: {
    guideId: string;
    rules: BrandLogoRule[];
    onAdd: (rule: Omit<BrandLogoRule, 'id' | 'created_at'>) => void;
    onUpdate: (rule: BrandLogoRule, updates: Partial<BrandLogoRule>) => void;
    onDelete: (rule: BrandLogoRule) => void;
}) {
    const [value, setValue] = useState(rules.map((rule) => rule.caption).filter(Boolean).join('\n'));

    useEffect(() => {
        setValue(rules.map((rule) => rule.caption).filter(Boolean).join('\n'));
    }, [rules.map((rule) => `${rule.id}:${rule.caption}`).join('|')]);

    const commit = () => {
        const nextValue = value.trim();
        const [primaryRule, ...extraRules] = rules;

        if (!nextValue) {
            rules.forEach(onDelete);
            return;
        }

        if (primaryRule) {
            onUpdate(primaryRule, {
                rule_type: 'do',
                image_url: null,
                caption: nextValue,
            });
            extraRules.forEach(onDelete);
            return;
        }

        if (guideId) {
            onAdd({
                guide_id: guideId,
                rule_type: 'do',
                image_url: null,
                caption: nextValue,
                sort_order: 0,
            });
        }
    };

    return (
        <div className="grid gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Logo Usage Rules</Label>
            <Textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={commit}
                className="min-h-[150px] rounded-xl bg-white px-4 py-3 leading-6"
                placeholder="Example: Use the full color logo on light backgrounds. Use the white logo on dark photos. Do not stretch, recolor, or place it over busy images."
            />
        </div>
    );
}

function MoodImageCard({ image, disabled, onUpdate, onDelete }: { image: BrandMoodImage; disabled?: boolean; onUpdate: (updates: Partial<BrandMoodImage>) => void; onDelete: () => void }) {
    const [caption, setCaption] = useState(image.caption || '');

    useEffect(() => {
        setCaption(image.caption || '');
    }, [image.id, image.caption]);

    return (
        <div className="group relative mb-4 break-inside-avoid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
            <img src={image.image_url} alt={caption || 'Mood board reference'} className="w-full bg-slate-100 object-cover" />
            <div className="p-4">
                {disabled ? (
                    <p className="text-sm font-medium text-slate-700">{caption}</p>
                ) : (
                    <div className="flex gap-2">
                        <Input value={caption} placeholder="Caption" className="h-9 text-sm" onChange={(event) => setCaption(event.target.value)} onBlur={() => onUpdate({ caption })} />
                        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" onClick={onDelete}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyPanel({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
}: {
    icon: typeof Palette;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
            <div className="max-w-md flex flex-col items-center">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-400">
                    <Icon className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                {actionLabel && onAction && (
                    <Button className="mt-6 gap-2 rounded-full bg-primary hover:bg-primary/90 text-white px-6" onClick={onAction}>
                        <Plus className="h-4 w-4" />
                        {actionLabel}
                    </Button>
                )}
            </div>
        </div>
    );
}

function MutedState({ text }: { text: string }) {
    return (
        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-400">
            {text}
        </div>
    );
}

function safeStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function safeStringArrayFromJson(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) return String((item as { text?: unknown }).text || '');
        if (item && typeof item === 'object' && 'copy' in item) return String((item as { copy?: unknown }).copy || '');
        return '';
    }).filter(Boolean);
}

function safeToneSpectrum(value: unknown): ToneSpectrum {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { formality: 50, humor: 40, enthusiasm: 70 };
    const record = value as Record<string, unknown>;
    return {
        formality: Number(record.formality ?? 50),
        humor: Number(record.humor ?? 40),
        enthusiasm: Number(record.enthusiasm ?? 70),
    };
}

function safeTypeScale(value: unknown): TypeScale {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    return {
        h1: stringValue(record.h1),
        h2: stringValue(record.h2),
        h3: stringValue(record.h3),
        body: stringValue(record.body),
        caption: stringValue(record.caption),
        button: stringValue(record.button),
    };
}

function textSizeLabel(key: keyof TypeScale): string {
    const labels: Record<keyof TypeScale, string> = {
        h1: 'Main title',
        h2: 'Section title',
        h3: 'Small title',
        body: 'Body text',
        caption: 'Caption',
        button: 'Button',
    };
    return labels[key];
}

function socialLinkMap(value: unknown): Record<string, string> {
    if (!Array.isArray(value)) return {};
    return value.reduce<Record<string, string>>((links, item) => {
        if (!item || typeof item !== 'object') return links;
        const record = item as Record<string, unknown>;
        if (record.type !== 'social_link' || typeof record.platform !== 'string') return links;
        links[record.platform] = typeof record.url === 'string' ? record.url : '';
        return links;
    }, {});
}

function setSocialLink(value: unknown, platform: string, url: string): unknown[] {
    const existing = Array.isArray(value) ? value : [];
    const preserved = existing.filter((item) => {
        if (!item || typeof item !== 'object') return true;
        const record = item as Record<string, unknown>;
        return !(record.type === 'social_link' && record.platform === platform);
    });
    const cleanUrl = url.trim();
    return cleanUrl ? [...preserved, { type: 'social_link', platform, url: cleanUrl }] : preserved;
}

function normalizeExternalUrl(value: string): string {
    const url = value.trim();
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function logoFormatFromName(value: string): BrandLogo['format'] {
    const extension = value.split('?')[0].split('.').pop()?.toLowerCase();
    if (extension === 'jpeg') return 'jpg';
    if (extension === 'svg' || extension === 'png' || extension === 'jpg' || extension === 'webp') return extension;
    return 'png';
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

function linesToArray(value: string): string[] {
    return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function slugifyFileName(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'brand-knowledge';
}

function normalizeHex(value: string): string {
    let hex = (value || '').trim();
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '#2563EB';
}

function hexToRgb(hexValue: string) {
    const hex = normalizeHex(hexValue).replace('#', '');
    const value = parseInt(hex, 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
    };
}

function hexToRgbString(hexValue: string): string {
    const { r, g, b } = hexToRgb(hexValue);
    return `${r}, ${g}, ${b}`;
}

function hexToHslString(hexValue: string): string {
    const { r, g, b } = hexToRgb(hexValue);
    const rUnit = r / 255;
    const gUnit = g / 255;
    const bUnit = b / 255;
    const max = Math.max(rUnit, gUnit, bUnit);
    const min = Math.min(rUnit, gUnit, bUnit);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rUnit:
                h = (gUnit - bUnit) / d + (gUnit < bUnit ? 6 : 0);
                break;
            case gUnit:
                h = (bUnit - rUnit) / d + 2;
                break;
            default:
                h = (rUnit - gUnit) / d + 4;
        }
        h /= 6;
    }

    return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

function luminance(hexValue: string): number {
    const { r, g, b } = hexToRgb(hexValue);
    const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(first: string, second: string): number {
    const a = luminance(first);
    const b = luminance(second);
    const light = Math.max(a, b);
    const dark = Math.min(a, b);
    return (light + 0.05) / (dark + 0.05);
}

function readableText(hex: string): string {
    return contrastRatio(hex, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0F172A';
}

function parseWeights(value: string | null | undefined): string[] {
    return (value || '').split(',').map((weight) => weight.trim()).filter(Boolean);
}

function fontHref(font: BrandFont): string {
    if (font.source_url && /^https?:\/\//.test(font.source_url)) return font.source_url;
    if (!font.font_family) return '';
    const family = font.font_family.trim().replace(/\s+/g, '+');
    const weights = parseWeights(font.weight).filter((weight) => /^\d+$/.test(weight));
    return weights.length > 0
        ? `https://fonts.googleapis.com/css2?family=${family}:wght@${weights.join(';')}&display=swap`
        : `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Please try again.';
}
