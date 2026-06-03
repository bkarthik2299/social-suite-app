import { useState, useRef, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { LayoutGrid, Search, Share2, FileText, Plus, MoreHorizontal, Calendar as CalendarIcon, X, SlidersHorizontal, Image as ImageIcon, Eye, Instagram, Facebook, Linkedin, Twitter, Sparkles, Lightbulb, Smartphone, Monitor, UploadCloud, Info, ChevronDown, ChevronRight, Heart, MessageCircle, Send, Repeat, BarChart2, Globe, ThumbsUp, Trash2, Wifi, Battery, Mic, ScanSearch, Home, Bell, MoreVertical, Pencil, Check, Settings, PanelRight, ChevronLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrandGuide, useContentItems, useCampaigns, useFolders, useProjects } from '@/hooks/useDatabase';
import { SocialPost, GoogleAd, SocialAd } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { BlogEditor } from '@/components/editor/BlogEditor';
import { campaignPath, findBySlug, folderPath, projectPath } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';

// --- Platform Constants ---
const PLATFORM_SPECS = {
    linkedin: {
        name: 'LinkedIn',
        color: '#0A66C2',
        bgColor: '#F3F2EF',
        font: 'font-sans',
        ratios: ['1.91:1 (Landscape)', '4:5 (Portrait)', '1:1 (Square)'],
        truncation: 210,
        hierarchy: 'Header > Text > Media > Engagement',
        bestFor: 'Professional updates, documents, industry news.'
    },
    twitter: {
        name: 'Twitter (X)',
        color: '#1D9BF0', // Action Blue
        bgColor: '#FFFFFF',
        font: 'font-sans', // System UI
        ratios: ['16:9 (Cinematic)', '1:1 (Square)'],
        truncation: 280, // No specific "see more" for standard
        hierarchy: 'Header > Text > Media > Actions',
        bestFor: 'News, quick updates, threads.'
    },
    instagram: {
        name: 'Instagram',
        color: '#E1306C', // Brand Gradient Rep
        bgColor: '#FFFFFF',
        font: 'font-sans',
        ratios: ['4:5 (Portrait)', '1:1 (Square)'],
        truncation: 125,
        hierarchy: 'Header > Media > Actions > Likes > Caption',
        bestFor: 'Visual storytelling, lifestyle, brand aesthetics.'
    },
    facebook: {
        name: 'Facebook',
        color: '#0866FF',
        bgColor: '#F0F2F5',
        font: 'font-sans',
        ratios: ['1:1 (Square)', '4:5 (Portrait)'],
        truncation: 125,
        hierarchy: 'Header > Text > Media > Social Proof > Actions',
        bestFor: 'Community building, discussions, events.'
    }
};

const toValidDate = (value: unknown): Date | undefined => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value;
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
        return undefined;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatDateLabel = (value: unknown, pattern: string, fallback: string) => {
    const date = toValidDate(value);
    return date ? format(date, pattern) : fallback;
};

type SocialPlatform = 'linkedin' | 'twitter' | 'instagram' | 'facebook';
type SocialAdCta = 'learn_more' | 'sign_up' | 'shop_now' | 'contact_us' | 'download';
type BrandVisualContext = {
    brandName?: string;
    summary: string;
    imageUrls: string[];
} | null;

const IMAGE_ASPECT_RATIOS = [
    { value: '1:1', label: 'Square' },
    { value: '4:5', label: 'Portrait' },
    { value: '9:16', label: 'Story' },
    { value: '16:9', label: 'Landscape' },
] as const;

const normalizeSocialPlatform = (value: unknown): SocialPlatform => {
    const platform = String(value || '').toLowerCase();
    if (platform.includes('linkedin')) return 'linkedin';
    if (platform.includes('instagram')) return 'instagram';
    if (platform.includes('facebook') || platform.includes('meta')) return 'facebook';
    if (platform === 'x' || platform.includes('twitter')) return 'twitter';
    return 'facebook';
};

const normalizeSocialAdCta = (value: unknown): SocialAdCta => {
    const cta = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (['learn_more', 'sign_up', 'shop_now', 'contact_us', 'download'].includes(cta)) {
        return cta as SocialAdCta;
    }

    if (cta.includes('sign')) return 'sign_up';
    if (cta.includes('shop')) return 'shop_now';
    if (cta.includes('download')) return 'download';
    if (cta.includes('contact') || cta.includes('book') || cta.includes('appointment')) return 'contact_us';
    return 'learn_more';
};

const payloadString = (payload: Record<string, unknown>, keys: string[], fallback = '') => {
    for (const key of keys) {
        const value = payload[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return fallback;
};

const visualGuideFromPayload = (payload: Record<string, unknown>, fallback = '') => payloadString(payload, [
    'visualGuide',
    'visual_guide',
    'imagePrompt',
    'image_prompt',
    'visualPrompt',
    'visual_prompt',
    'visualDescription',
    'visual_description',
    'visual',
], fallback);

const generatedImagesFromPayload = (payload: Record<string, unknown>) => {
    const images = payload.generatedImages ?? payload.generated_images;
    return Array.isArray(images) ? images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0) : [];
};

const uniqueImages = (images: string[]) => Array.from(new Set(images.map((item) => item.trim()).filter(Boolean)));

const generateVisualAsset = async (
    visualGuide: string,
    context: Record<string, unknown>,
) => {
    const guide = visualGuide.trim();
    if (!guide) {
        throw new Error('Add a visual guide before generating an image.');
    }

    const { data, error } = await supabase.functions.invoke('generate-visual-asset', {
        body: { visualGuide: guide, context },
    });

    if (error) {
        const contextResponse = (error as { context?: Response }).context;
        if (contextResponse && typeof contextResponse.clone === 'function') {
            try {
                const payload = await contextResponse.clone().json() as { error?: string };
                if (payload?.error) throw new Error(payload.error);
            } catch (payloadError) {
                if (payloadError instanceof Error && payloadError.message !== 'Unexpected end of JSON input') {
                    throw payloadError;
                }
            }
        }
        throw error;
    }

    const payload = data as { imageUrl?: string; error?: string };
    if (payload?.error) throw new Error(payload.error);
    if (!payload?.imageUrl) throw new Error('Image generation did not return an image.');

    return payload.imageUrl;
};

const buildBrandVisualContext = (assets: ReturnType<typeof useBrandGuide>): BrandVisualContext => {
    if (!assets.guide) return null;

    const colors = assets.colors
        .slice(0, 8)
        .map((color) => `${color.name || color.role}: ${color.hex}`)
        .join('; ');
    const fonts = assets.fonts
        .slice(0, 5)
        .map((font) => `${font.category}: ${font.font_family}${font.weight ? ` ${font.weight}` : ''}`)
        .join('; ');
    const logoRules = [
        assets.guide.logo_clearspace ? `Clearspace: ${assets.guide.logo_clearspace}` : '',
        assets.guide.logo_min_digital ? `Minimum digital logo size: ${assets.guide.logo_min_digital}` : '',
        ...assets.logoRules.slice(0, 5).map((rule) => `${rule.rule_type}: ${rule.caption}`),
    ].filter(Boolean).join('; ');
    const styleNotes = [
        assets.guide.photography_style ? `Photography: ${assets.guide.photography_style}` : '',
        assets.guide.illustration_style ? `Illustration: ${assets.guide.illustration_style}` : '',
        assets.guide.iconography_rules ? `Iconography: ${assets.guide.iconography_rules}` : '',
        assets.guide.social_rules ? `Social rules: ${assets.guide.social_rules}` : '',
        assets.guide.ad_rules ? `Ad rules: ${assets.guide.ad_rules}` : '',
    ].filter(Boolean).join('; ');
    const imageUrls = [
        ...assets.logos.map((logo) => logo.file_url),
        ...assets.moodImages.map((image) => image.image_url),
    ].filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url)).slice(0, 6);

    return {
        brandName: assets.guide.brand_name || undefined,
        summary: [
            assets.guide.brand_name ? `Brand: ${assets.guide.brand_name}` : '',
            colors ? `Colors: ${colors}` : '',
            fonts ? `Typography: ${fonts}` : '',
            logoRules ? `Logo rules: ${logoRules}` : '',
            styleNotes,
        ].filter(Boolean).join('\n'),
        imageUrls,
    };
};

// --- Platform Icons ---
const PlatformIcon = ({ platform, active, onClick, size = "md" }: { platform: string, active?: boolean, onClick?: () => void, size?: "sm" | "md" | "lg" }) => {
    const icons = {
        instagram: Instagram,
        facebook: Facebook,
        linkedin: Linkedin,
        twitter: Twitter
    };
    const Icon = icons[platform as keyof typeof icons] || Share2;

    const gradients = {
        instagram: "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 text-white",
        facebook: "bg-[#1877F2] text-white",
        linkedin: "bg-[#0A66C2] text-white",
        twitter: "bg-black text-white"
    };

    if (size === "lg") {
        return (
            <div
                onClick={onClick}
                className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 shadow-sm",
                    active ? "ring-2 ring-offset-2 ring-primary" : "opacity-70 hover:opacity-100",
                    gradients[platform as keyof typeof gradients] || "bg-gray-500 text-white"
                )}
            >
                <Icon className="w-5 h-5" />
            </div>
        );
    }

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all cursor-pointer font-medium text-sm select-none",
                active
                    ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-border bg-white hover:bg-slate-50 text-muted-foreground"
            )}>
            <Icon className={cn("w-4 h-4", active && "fill-current")} />
            <span className="capitalize">{platform}</span>
            {active && <div className="ml-2 w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </div>
    );
};

const VisualGuideControls = ({
    selectedAspectRatio,
    onAspectRatioChange,
    useBrandGuide,
    onUseBrandGuideChange,
    hasBrandGuide,
}: {
    selectedAspectRatio: string;
    onAspectRatioChange: (value: string) => void;
    useBrandGuide: boolean;
    onUseBrandGuideChange: (value: boolean) => void;
    hasBrandGuide: boolean;
}) => (
    <div className="flex flex-wrap items-center gap-2">
        {IMAGE_ASPECT_RATIOS.map((ratio) => (
            <button
                key={ratio.value}
                type="button"
                onClick={() => onAspectRatioChange(ratio.value)}
                className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedAspectRatio === ratio.value
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
            >
                {ratio.label} <span className="ml-1 text-slate-400">{ratio.value}</span>
            </button>
        ))}
        <button
            type="button"
            onClick={() => onUseBrandGuideChange(!useBrandGuide)}
            disabled={!hasBrandGuide}
            className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                useBrandGuide && hasBrandGuide
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                !hasBrandGuide && "cursor-not-allowed opacity-50"
            )}
        >
            Use Brand Guide
        </button>
    </div>
);

const GeneratedImageStrip = ({
    images,
    selectedImage,
    onSelect,
    onPreview,
}: {
    images: string[];
    selectedImage: string;
    onSelect: (image: string) => void;
    onPreview: (image: string) => void;
}) => (
    <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Generated Images</Label>
        <div className="flex flex-wrap gap-2">
            {images.length ? images.map((item, index) => (
                <div key={`${item}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg border bg-slate-50">
                    <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className={cn(
                            "h-full w-full overflow-hidden",
                            selectedImage === item ? "ring-2 ring-blue-500 ring-offset-2" : "hover:opacity-90"
                        )}
                        aria-label={`Select generated image ${index + 1}`}
                    >
                        <img src={item} alt={`Generated option ${index + 1}`} className="h-full w-full object-cover" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onPreview(item)}
                        className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-sm hover:bg-white"
                        aria-label={`View generated image ${index + 1}`}
                    >
                        <Eye className="h-3.5 w-3.5" />
                    </button>
                </div>
            )) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                    <ImageIcon className="h-5 w-5" />
                </div>
            )}
        </div>
    </div>
);

const ImageLightbox = ({ image, onClose }: { image: string; onClose: () => void }) => (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[min(96vw,1100px)] border-0 bg-black p-0 shadow-2xl">
            <DialogHeader className="sr-only">
                <DialogTitle>Full image preview</DialogTitle>
                <DialogDescription>Expanded campaign image preview.</DialogDescription>
            </DialogHeader>
            <div className="flex max-h-[90vh] items-center justify-center p-3">
                {image && <img src={image} alt="Full campaign visual" className="max-h-[86vh] w-auto max-w-full rounded-lg object-contain" />}
            </div>
        </DialogContent>
    </Dialog>
);

// --- Helper Components for Preview ---
const SocialPreview = ({ post, onImageClick }: { post: Partial<SocialPost>; onImageClick?: (image: string) => void }) => {
    const [platform, setPlatform] = useState<'instagram' | 'facebook' | 'linkedin' | 'twitter'>('linkedin');
    const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

    const specs = PLATFORM_SPECS[platform];

    const displayHashtags = post.hashtags?.length
        ? post.hashtags.map(tag => `${tag.startsWith('#') ? '' : '#'}${tag}`).join(' ')
        : "";

    const getTruncatedCaption = (text: string) => {
        if (!text) return "Your caption goes here...";
        const limit = specs.truncation;
        const suffix = platform === 'linkedin' ? "...see more" : "...more";

        if (platform === 'twitter') return text; // Standard 280 just shows

        if (text.length <= limit) return text;
        return (
            <>
                {text.slice(0, limit)}
                <span className="text-slate-500 font-medium cursor-pointer hover:underline ml-1">{suffix}</span>
            </>
        );
    };

    const getAspectRatioClass = () => {
        switch (platform) {
            case 'twitter': return "aspect-[16/9]";
            case 'instagram': return "aspect-square"; // 1:1 default for classic feed
            case 'linkedin': return "aspect-[1.91/1]";
            case 'facebook': return "aspect-square"; // 1:1 is very safe for FB Mobile
            default: return "aspect-video";
        }
    };

    // --- RENDERERS ---

    const RenderHeader = () => (
        <div className="flex gap-3 items-center">
            <Avatar className="w-10 h-10 ring-1 ring-slate-100">
                <AvatarImage src="" />
                <AvatarFallback className={cn("text-white text-xs",
                    platform === 'linkedin' ? "bg-[#0A66C2]" :
                        platform === 'facebook' ? "bg-[#0866FF]" :
                            platform === 'twitter' ? "bg-black" :
                                "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500"
                )}>MP</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                    <h4 className="font-bold text-sm text-gray-900 leading-tight">Marketing Pro</h4>
                    {platform === 'twitter' && <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-blue-50 text-blue-500"><svg viewBox="0 0 22 22" className="w-2.5 h-2.5 fill-current"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.602.27-1.264.127-1.897-.146-.633-.502-1.182-1.028-1.582.47-.437.82-1.002.993-1.614.173-.615.158-1.274-.044-1.876-.633.228-1.29.27-1.92.122-.63-.148-1.185-.508-1.6-.99.428-.48.665-1.107.665-1.745 0-.58-.198-1.134-.548-1.593-.687.167-1.41.13-2.062-.108-.65-.24-1.205-.68-1.583-1.25-.333.528-.84.92-1.43 1.107-.59.187-1.22.18-1.83-.02-.373.6-.948 1.02-1.617 1.18-.67.16-1.375-.02-1.947-.51.103.682-.014 1.385-.334 1.956-.32.57-.83 1.002-1.452 1.226.476.43.824 1.002 1.003 1.625.18.623.163 1.294-.048 1.905.626-.22 1.282-.258 1.91-.107.628.15 1.18.515 1.592 1.002-.424.48-.66 1.106-.66 1.743 0 .58.196 1.13.543 1.585.69-.17 1.413-.135 2.066.103.652.24 1.21.68 1.59 1.25.335-.526.84-.917 1.43-1.103.593-.186 1.223-.178 1.834.02.368-.602.946-1.022 1.616-1.18.67-.158 1.376.02 1.948.51-.105-.682.012-1.385.333-1.956.32-.57.83-1.002 1.452-1.226" /></svg></Badge>}
                </div>
                <p className="text-xs text-gray-500 leading-tight truncate">
                    {platform === 'linkedin' && "Team Workspace • 2h • 🌐"}
                    {platform === 'twitter' && "@marketing_pro • 2h"}
                    {platform === 'instagram' && "Original Audio"}
                    {platform === 'facebook' && <span className="flex items-center gap-1">2h • <Globe className="w-3 h-3" /></span>}
                </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreHorizontal className="w-4 h-4" /></Button>
        </div>
    );

    const RenderText = ({ className }: { className?: string }) => (
        <div className={cn("text-[15px] text-gray-900 whitespace-pre-wrap leading-relaxed", className)}>
            {getTruncatedCaption(post.caption || "")}
            {displayHashtags && platform !== 'twitter' && (
                <span className={cn("block mt-1 font-medium",
                    platform === 'linkedin' ? "text-[#0A66C2]" : "text-[#00376B]"
                )}>{displayHashtags}</span>
            )}
            {platform === 'twitter' && displayHashtags && (
                <span className="text-[#1D9BF0] ml-1">{displayHashtags}</span>
            )}
        </div>
    );

    const RenderMedia = () => (
        post.image ? (
            <button
                type="button"
                onClick={() => post.image && onImageClick?.(post.image)}
                className={cn("w-full bg-slate-100 overflow-hidden relative group border-y border-slate-100 cursor-zoom-in", getAspectRatioClass())}
            >
                <img src={post.image} alt="Post content" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Badge variant="secondary" className="bg-white/90 backdrop-blur pointer-events-none">Image Preview</Badge>
                </div>
            </button>
        ) : (
            <div className={cn("w-full bg-slate-50 flex flex-col items-center justify-center gap-3 border-y border-slate-100", getAspectRatioClass())}>
                <ImageIcon className="w-8 h-8 text-slate-300" />
                <p className="text-xs text-slate-400">No media</p>
            </div>
        )
    );

    const RenderActions = () => {
        if (platform === 'instagram') {
            return (
                <div className="px-4 pt-3 pb-2 space-y-3">
                    <div className="flex justify-between">
                        <div className="flex gap-4">
                            <Heart className="w-6 h-6 hover:text-red-500 cursor-pointer transition-colors" />
                            <MessageCircle className="w-6 h-6 -rotate-90 hover:text-slate-600 cursor-pointer" />
                            <Send className="w-6 h-6 hover:text-slate-600 cursor-pointer" />
                        </div>
                        <Share2 className="w-6 h-6 hover:text-slate-600 cursor-pointer" />
                    </div>
                    <div className="text-sm font-semibold text-gray-900">124 likes</div>
                </div>
            );
        }
        if (platform === 'twitter') {
            return (
                <div className="px-2 py-3 border-t border-slate-50 flex justify-between text-slate-500 max-w-[90%]">
                    <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-blue-400"><MessageCircle className="w-4 h-4" /> 12</div>
                    <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-green-500"><Repeat className="w-4 h-4" /> 8</div>
                    <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-red-500"><Heart className="w-4 h-4" /> 124</div>
                    <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-blue-400"><BarChart2 className="w-4 h-4" /> 1.2k</div>
                    <Share2 className="w-4 h-4 hover:text-blue-400 cursor-pointer" />
                </div>
            );
        }
        if (platform === 'facebook') {
            return (
                <div className="px-4">
                    <div className="flex items-center justify-between py-2 text-xs text-slate-500 border-b border-slate-100">
                        <div className="flex items-center gap-1">
                            <div className="flex -space-x-1">
                                <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center"><ThumbsUp className="w-2.5 h-2.5 text-white" /></div>
                            </div>
                            <span>124</span>
                        </div>
                        <div className="flex gap-2">
                            <span>42 comments</span>
                            <span>8 shares</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100"><ThumbsUp className="w-4 h-4" /> Like</Button>
                        <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100"><MessageCircle className="w-4 h-4" /> Comment</Button>
                        <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100"><Share2 className="w-4 h-4" /> Share</Button>
                    </div>
                </div>
            );
        }
        return ( // LinkedIn
            <div className="px-4 py-2">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <div className="flex items-center gap-1">
                        <div className="w-4 h-4 bg-[#0A66C2] rounded-full flex items-center justify-center text-white text-[8px]"><ThumbsUp className="w-2 h-2" /></div>
                        <div className="w-4 h-4 bg-[#EB4F38] rounded-full flex items-center justify-center text-white text-[8px]"><Heart className="w-2 h-2 fill-current" /></div>
                        <span className="ml-1 hover:text-blue-600 hover:underline cursor-pointer">124</span>
                    </div>
                    <span>42 comments • 6 reposts</span>
                </div>
                <div className="flex items-center justify-between border-t pt-1">
                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><ThumbsUp className="w-5 h-5" /><span className="text-xs font-medium">Like</span></Button>
                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><MessageCircle className="w-5 h-5" /><span className="text-xs font-medium">Comment</span></Button>
                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><Repeat className="w-5 h-5" /><span className="text-xs font-medium">Repost</span></Button>
                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><Send className="w-5 h-5" /><span className="text-xs font-medium">Send</span></Button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 rounded-xl overflow-hidden border border-slate-100">

            {/* Preview Header / Navbar */}
            <div className="flex flex-col gap-4 items-center justify-center p-4 border-b bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex w-full items-center justify-between max-w-[550px]">
                    <div className="flex gap-2">
                        {Object.keys(PLATFORM_SPECS).map((p) => (
                            <PlatformIcon key={p} platform={p} size="lg" active={platform === p} onClick={() => setPlatform(p as keyof typeof PLATFORM_SPECS)} />
                        ))}
                    </div>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2 text-slate-600 border-slate-200">
                                <Info className="w-4 h-4" /> Specs <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="end">
                            <div className="p-4 bg-slate-50 border-b">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full" style={{ background: specs.color }} />
                                    <h4 className="font-semibold">{specs.name} Specs</h4>
                                </div>
                                <p className="text-xs text-muted-foreground">{specs.bestFor}</p>
                            </div>
                            <div className="p-4 space-y-3 text-sm">
                                <div>
                                    <span className="text-xs font-medium text-slate-500 uppercase">Aspect Ratios</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {specs.ratios.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs font-medium text-slate-500 uppercase">Truncation</span>
                                    <p className="mt-1">~{specs.truncation} characters</p>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDevice('desktop')}
                        className={cn("h-7 gap-2 rounded-md transition-all text-xs font-medium", device === 'desktop' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        <Monitor className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDevice('mobile')}
                        className={cn("h-7 gap-2 rounded-md transition-all text-xs font-medium", device === 'mobile' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        <Smartphone className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto flex items-start justify-center bg-slate-100/50">
                {/* Device Frame Wrapper */}
                <div className={cn(
                    "bg-white shadow-2xl overflow-hidden transition-all duration-300 relative select-none",
                    device === 'mobile'
                        ? "w-[375px] h-[812px] rounded-[40px] border-[14px] border-[#f8fafc] shadow-[0_0_0_2px_#e2e8f0,0_20px_40px_-12px_rgba(0,0,0,0.1)] ring-1 ring-slate-100"
                        : "w-full max-w-4xl rounded-xl min-h-[600px] border border-slate-200 shadow-xl"
                )}>
                    {/* Screen Content Wrapper */}
                    <div className={cn("h-full flex flex-col", device === 'mobile' ? "bg-white" : "bg-slate-50")}>

                        {/* Status Bar / Browser Bar */}
                        {device === 'mobile' ? (
                            <div className="h-12 px-6 flex justify-between items-end pb-2 text-black/80 font-semibold text-[13px] shrink-0 bg-white z-20">
                                <span>9:41</span>
                                <div className="flex gap-1.5 items-center">
                                    <Wifi className="w-4 h-4" />
                                    <Battery className="w-4 h-4" />
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border-b p-3 flex items-center gap-3 shrink-0">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                </div>
                                <div className="flex-1 bg-slate-50 border h-7 rounded-md px-3 text-[11px] flex items-center text-slate-400 font-medium">
                                    social-media.com
                                </div>
                            </div>
                        )}

                        {/* Scrollable Content Area */}
                        <div className="flex-1 overflow-y-auto no-scrollbar relative bg-slate-50/50">
                            <div className={cn("min-h-full p-4 flex flex-col items-center", device === 'desktop' && "p-8")}>

                                {/* INSTAGRAM LAYOUT (Media First) */}
                                {platform === 'instagram' ? (
                                    <div className={cn(
                                        "bg-white rounded-xl shadow-sm border border-slate-200 transition-all duration-300 overflow-hidden shrink-0",
                                        device === 'mobile' ? "w-full" : "w-full max-w-[400px]"
                                    )}>
                                        <div className="p-3"><RenderHeader /></div>
                                        <RenderMedia />
                                        <RenderActions />
                                        <div className="px-4 pb-4">
                                            <div className="text-sm">
                                                <span className="font-bold mr-2 text-gray-900">marketing.pro</span>
                                                <span className="text-gray-900">{getTruncatedCaption(post.caption || "")}</span>
                                            </div>
                                            {displayHashtags && <div className="text-blue-900 text-sm mt-1">{displayHashtags}</div>}
                                            <div className="text-xs text-slate-400 mt-2 uppercase">2 HOURS AGO</div>
                                        </div>
                                    </div>
                                ) : (
                                    /* STANDARD LAYOUT (Text First) - LinkedIn, Facebook, Twitter */
                                    <div className={cn(
                                        "bg-white rounded-xl shadow-sm border border-slate-200 transition-all duration-300 overflow-hidden shrink-0",
                                        device === 'mobile' ? "w-full" : "w-full max-w-[500px]",
                                        platform === 'twitter' && "rounded-none border-x-0 sm:rounded-xl sm:border-x"
                                    )}>
                                        <div className="p-4"><RenderHeader /></div>

                                        {/* Content Block */}
                                        <div className={cn("px-4 pb-3", platform === 'twitter' && "text-[15px]")}>
                                            <RenderText />
                                        </div>

                                        <RenderMedia />
                                        <RenderActions />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Mobile Bottom Nav */}
                        {device === 'mobile' && (
                            <div className="h-16 bg-white border-t flex justify-around items-center text-xs text-slate-500 font-medium shrink-0 z-20">
                                <div className="flex flex-col items-center gap-1 text-slate-900"><Home className="w-5 h-5" /><span>Home</span></div>
                                <div className="flex flex-col items-center gap-1"><Search className="w-5 h-5" /><span>Search</span></div>
                                <div className="flex flex-col items-center gap-1"><Bell className="w-5 h-5" /><span>Notifications</span></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-2 text-center border-t bg-white text-[10px] text-slate-400 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
                <span>{specs.name} Preview</span>
                <span className="text-slate-300">•</span>
                <span>{device}</span>
            </div>
        </div>
    );
};

// --- Tab Content Components ---

const SocialPostsTab = ({ campaignId, autoCreate, brandVisualContext }: { campaignId: string, autoCreate?: boolean, brandVisualContext: BrandVisualContext }) => {
    const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const socialPosts = (dbItems || []).filter(i => i.type === 'social-post').map(i => ({
        id: i.id,
        campaignId: i.campaignId,
        name: i.name,
        status: i.status,
        ...i.payload,
        creativeBrief: payloadString(i.payload, ['creativeBrief', 'creative_brief'], ''),
        caption: payloadString(i.payload, ['caption', 'body', 'copy', 'text', 'content', 'post_copy', 'postCopy', 'primary_text', 'primaryText'], i.name || 'Social post draft'),
        visualGuide: visualGuideFromPayload(i.payload),
        generatedImages: generatedImagesFromPayload(i.payload),
        imageAspectRatio: payloadString(i.payload, ['imageAspectRatio', 'image_aspect_ratio'], '1:1'),
        useBrandGuide: i.payload.useBrandGuide === true || i.payload.use_brand_guide === true,
    }));
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(autoCreate || false);
    const [editingPost, setEditingPost] = useState<SocialPost | null>(null);

    // Form State
    const [brief, setBrief] = useState('');
    const [visualGuide, setVisualGuide] = useState('');
    const [caption, setCaption] = useState('');
    const [image, setImage] = useState('');
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');
    const [useBrandGuide, setUseBrandGuide] = useState(false);
    const [lightboxImage, setLightboxImage] = useState('');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin']);
    const [topic, setTopic] = useState('');

    // File Input Ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    const posts = socialPosts.filter(p => p.campaignId === campaignId);

    // Header State
    const [name, setName] = useState('New Social Post');
    const [isEditingName, setIsEditingName] = useState(false);

    const handleOpen = (post?: SocialPost) => {
        if (post) {
            setEditingPost(post);
            setName(post.name || 'New Social Post');
            setBrief(post.creativeBrief || '');
            setVisualGuide(post.visualGuide || post.creativeBrief || '');
            setCaption(post.caption);
            setImage(post.image || '');
            setGeneratedImages(uniqueImages([...(post.generatedImages || []), post.image || '']));
            setSelectedAspectRatio(post.imageAspectRatio || '1:1');
            setUseBrandGuide(post.useBrandGuide === true);
            setDate(toValidDate(post.scheduledDate));
            setSelectedPlatforms(post.platforms || ['linkedin']);
            setTopic(post.topic || '');
        } else {
            setEditingPost(null);
            setName('New Social Post');
            setBrief('');
            setVisualGuide('');
            setCaption('');
            setImage('');
            setGeneratedImages([]);
            setSelectedAspectRatio('1:1');
            setUseBrandGuide(false);
            setDate(undefined);
            setSelectedPlatforms(['linkedin']);
            setTopic('');
        }
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        const postData = {
            campaignId,
            name,
            creativeBrief: brief,
            visualGuide,
            caption,
            hashtags: [], // Hashtags implicity in caption now
            image,
            generatedImages,
            imageAspectRatio: selectedAspectRatio,
            useBrandGuide,
            platforms: selectedPlatforms,
            scheduledDate: date ? date.toISOString() : '',
            topic,
            status: 'draft' as const,
        };

        if (editingPost) {
            updateContentItem.mutate({ id: editingPost.id, updates: { name, payload: postData } });
        } else {
            addContentItem.mutate({ type: 'social-post', name, payload: postData });
        }
        setIsDialogOpen(false);
    };

    const togglePlatform = (p: string) => {
        if (selectedPlatforms.includes(p)) {
            setSelectedPlatforms(selectedPlatforms.filter(item => item !== p));
        } else {
            setSelectedPlatforms([...selectedPlatforms, p]);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            setImage(objectUrl);
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleGenerateImage = async () => {
        setIsGeneratingImage(true);
        try {
            const imageUrl = await generateVisualAsset(visualGuide, {
                kind: 'social-post',
                name,
                topic,
                caption,
                platforms: selectedPlatforms,
                aspectRatio: selectedAspectRatio,
                useBrandGuide,
                brandGuide: useBrandGuide ? brandVisualContext : null,
            });
            setImage(imageUrl);
            setGeneratedImages((current) => uniqueImages([imageUrl, ...current]));
            toast({
                title: 'Image generated',
                description: 'The generated image has been placed in the media preview.',
            });
        } catch (error) {
            toast({
                title: 'Image generation failed',
                description: error instanceof Error ? error.message : 'Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsGeneratingImage(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Social Media Posts</h3>
                    <p className="text-sm text-muted-foreground">Manage and schedule content across platforms.</p>
                </div>
                <Button onClick={() => handleOpen()} className="gap-2 rounded-full"><Plus className="w-4 h-4" /> New Post</Button>
            </div>

            {posts.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed rounded-xl bg-slate-50/50">
                    <p className="text-muted-foreground mb-4">No posts yet. Create your first social media post!</p>
                    <Button onClick={() => handleOpen()} variant="outline">Create Post</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {posts.map(post => (
                        <Card key={post.id} className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-muted relative" onClick={() => handleOpen(post)}>
                            <div className="bg-muted h-48 flex items-center justify-center text-muted-foreground relative overflow-hidden">
                                {post.image ? (
                                    <img src={post.image} alt="Post asset" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <ImageIcon className="w-8 h-8 opacity-20" />
                                        <span className="text-xs opacity-50">No Image</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button variant="secondary" size="sm" className="gap-2">Edit Post</Button>
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="outline" className="text-[10px] font-normal">
                                        {formatDateLabel(post.scheduledDate, 'MMM d', 'Unscheduled')}
                                    </Badge>
                                    <div className="flex -space-x-1">
                                        {post.platforms?.includes('linkedin') && <div className="w-5 h-5 rounded-full bg-[#0A66C2] flex items-center justify-center text-[8px] border-2 border-white text-white">Li</div>}
                                        {post.platforms?.includes('instagram') && <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 flex items-center justify-center text-[8px] border-2 border-white text-white">IG</div>}
                                        {(!post.platforms || post.platforms.length === 0) && <div className="w-5 h-5 rounded-full bg-gray-400 flex items-center justify-center text-[8px] border-2 border-white text-white">?</div>}
                                    </div>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900 line-clamp-1 mb-1">
                                    {post.name || "Untitled Post"}
                                </h4>
                            </CardContent>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-7 w-7 bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                onClick={(e) => { e.stopPropagation(); deleteContentItem.mutate(post.id); }}
                            >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                        </Card>
                    ))}
                </div>
            )}

            {/* Editor Modal - Refined UI */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[1200px] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden bg-slate-50">
                    <div className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-20 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-100 p-2 rounded-lg"><Share2 className="w-5 h-5 text-blue-600" /></div>
                            <div>
                                {isEditingName ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="h-8 text-lg font-bold w-64"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                                        />
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => setIsEditingName(false)}>
                                            <Check className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                                        <DialogTitle className="text-lg font-bold text-gray-900">{name}</DialogTitle>
                                        <Pencil className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    <DialogDescription className="text-xs text-muted-foreground m-0">Draft saved automatically</DialogDescription>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="hover:bg-slate-100">Cancel</Button>
                            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-200">Save Draft</Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex">
                        {/* Left Column: Editor */}
                        <ScrollArea className="flex-1 border-r border-slate-200 bg-slate-50/50">
                            <div className="p-8 space-y-6 max-w-2xl mx-auto">

                                {/* Topic / Idea */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Topic / Idea</Label>
                                        <Textarea
                                            placeholder="Describe your post concept, target audience, or key message..."
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            className="min-h-[80px] resize-none"
                                        />
                                    </CardContent>
                                </Card>

                                {/* Channels */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50">
                                    <CardContent className="p-6">
                                        <Label className="text-xs font-bold text-slate-500 mb-4 block uppercase tracking-wider">Select Channels</Label>
                                        <div className="flex flex-wrap gap-3">
                                            <div onClick={() => togglePlatform('linkedin')}><PlatformIcon platform="linkedin" active={selectedPlatforms.includes('linkedin')} /></div>
                                            <div onClick={() => togglePlatform('twitter')}><PlatformIcon platform="twitter" active={selectedPlatforms.includes('twitter')} /></div>
                                            <div onClick={() => togglePlatform('instagram')}><PlatformIcon platform="instagram" active={selectedPlatforms.includes('instagram')} /></div>
                                            <div onClick={() => togglePlatform('facebook')}><PlatformIcon platform="facebook" active={selectedPlatforms.includes('facebook')} /></div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Schedule Date */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">Schedule Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal bg-slate-50 border-slate-200",
                                                        !date && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {date ? format(date, "d MMM yyyy") : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={date}
                                                    onSelect={setDate}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </CardContent>
                                </Card>

                                {/* Creative Brief */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">Creative Brief</Label>
                                        <div className="relative group">
                                            <Lightbulb className="absolute left-3 top-3 w-4 h-4 text-amber-500 transition-transform group-hover:scale-110" />
                                            <Input
                                                className="pl-10 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
                                                placeholder="e.g. campaign objective, offer, tone, and constraints..."
                                                value={brief}
                                                onChange={(e) => setBrief(e.target.value)}
                                            />
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Visual Guide */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <Label className="text-sm font-semibold text-slate-700">Visual Guide</Label>
                                                <p className="text-xs text-slate-500 mt-1">Describe the intended image before generating or uploading media.</p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="gap-2"
                                                disabled={!visualGuide.trim() || isGeneratingImage}
                                                onClick={handleGenerateImage}
                                            >
                                                <Sparkles className="w-3.5 h-3.5" />
                                                {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                                            </Button>
                                        </div>
                                        <Textarea
                                            className="min-h-[120px] resize-none border-slate-200 bg-slate-50 focus:bg-white transition-colors"
                                            placeholder="e.g. Calm premium hospital visual, warm daylight, diverse young adults, clear focal point, blue-white palette, minimal text overlay."
                                            value={visualGuide}
                                            onChange={(e) => setVisualGuide(e.target.value)}
                                        />
                                        <VisualGuideControls
                                            selectedAspectRatio={selectedAspectRatio}
                                            onAspectRatioChange={setSelectedAspectRatio}
                                            useBrandGuide={useBrandGuide}
                                            onUseBrandGuideChange={setUseBrandGuide}
                                            hasBrandGuide={!!brandVisualContext}
                                        />
                                        <GeneratedImageStrip
                                            images={generatedImages}
                                            selectedImage={image}
                                            onSelect={setImage}
                                            onPreview={setLightboxImage}
                                        />
                                    </CardContent>
                                </Card>

                                {/* Caption */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-center mb-3">
                                            <Label className="text-sm font-semibold text-slate-700">Caption</Label>
                                            <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">
                                                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate with AI
                                            </Button>
                                        </div>
                                        <div className="relative">
                                            <Textarea
                                                className="min-h-[200px] resize-none border-slate-200 bg-slate-50 focus:bg-white p-4 text-base leading-relaxed transition-all"
                                                placeholder="Write something engaging..."
                                                value={caption}
                                                onChange={(e) => setCaption(e.target.value)}
                                            />
                                            <div className="absolute bottom-3 right-3 text-xs text-slate-400 font-mono">
                                                {caption.length} / 2200
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Media Assets (Improved) */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">Media Assets</Label>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                        />

                                        {image ? (
                                            <div
                                                className="relative rounded-xl overflow-hidden border border-slate-200 group aspect-video bg-slate-100 flex items-center justify-center cursor-zoom-in"
                                                onClick={() => setLightboxImage(image)}
                                            >
                                                <img src={image} className="w-full h-full object-contain" alt="Uploaded asset" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <Button variant="secondary" size="sm" onClick={(event) => { event.stopPropagation(); triggerFileUpload(); }}>Replace</Button>
                                                    <Button variant="destructive" size="sm" onClick={(event) => { event.stopPropagation(); setImage(''); }}>Remove</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={triggerFileUpload}
                                                className="border-2 border-dashed border-blue-100 bg-blue-50/50 rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all group min-h-[160px]"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                                    <UploadCloud className="w-6 h-6 text-blue-600" />
                                                </div>
                                                <h4 className="text-sm font-semibold text-blue-900 mb-1">Click to upload image</h4>
                                                <p className="text-xs text-blue-600/80">SVG, PNG, JPG or GIF (max. 800x400px)</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <div className="h-10"></div> {/* Spacer */}
                            </div>
                        </ScrollArea>

                        {/* Right Column: Preview */}
                        <div className="w-[45%] bg-slate-100 hidden lg:flex flex-col border-l border-slate-200">
                            <div className="p-8 h-full flex items-center justify-center">
                                <SocialPreview post={{ caption, hashtags: [], image, platforms: selectedPlatforms }} onImageClick={setLightboxImage} />
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage('')} />
        </div>
    );
};

// --- Google Ads Components ---


const GoogleAdPreview = ({ ad }: { ad: Partial<GoogleAd> }) => {
    const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');

    const validHeadlines = ad.headlines?.filter(h => h.trim() !== '') || [];
    const validDescriptions = ad.descriptions?.filter(d => d.trim() !== '') || [];
    // Handle both old and new data structures or default to empty
    const validSitelinks = ad.sitelinks?.filter(s => s.text.trim() !== '') || [];
    const validCallouts = ad.callouts?.filter(c => c.trim() !== '') || [];

    const displayHeadlines = validHeadlines.length > 0
        ? validHeadlines.map((h, i) => (
            <span key={i}>
                {h}
                {i < validHeadlines.length - 1 && <span className="mx-1">|</span>}
            </span>
        ))
        : "Headline 1 | Headline 2 | Headline 3";

    const displayDescription = validDescriptions.length > 0
        ? validDescriptions.join('. ') + '.'
        : "Description text goes here. Highlight your unique selling points and include a call to action.";

    const displayUrl = () => {
        const finalUrl = ad.finalUrl || 'example.com';
        // Extract domain
        let domain = finalUrl.replace(/^https?:\/\//, '').split('/')[0];
        if (!domain) domain = 'example.com';

        return (
            <div className="flex items-center gap-1.5 text-xs text-[#202124] mb-2">
                {/* Favicon Placeholder */}
                <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <img
                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                        alt=""
                        className="w-4 h-4 opacity-80"
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0'; }}
                    />
                </div>
                <div className="flex flex-col leading-tight">
                    <span className="font-semibold text-[13px] text-[#202124]">Sponsored</span>
                    <div className="flex items-center text-[12px] text-[#202124] gap-1">
                        <span>{domain}</span>
                        {ad.path1 && <span className="text-[#5f6368]">/{ad.path1}</span>}
                        {ad.path2 && <span className="text-[#5f6368]">/{ad.path2}</span>}
                    </div>
                </div>
                <MoreVertical className="w-4 h-4 text-slate-500 ml-auto" />
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
            {/* Preview Header / Controls */}
            <div className="bg-white border-b px-6 py-3 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Preview</span>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setDevice('mobile')}
                        className={cn("p-1.5 rounded-md transition-all", device === 'mobile' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}
                    >
                        <Smartphone className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setDevice('desktop')}
                        className={cn("p-1.5 rounded-md transition-all", device === 'desktop' ? "bg-white shadow-sm text-blue-600" : "text-slate-400 hover:text-slate-600")}
                    >
                        <Monitor className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Preview Canvas */}
            <div className="flex-1 p-8 flex items-start justify-center overflow-y-auto bg-slate-50/50">
                <div className={cn(
                    "bg-white shadow-2xl overflow-hidden transition-all duration-300 relative select-none",
                    device === 'mobile'
                        ? "w-[375px] h-[812px] rounded-[40px] border-[14px] border-[#f8fafc] shadow-[0_0_0_2px_#e2e8f0,0_20px_40px_-12px_rgba(0,0,0,0.1)] ring-1 ring-slate-100" // Hi-Fi Mist Blue Frame
                        : "w-full max-w-3xl rounded-lg min-h-[400px] border border-slate-200"
                )}>
                    {device === 'mobile' ? (
                        /* Mobile Layout (Google App-like) */
                        <div className="h-full flex flex-col bg-white">
                            {/* Status Bar */}
                            <div className="h-12 px-6 flex justify-between items-end pb-2 text-black/80 font-semibold text-[13px]">
                                <span>9:41</span>
                                <div className="flex gap-1.5 items-center">
                                    <Wifi className="w-4 h-4" />
                                    <Battery className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Google Search Header */}
                            <div className="px-6 pt-4 pb-2 flex flex-col items-center">
                                {/* Google Logo */}
                                <div className="text-[32px] font-bold mb-6 flex gap-0.5">
                                    <span className="text-[#4285F4]">G</span>
                                    <span className="text-[#EA4335]">o</span>
                                    <span className="text-[#FBBC05]">o</span>
                                    <span className="text-[#4285F4]">g</span>
                                    <span className="text-[#34A853]">l</span>
                                    <span className="text-[#EA4335]">e</span>
                                </div>

                                {/* Search Bar */}
                                <div className="w-full h-12 bg-white rounded-full border border-slate-200 shadow-sm flex items-center px-4 gap-3 mb-6">
                                    <Search className="w-5 h-5 text-slate-400" />
                                    <span className="flex-1 text-slate-500 text-sm">Search</span>
                                    <Mic className="w-5 h-5 text-blue-500" /> {/* Mic */}
                                    <ScanSearch className="w-5 h-5 text-blue-500" /> {/* Lens/Camera */}
                                </div>
                            </div>

                            {/* Content Area - Ad Card */}
                            <div className="flex-1 bg-slate-50 relative overflow-y-auto px-4 py-4 space-y-4">
                                {/* The Ad Card */}
                                <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                                    {displayUrl()}

                                    <div className="mb-2">
                                        <div className="text-[#1a0dab] text-[18px] leading-[24px] font-medium mb-1 cursor-pointer">
                                            {displayHeadlines}
                                        </div>
                                        <div className="text-[14px] leading-[20px] text-[#4d5156]">
                                            {displayDescription}
                                            {validCallouts.length > 0 && (
                                                <span className="ml-1 text-[#4d5156]">
                                                    {validCallouts.join('  ')}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Sitelinks - Mobile Grid */}
                                    {validSitelinks.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                            <div className="grid grid-cols-2 gap-3">
                                                {validSitelinks.slice(0, 4).map((link, i) => (
                                                    <div key={i} className="flex flex-col">
                                                        <div className="text-[#1a0dab] text-[13px] font-medium truncate">{link.text}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Placeholder Organic Results */}
                                <div className="space-y-4 opacity-50 blur-[1px]">
                                    {[1, 2].map(i => (
                                        <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                                            <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
                                            <div className="h-4 w-3/4 bg-blue-100 rounded mb-2" />
                                            <div className="h-10 w-full bg-slate-100 rounded" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Bottom Nav */}
                            <div className="h-16 bg-white border-t flex justify-around items-center text-xs text-slate-500 font-medium">
                                <div className="flex flex-col items-center gap-1 text-blue-600">
                                    <Home className="w-5 h-5" />
                                    <span>Home</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <Search className="w-5 h-5" />
                                    <span>Search</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <Bell className="w-5 h-5" />
                                    <span>Saved</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Desktop Layout (Kept similar but cleaned up) */
                        <div className="w-full bg-white h-full flex flex-col">
                            {/* Browser Bar */}
                            <div className="bg-slate-50 border-b p-3 flex items-center gap-3">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                </div>
                                <div className="flex-1 bg-white border h-6 rounded px-3 text-[10px] flex items-center text-slate-400 shadow-sm">
                                    google.com/search?q=your+keyword
                                </div>
                            </div>

                            <div className="p-8 font-sans text-left max-w-[650px]">
                                <div className="mb-6">
                                    {displayUrl()}
                                    <div className="text-[#1a0dab] text-[20px] leading-[26px] cursor-pointer hover:underline mb-1">
                                        {displayHeadlines}
                                    </div>
                                    <div className="text-[14px] leading-[22px] text-[#4d5156]">
                                        {displayDescription}
                                        {validCallouts.length > 0 && (
                                            <span className="ml-1 text-[#4d5156]">
                                                {validCallouts.join('  ')}
                                            </span>
                                        )}
                                    </div>
                                    {validSitelinks.length > 0 && (
                                        <div className="mt-2 flex gap-4">
                                            {validSitelinks.slice(0, 4).map((link, i) => (
                                                <div key={i} className="mb-1 max-w-[45%]">
                                                    <div className="text-[#1a0dab] text-sm hover:underline cursor-pointer truncate font-medium">
                                                        {link.text}
                                                    </div>
                                                    {link.desc1 && (
                                                        <div className="text-xs text-slate-500 line-clamp-1">{link.desc1}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-8 opacity-30 select-none pointer-events-none">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="max-w-[600px]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="w-7 h-7 rounded-full bg-slate-200" />
                                                <div className="h-3 w-32 bg-slate-200 rounded" />
                                            </div>
                                            <div className="h-5 w-2/3 bg-blue-100 rounded mb-2" />
                                            <div className="h-3 w-full bg-slate-100 rounded mb-1" />
                                            <div className="h-3 w-5/6 bg-slate-100 rounded" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const GoogleAdsTab = ({ campaignId, autoCreate }: { campaignId: string, autoCreate?: boolean }) => {
    const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const googleAds = (dbItems || []).filter(i => i.type === 'google-ad').map(i => ({ id: i.id, campaignId: i.campaignId, name: i.name, status: i.status, ...i.payload, createdAt: i.createdAt }));
    // State
    const [isDialogOpen, setIsDialogOpen] = useState(autoCreate || false);
    const [editingAd, setEditingAd] = useState<GoogleAd | null>(null);
    const [name, setName] = useState('New Search Ad');
    const [isEditingName, setIsEditingName] = useState(false);
    const [startDate, setStartDate] = useState<Date | undefined>(undefined);

    // Form Fields
    const [finalUrl, setFinalUrl] = useState('');
    const [path1, setPath1] = useState('');
    const [path2, setPath2] = useState('');
    const [headlines, setHeadlines] = useState<string[]>(['', '', '']);
    const [descriptions, setDescriptions] = useState<string[]>(['', '']);
    const [sitelinks, setSitelinks] = useState<{ text: string, desc1?: string }[]>([]);
    const [callouts, setCallouts] = useState<string[]>([]);
    const [topic, setTopic] = useState('');

    // Safeguard against undefined googleAds during HMR or initialization
    const ads = (googleAds || []).filter(a => a.campaignId === campaignId);

    const handleOpen = (ad?: GoogleAd) => {
        if (ad) {
            setEditingAd(ad);
            setName(ad.name || 'New Search Ad');
            setStartDate(toValidDate(ad.startDate));
            setFinalUrl(ad.finalUrl || '');
            setPath1(ad.path1 || '');
            setPath2(ad.path2 || '');
            setHeadlines(ad.headlines?.length ? ad.headlines : ['', '', '']);
            setDescriptions(ad.descriptions?.length ? ad.descriptions : ['', '']);
            setTopic(ad.topic || '');
        } else {
            setEditingAd(null);
            setName('New Search Ad');
            setStartDate(undefined);
            setFinalUrl('');
            setPath1('');
            setPath2('');
            setHeadlines(['', '', '']); // Start with 3 suggested
            setDescriptions(['', '']); // Start with 2 suggested
            setTopic('');
        }
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        const adData = {
            campaignId,
            name,
            startDate: startDate ? startDate.toISOString() : undefined,
            finalUrl,
            path1,
            path2,
            headlines: headlines.filter(h => h.trim() !== ''),
            descriptions: descriptions.filter(d => d.trim() !== ''),
            sitelinks: sitelinks.filter(s => s.text.trim() !== ''),
            callouts: callouts.filter(c => c.trim() !== ''),
            topic,
            status: 'active' as const,
        };

        if (editingAd) {
            updateContentItem.mutate({ id: editingAd.id, updates: { name, payload: adData } });
        } else {
            addContentItem.mutate({ type: 'google-ad', name, payload: adData });
        }
        setIsDialogOpen(false);
    };

    // Helper to update specific index needed for array inputs
    const updateHeadline = (index: number, value: string) => {
        const newHeadlines = [...headlines];
        newHeadlines[index] = value;
        setHeadlines(newHeadlines);
    };

    const addHeadlineField = () => {
        if (headlines.length < 15) setHeadlines([...headlines, '']);
    };

    const updateDescription = (index: number, value: string) => {
        const newDescriptions = [...descriptions];
        newDescriptions[index] = value;
        setDescriptions(newDescriptions);
    };

    const addDescriptionField = () => {
        if (descriptions.length < 4) setDescriptions([...descriptions, '']);
    };

    const removeHeadline = (index: number) => {
        setHeadlines(headlines.filter((_, i) => i !== index));
    };

    const removeDescription = (index: number) => {
        setDescriptions(descriptions.filter((_, i) => i !== index));
    };

    const addSitelink = () => setSitelinks([...sitelinks, { text: '', desc1: '' }]);
    const updateSitelink = (index: number, field: 'text' | 'desc1', value: string) => {
        const newLinks = [...sitelinks];
        newLinks[index] = { ...newLinks[index], [field]: value };
        setSitelinks(newLinks);
    };
    const removeSitelink = (index: number) => setSitelinks(sitelinks.filter((_, i) => i !== index));

    const addCallout = () => setCallouts([...callouts, '']);
    const updateCallout = (index: number, value: string) => {
        const newCallouts = [...callouts];
        newCallouts[index] = value;
        setCallouts(newCallouts);
    };
    const removeCallout = (index: number) => setCallouts(callouts.filter((_, i) => i !== index));

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Google Search Ads</h3>
                    <p className="text-sm text-muted-foreground">Manage your responsive search ads and keywords.</p>
                </div>
                <Button onClick={() => handleOpen()} className="gap-2 rounded-full"><Plus className="w-4 h-4" /> New Ad</Button>
            </div>

            {ads.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed rounded-xl bg-slate-50/50">
                    <p className="text-muted-foreground mb-4">No ads created yet. Start your first search campaign!</p>
                    <Button onClick={() => handleOpen()} variant="outline">Create Google Ad</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {ads.map(ad => (
                        <Card key={ad.id} className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-muted relative" onClick={() => handleOpen(ad)}>
                            {/* Visual Header (Mimics Image Placeholder) */}
                            <div className="bg-blue-50/50 h-48 flex items-center justify-center text-blue-200 relative overflow-hidden text-center p-4">
                                <div className="flex flex-col items-center gap-3 transition-transform group-hover:scale-105">
                                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                        <Search className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <p className="text-xs font-medium text-blue-400">Google Search Ad</p>
                                </div>
                                <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button variant="secondary" size="sm" className="gap-2 shadow-sm bg-white hover:bg-slate-50">Edit Ad</Button>
                                </div>
                            </div>

                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-3">
                                    <Badge variant="outline" className="text-[10px] font-normal bg-blue-50 text-blue-600 border-blue-100">
                                        {formatDateLabel(ad.startDate || ad.createdAt, 'MMM d, yyyy', 'No date')}
                                    </Badge>
                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-[8px] border-2 border-white text-white" title="Active">
                                        G
                                    </div>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900 line-clamp-1 mb-1">
                                    {ad.name || 'Untitled Ad'}
                                </h4>
                            </CardContent>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-2 right-2 h-7 w-7 bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                onClick={(e) => { e.stopPropagation(); deleteContentItem.mutate(ad.id); }}
                            >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                        </Card>
                    ))}
                </div>
            )}

            {/* Google Ads Editor Modal */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[1200px] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden bg-slate-50">
                    <div className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-20 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-100 p-2 rounded-lg"><Search className="w-5 h-5 text-blue-600" /></div>
                            <div>
                                {isEditingName ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="h-8 text-lg font-bold w-64"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                                        />
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => setIsEditingName(false)}>
                                            <Check className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                                        <DialogTitle className="text-lg font-bold text-gray-900">{name}</DialogTitle>
                                        <Pencil className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                )}
                                <DialogDescription className="text-xs text-muted-foreground m-0">Responsive Search Ad</DialogDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">Save Ad</Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex">
                        {/* Editor Column */}
                        <ScrollArea className="flex-1 border-r border-slate-200 bg-slate-50/50">
                            <div className="p-8 space-y-6 max-w-2xl mx-auto">

                                {/* Schedule Date */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <Label className="text-sm font-semibold text-slate-700 mb-3 block">Start Date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal bg-slate-50 border-slate-200",
                                                        !startDate && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {startDate ? format(startDate, "d MMM yyyy") : <span>Pick a start date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={startDate}
                                                    onSelect={setStartDate}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </CardContent>
                                </Card>

                                {/* Topic / Idea */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6">
                                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Topic / Idea</Label>
                                        <Textarea
                                            placeholder="Describe your ad concept, target keywords, or key message..."
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            className="min-h-[80px] resize-none"
                                        />
                                    </CardContent>
                                </Card>

                                {/* Final URL & Paths */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardContent className="p-6 space-y-4">
                                        <div>
                                            <Label className="text-sm font-semibold text-slate-700 mb-1.5 block">Final URL</Label>
                                            <Input
                                                placeholder="https://www.example.com/landing-page"
                                                value={finalUrl}
                                                onChange={(e) => setFinalUrl(e.target.value)}
                                                className="bg-slate-50"
                                            />
                                            <p className="text-[11px] text-slate-400 mt-1">Make sure people land on exactly what they were looking for.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <Label className="text-sm font-semibold text-slate-700 mb-1.5 block">Display Path 1</Label>
                                                <Input
                                                    placeholder="Services"
                                                    value={path1}
                                                    maxLength={15}
                                                    onChange={(e) => setPath1(e.target.value)}
                                                    className="bg-slate-50"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-sm font-semibold text-slate-700 mb-1.5 block">Display Path 2</Label>
                                                <Input
                                                    placeholder="Consulting"
                                                    value={path2}
                                                    maxLength={15}
                                                    onChange={(e) => setPath2(e.target.value)}
                                                    className="bg-slate-50"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Headlines */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-base font-bold text-slate-800">Headlines</CardTitle>
                                            <span className="text-xs text-slate-500">{headlines.length}/15</span>
                                        </div>
                                        <p className="text-xs text-slate-500">Provide up to 15 headlines. Google will show highly relevant ones.</p>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-3">
                                        {headlines.map((headline, index) => (
                                            <div key={index} className="flex gap-2 items-center group">
                                                <div className="relative flex-1">
                                                    <Input
                                                        placeholder={`Headline ${index + 1}`}
                                                        value={headline}
                                                        maxLength={30}
                                                        onChange={(e) => updateHeadline(index, e.target.value)}
                                                    />
                                                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 text-[10px]">{headline.length}/30</span>
                                                </div>
                                                {headlines.length > 3 && (
                                                    <Button variant="ghost" size="icon" onClick={() => removeHeadline(index)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        {headlines.length < 15 && (
                                            <Button variant="ghost" size="sm" onClick={addHeadlineField} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full border border-dashed border-blue-200">
                                                <Plus className="w-4 h-4 mr-2" /> Add Headline
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Descriptions */}
                                <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                    <CardHeader className="pb-2">
                                        <div className="flex justify-between items-center">
                                            <CardTitle className="text-base font-bold text-slate-800">Descriptions</CardTitle>
                                            <span className="text-xs text-slate-500">{descriptions.length}/4</span>
                                        </div>
                                        <p className="text-xs text-slate-500">Add up to 4 descriptions. Highlights your unique details.</p>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-3">
                                        {descriptions.map((desc, index) => (
                                            <div key={index} className="flex gap-2 items-start group">
                                                <div className="relative flex-1">
                                                    <Textarea
                                                        placeholder={`Description ${index + 1}`}
                                                        value={desc}
                                                        maxLength={90}
                                                        onChange={(e) => updateDescription(index, e.target.value)}
                                                        className="min-h-[80px] resize-none"
                                                    />
                                                    <span className="absolute right-3 bottom-2 text-xs text-slate-400 text-[10px]">{desc.length}/90</span>
                                                </div>
                                                {descriptions.length > 2 && (
                                                    <Button variant="ghost" size="icon" onClick={() => removeDescription(index)} className="mt-2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:bg-red-50">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                        {descriptions.length < 4 && (
                                            <Button variant="ghost" size="sm" onClick={addDescriptionField} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 w-full border border-dashed border-blue-200">
                                                <Plus className="w-4 h-4 mr-2" /> Add Description
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>

                                <Separator />

                                <section className="space-y-4">
                                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                        Sitelinks
                                        <Popover>
                                            <PopoverTrigger><Info className="w-4 h-4 text-slate-400 hover:text-blue-600" /></PopoverTrigger>
                                            <PopoverContent className="text-xs w-60">Add links to specific pages on your site (e.g., 'Contact Us', 'Sale'). Improves CTR.</PopoverContent>
                                        </Popover>
                                    </h4>
                                    <div className="space-y-4">
                                        {sitelinks.map((link, index) => (
                                            <Card key={index} className="bg-slate-50 border-slate-200">
                                                <CardContent className="p-4 space-y-3 relative group">
                                                    <Button variant="ghost" size="icon" onClick={() => removeSitelink(index)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-red-400">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                    <Input placeholder="Link Text (e.g., Contact Us)" value={link.text} onChange={e => updateSitelink(index, 'text', e.target.value)} maxLength={25} className="bg-white" />
                                                    <Input placeholder="Description Line 1 (Optional)" value={link.desc1} onChange={e => updateSitelink(index, 'desc1', e.target.value)} maxLength={35} className="bg-white" />
                                                </CardContent>
                                            </Card>
                                        ))}
                                        <Button variant="outline" size="sm" onClick={addSitelink} className="w-full border-dashed"><Plus className="w-4 h-4 mr-2" /> Add Sitelink</Button>
                                    </div>
                                </section>

                                <section className="space-y-4">
                                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                        Callouts
                                        <Popover>
                                            <PopoverTrigger><Info className="w-4 h-4 text-slate-400 hover:text-blue-600" /></PopoverTrigger>
                                            <PopoverContent className="text-xs w-60">Short, non-clickable text to highlight offers (e.g., 'Free Shipping', '24/7 Support').</PopoverContent>
                                        </Popover>
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {callouts.map((callout, index) => (
                                            <div key={index} className="relative group">
                                                <Input
                                                    placeholder="e.g. Free Shipping"
                                                    value={callout}
                                                    maxLength={25}
                                                    onChange={(e) => updateCallout(index, e.target.value)}
                                                />
                                                <Button variant="ghost" size="icon" onClick={() => removeCallout(index)} className="absolute right-1 top-1 h-8 w-8 opacity-0 group-hover:opacity-100 text-red-400">
                                                    <X className="w-3 h-3" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" size="sm" onClick={addCallout} className="border-dashed h-10"><Plus className="w-4 h-4 mr-2" /> Add Callout</Button>
                                    </div>
                                </section>
                                <div className="h-10"></div>
                            </div>
                        </ScrollArea>

                        {/* Preview Column */}
                        <div className="w-[45%] bg-slate-100 hidden lg:flex flex-col border-l border-slate-200 items-center justify-center p-8">
                            <div className="mb-6 text-center">
                                <h3 className="font-semibold text-slate-700">Ad Preview</h3>
                                <p className="text-sm text-slate-500">See how your ad might look on Google Search.</p>
                            </div>
                            <GoogleAdPreview ad={{ finalUrl, path1, path2, headlines, descriptions, sitelinks, callouts }} />

                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

const SocialAdsTab = ({ campaignId, autoCreate, brandVisualContext }: { campaignId: string, autoCreate?: boolean, brandVisualContext: BrandVisualContext }) => {
    const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const socialAds = (dbItems || []).filter(i => i.type === 'social-ad').map(i => ({
        id: i.id,
        campaignId: i.campaignId,
        name: i.name,
        status: i.status,
        ...i.payload,
        platform: normalizeSocialPlatform(i.payload.platform),
        cta: normalizeSocialAdCta(i.payload.cta),
        primaryText: payloadString(i.payload, ['primaryText', 'primary_text', 'primaryCopy', 'primary_copy', 'adCopy', 'ad_copy', 'body', 'copy', 'text', 'content', 'caption'], i.name || 'Paid social draft'),
        headline: payloadString(i.payload, ['headline', 'title', 'hook'], i.name || 'Paid social draft'),
        description: payloadString(i.payload, ['description', 'supporting_text'], ''),
        visualGuide: visualGuideFromPayload(i.payload),
        generatedImages: generatedImagesFromPayload(i.payload),
        imageAspectRatio: payloadString(i.payload, ['imageAspectRatio', 'image_aspect_ratio'], '1:1'),
        useBrandGuide: i.payload.useBrandGuide === true || i.payload.use_brand_guide === true,
    }));
    const { toast } = useToast();
    const campaignAds = socialAds.filter(ad => ad.campaignId === campaignId);

    const [isDialogOpen, setIsDialogOpen] = useState(autoCreate || false);
    const [editingAd, setEditingAd] = useState<SocialAd | null>(null);

    // Form state
    const [name, setName] = useState('New Social Ad');
    const [isEditingName, setIsEditingName] = useState(false);
    const [platform, setPlatform] = useState<'linkedin' | 'twitter' | 'instagram' | 'facebook'>('facebook');
    const [primaryText, setPrimaryText] = useState('');
    const [headline, setHeadline] = useState('');
    const [description, setDescription] = useState('');
    const [visualGuide, setVisualGuide] = useState('');
    const [image, setImage] = useState('');
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');
    const [useBrandGuide, setUseBrandGuide] = useState(false);
    const [lightboxImage, setLightboxImage] = useState('');
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [cta, setCta] = useState<'learn_more' | 'sign_up' | 'shop_now' | 'contact_us' | 'download'>('learn_more');
    const [destinationUrl, setDestinationUrl] = useState('');
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
    const [topic, setTopic] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleOpen = (ad?: SocialAd) => {
        if (ad) {
            setEditingAd(ad);
            setName(ad.name || 'New Social Ad');
            setPlatform(normalizeSocialPlatform(ad.platform));
            setPrimaryText(ad.primaryText || '');
            setHeadline(ad.headline || '');
            setDescription(ad.description || '');
            setVisualGuide(ad.visualGuide || '');
            setImage(ad.image || '');
            setGeneratedImages(uniqueImages([...(ad.generatedImages || []), ad.image || '']));
            setSelectedAspectRatio(ad.imageAspectRatio || '1:1');
            setUseBrandGuide(ad.useBrandGuide === true);
            setCta(normalizeSocialAdCta(ad.cta));
            setDestinationUrl(ad.destinationUrl || '');
            setScheduledDate(toValidDate(ad.scheduledDate));
            setTopic(ad.topic || '');
        } else {
            setEditingAd(null);
            setName('New Social Ad');
            setPlatform('facebook');
            setPrimaryText('');
            setHeadline('');
            setDescription('');
            setVisualGuide('');
            setImage('');
            setGeneratedImages([]);
            setSelectedAspectRatio('1:1');
            setUseBrandGuide(false);
            setCta('learn_more');
            setDestinationUrl('');
            setScheduledDate(undefined);
            setTopic('');
        }
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        const adData = {
            campaignId,
            name,
            platform,
            primaryText,
            headline,
            description,
            visualGuide,
            image,
            generatedImages,
            imageAspectRatio: selectedAspectRatio,
            useBrandGuide,
            cta,
            destinationUrl,
            scheduledDate: scheduledDate ? scheduledDate.toISOString() : undefined,
            topic,
            status: 'draft' as const,
        };

        if (editingAd) {
            updateContentItem.mutate({ id: editingAd.id, updates: { name, payload: adData } });
        } else {
            addContentItem.mutate({ type: 'social-ad', name, payload: adData });
        }
        setIsDialogOpen(false);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleGenerateImage = async () => {
        setIsGeneratingImage(true);
        try {
            const imageUrl = await generateVisualAsset(visualGuide, {
                kind: 'social-ad',
                name,
                topic,
                platform,
                primaryText,
                headline,
                description,
                cta,
                destinationUrl,
                aspectRatio: selectedAspectRatio,
                useBrandGuide,
                brandGuide: useBrandGuide ? brandVisualContext : null,
            });
            setImage(imageUrl);
            setGeneratedImages((current) => uniqueImages([imageUrl, ...current]));
            toast({
                title: 'Image generated',
                description: 'The generated image has been placed in the ad preview.',
            });
        } catch (error) {
            toast({
                title: 'Image generation failed',
                description: error instanceof Error ? error.message : 'Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const ctaOptions = [
        { value: 'learn_more', label: 'Learn More' },
        { value: 'sign_up', label: 'Sign Up' },
        { value: 'shop_now', label: 'Shop Now' },
        { value: 'contact_us', label: 'Contact Us' },
        { value: 'download', label: 'Download' },
    ];

    const platformSpecs = {
        linkedin: { name: 'LinkedIn', color: '#0A66C2', textLimit: 150, headlineLimit: 70 },
        twitter: { name: 'Twitter (X)', color: '#1D9BF0', textLimit: 280, headlineLimit: 70 },
        instagram: { name: 'Instagram', color: '#E1306C', textLimit: 125, headlineLimit: 40 },
        facebook: { name: 'Facebook', color: '#0866FF', textLimit: 125, headlineLimit: 40 },
    };

    // Full Ad Preview Component (matching SocialPreview style)
    const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

    const AD_PLATFORM_SPECS = {
        linkedin: { name: 'LinkedIn', color: '#0A66C2', textLimit: 150, headlineLimit: 70, ratios: ['1.91:1 (Landscape)', '1:1 (Square)', '4:5 (Portrait)'], bestFor: 'Professional B2B advertising, lead generation.' },
        twitter: { name: 'Twitter (X)', color: '#1D9BF0', textLimit: 280, headlineLimit: 70, ratios: ['1.91:1 (Landscape)', '1:1 (Square)'], bestFor: 'Awareness campaigns, trending topics.' },
        instagram: { name: 'Instagram', color: '#E1306C', textLimit: 125, headlineLimit: 40, ratios: ['4:5 (Portrait)', '1:1 (Square)'], bestFor: 'Visual storytelling, product showcases.' },
        facebook: { name: 'Facebook', color: '#0866FF', textLimit: 125, headlineLimit: 40, ratios: ['1:1 (Square)', '4:5 (Portrait)'], bestFor: 'Broad reach, retargeting, conversions.' },
    };

    const currentSpec = AD_PLATFORM_SPECS[platform];

    const AdPreview = () => (
        <div className="flex flex-col h-full bg-slate-50/50 rounded-xl overflow-hidden border border-slate-100">
            {/* Preview Header / Navbar */}
            <div className="flex flex-col gap-4 items-center justify-center p-4 border-b bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex w-full items-center justify-between max-w-[550px]">
                    <div className="flex gap-2">
                        {(['linkedin', 'twitter', 'instagram', 'facebook'] as const).map((p) => (
                            <PlatformIcon key={p} platform={p} size="lg" active={platform === p} onClick={() => setPlatform(p)} />
                        ))}
                    </div>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2 text-slate-600 border-slate-200">
                                <Info className="w-4 h-4" /> Specs <ChevronDown className="w-3 h-3 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="end">
                            <div className="p-4 bg-slate-50 border-b">
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 rounded-full" style={{ background: currentSpec.color }} />
                                    <h4 className="font-semibold">{currentSpec.name} Ad Specs</h4>
                                </div>
                                <p className="text-xs text-muted-foreground">{currentSpec.bestFor}</p>
                            </div>
                            <div className="p-4 space-y-3 text-sm">
                                <div>
                                    <span className="text-xs font-medium text-slate-500 uppercase">Aspect Ratios</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {currentSpec.ratios.map(r => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-xs font-medium text-slate-500 uppercase">Text Limits</span>
                                    <p className="mt-1">Primary: ~{currentSpec.textLimit} chars | Headline: ~{currentSpec.headlineLimit} chars</p>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewDevice('desktop')}
                        className={cn("h-7 gap-2 rounded-md transition-all text-xs font-medium", previewDevice === 'desktop' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        <Monitor className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewDevice('mobile')}
                        className={cn("h-7 gap-2 rounded-md transition-all text-xs font-medium", previewDevice === 'mobile' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                    >
                        <Smartphone className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto flex items-start justify-center bg-slate-100/50">
                {/* Device Frame Wrapper */}
                <div className={cn(
                    "bg-white shadow-2xl overflow-hidden transition-all duration-300 relative select-none",
                    previewDevice === 'mobile'
                        ? "w-[375px] h-[812px] rounded-[40px] border-[14px] border-[#f8fafc] shadow-[0_0_0_2px_#e2e8f0,0_20px_40px_-12px_rgba(0,0,0,0.1)] ring-1 ring-slate-100"
                        : "w-full max-w-4xl rounded-xl min-h-[600px] border border-slate-200 shadow-xl"
                )}>
                    {/* Screen Content Wrapper */}
                    <div className={cn("h-full flex flex-col", previewDevice === 'mobile' ? "bg-white" : "bg-slate-50")}>

                        {/* Status Bar / Browser Bar */}
                        {previewDevice === 'mobile' ? (
                            <div className="h-12 px-6 flex justify-between items-end pb-2 text-black/80 font-semibold text-[13px] shrink-0 bg-white z-20">
                                <span>9:41</span>
                                <div className="flex gap-1.5 items-center">
                                    <Wifi className="w-4 h-4" />
                                    <Battery className="w-4 h-4" />
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border-b p-3 flex items-center gap-3 shrink-0">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                                </div>
                                <div className="flex-1 bg-slate-50 border h-7 rounded-md px-3 text-[11px] flex items-center text-slate-400 font-medium">
                                    {platform}.com
                                </div>
                            </div>
                        )}

                        {/* Scrollable Content Area */}
                        <div className="flex-1 overflow-y-auto no-scrollbar relative bg-slate-50/50">
                            <div className={cn("min-h-full p-4 flex flex-col items-center", previewDevice === 'desktop' && "p-8")}>
                                {/* The Ad Card */}
                                <div className={cn(
                                    "bg-white rounded-xl shadow-sm border border-slate-200 transition-all duration-300 overflow-hidden shrink-0",
                                    previewDevice === 'mobile' ? "w-full" : "w-full max-w-[500px]"
                                )}>

                                    {/* === INSTAGRAM LAYOUT === */}
                                    {/* Order: Header → Media → CTA Banner → Engagement → Caption */}
                                    {platform === 'instagram' && (
                                        <>
                                            {/* Header */}
                                            <div className="p-3 flex gap-3 items-center">
                                                <Avatar className="w-8 h-8 ring-2 ring-pink-100">
                                                    <AvatarFallback className="bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 text-white text-xs">MP</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-sm text-gray-900 leading-tight">marketing_pro</h4>
                                                    <p className="text-[10px] text-slate-500">Sponsored</p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreHorizontal className="w-4 h-4" /></Button>
                                            </div>

                                            {/* Media FIRST for Instagram */}
                                            {image ? (
                                                <button type="button" className="w-full aspect-square bg-slate-100 overflow-hidden cursor-zoom-in" onClick={() => setLightboxImage(image)}>
                                                    <img src={image} alt="Ad content" className="w-full h-full object-cover" />
                                                </button>
                                            ) : (
                                                <div className="w-full aspect-square bg-slate-50 flex flex-col items-center justify-center gap-3">
                                                    <ImageIcon className="w-8 h-8 text-slate-300" />
                                                    <p className="text-xs text-slate-400">No media</p>
                                                </div>
                                            )}

                                            {/* CTA Banner - Full width below image */}
                                            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                                                <span className="font-semibold text-sm">{ctaOptions.find(c => c.value === cta)?.label}</span>
                                                <ChevronRight className="w-5 h-5" />
                                            </div>

                                            {/* Engagement */}
                                            <div className="px-4 pt-3 pb-2 space-y-2">
                                                <div className="flex justify-between">
                                                    <div className="flex gap-4">
                                                        <Heart className="w-6 h-6 hover:text-red-500 cursor-pointer transition-colors" />
                                                        <MessageCircle className="w-6 h-6 -rotate-90 hover:text-slate-600 cursor-pointer" />
                                                        <Send className="w-6 h-6 hover:text-slate-600 cursor-pointer" />
                                                    </div>
                                                    <Share2 className="w-6 h-6 hover:text-slate-600 cursor-pointer" />
                                                </div>
                                                <div className="text-sm font-semibold text-gray-900">124 likes</div>
                                            </div>

                                            {/* Caption BELOW for Instagram */}
                                            <div className="px-4 pb-4">
                                                <div className="text-sm">
                                                    <span className="font-bold mr-2 text-gray-900">marketing_pro</span>
                                                    <span className="text-gray-700">{primaryText || 'Your ad caption will appear here...'}</span>
                                                </div>
                                                {headline && <p className="text-sm text-blue-900 mt-1">{headline}</p>}
                                            </div>
                                        </>
                                    )}

                                    {/* === FACEBOOK LAYOUT === */}
                                    {/* Order: Header → Text → Media → CTA Bar → Engagement */}
                                    {platform === 'facebook' && (
                                        <>
                                            {/* Header */}
                                            <div className="p-4 flex gap-3 items-center">
                                                <Avatar className="w-10 h-10 ring-1 ring-slate-100">
                                                    <AvatarFallback className="bg-[#0866FF] text-white text-xs">MP</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm text-gray-900 leading-tight">Marketing Pro</h4>
                                                    <p className="text-xs text-slate-500 leading-tight flex items-center gap-1">Sponsored • <Globe className="w-3 h-3" /></p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreHorizontal className="w-4 h-4" /></Button>
                                            </div>

                                            {/* Primary Text ABOVE media */}
                                            <div className="px-4 pb-3">
                                                <p className="text-[15px] text-gray-900 whitespace-pre-wrap leading-relaxed">
                                                    {primaryText || 'Your ad copy will appear here...'}
                                                </p>
                                            </div>

                                            {/* Media */}
                                            {image ? (
                                                <button type="button" className="w-full aspect-square bg-slate-100 overflow-hidden border-y border-slate-100 cursor-zoom-in" onClick={() => setLightboxImage(image)}>
                                                    <img src={image} alt="Ad content" className="w-full h-full object-cover" />
                                                </button>
                                            ) : (
                                                <div className="w-full aspect-square bg-slate-50 flex flex-col items-center justify-center gap-3 border-y border-slate-100">
                                                    <ImageIcon className="w-8 h-8 text-slate-300" />
                                                    <p className="text-xs text-slate-400">No media</p>
                                                </div>
                                            )}

                                            {/* CTA Bar - Facebook style with headline/description/button */}
                                            <div className="p-4 bg-slate-50 border-t">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        {destinationUrl && <p className="text-xs text-slate-400 truncate uppercase">{destinationUrl.replace(/^https?:\/\//, '').split('/')[0]}</p>}
                                                        <p className="text-sm font-semibold text-slate-900 truncate">{headline || 'Your Headline'}</p>
                                                        {description && <p className="text-xs text-slate-500 truncate">{description}</p>}
                                                    </div>
                                                    <Button size="sm" className="bg-[#0866FF] hover:bg-[#0866FF]/90 text-white text-xs shrink-0 rounded-md">
                                                        {ctaOptions.find(c => c.value === cta)?.label}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Engagement */}
                                            <div className="px-4">
                                                <div className="flex items-center justify-between py-2 text-xs text-slate-500 border-b border-slate-100">
                                                    <div className="flex items-center gap-1">
                                                        <div className="flex -space-x-1">
                                                            <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center"><ThumbsUp className="w-2.5 h-2.5 text-white" /></div>
                                                            <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"><Heart className="w-2.5 h-2.5 text-white fill-current" /></div>
                                                        </div>
                                                        <span>124</span>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <span>42 comments</span>
                                                        <span>8 shares</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between py-1">
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100"><ThumbsUp className="w-4 h-4" /> Like</Button>
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100"><MessageCircle className="w-4 h-4" /> Comment</Button>
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100"><Share2 className="w-4 h-4" /> Share</Button>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* === LINKEDIN LAYOUT === */}
                                    {/* Order: Header → Text → Media → CTA Bar → Engagement */}
                                    {platform === 'linkedin' && (
                                        <>
                                            {/* Header */}
                                            <div className="p-4 flex gap-3 items-center">
                                                <Avatar className="w-12 h-12 ring-1 ring-slate-100">
                                                    <AvatarFallback className="bg-[#0A66C2] text-white text-sm font-bold">MP</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm text-gray-900 leading-tight">Marketing Pro</h4>
                                                    <p className="text-xs text-slate-500 leading-tight">Promoted</p>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreHorizontal className="w-4 h-4" /></Button>
                                            </div>

                                            {/* Primary Text ABOVE media */}
                                            <div className="px-4 pb-3">
                                                <p className="text-[15px] text-gray-900 whitespace-pre-wrap leading-relaxed">
                                                    {primaryText || 'Your ad copy will appear here...'}
                                                </p>
                                            </div>

                                            {/* Media */}
                                            {image ? (
                                                <button type="button" className="w-full aspect-[1.91/1] bg-slate-100 overflow-hidden border-y border-slate-100 cursor-zoom-in" onClick={() => setLightboxImage(image)}>
                                                    <img src={image} alt="Ad content" className="w-full h-full object-cover" />
                                                </button>
                                            ) : (
                                                <div className="w-full aspect-[1.91/1] bg-slate-50 flex flex-col items-center justify-center gap-3 border-y border-slate-100">
                                                    <ImageIcon className="w-8 h-8 text-slate-300" />
                                                    <p className="text-xs text-slate-400">No media</p>
                                                </div>
                                            )}

                                            {/* CTA Bar - LinkedIn style */}
                                            <div className="p-4 bg-slate-50 border-t">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <p className="text-sm font-semibold text-slate-900 truncate">{headline || 'Your Headline'}</p>
                                                        {destinationUrl && <p className="text-xs text-slate-400 truncate">{destinationUrl.replace(/^https?:\/\//, '').split('/')[0]}</p>}
                                                    </div>
                                                    <Button size="sm" className="bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white text-xs shrink-0 rounded-full px-4">
                                                        {ctaOptions.find(c => c.value === cta)?.label}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Engagement */}
                                            <div className="px-4 py-2">
                                                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                                                    <div className="flex items-center gap-1">
                                                        <div className="w-4 h-4 bg-[#0A66C2] rounded-full flex items-center justify-center text-white text-[8px]"><ThumbsUp className="w-2 h-2" /></div>
                                                        <div className="w-4 h-4 bg-[#EB4F38] rounded-full flex items-center justify-center text-white text-[8px]"><Heart className="w-2 h-2 fill-current" /></div>
                                                        <span className="ml-1 hover:text-blue-600 hover:underline cursor-pointer">124</span>
                                                    </div>
                                                    <span>42 comments • 6 reposts</span>
                                                </div>
                                                <div className="flex items-center justify-between border-t pt-1">
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><ThumbsUp className="w-5 h-5" /><span className="text-xs font-medium">Like</span></Button>
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><MessageCircle className="w-5 h-5" /><span className="text-xs font-medium">Comment</span></Button>
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><Repeat className="w-5 h-5" /><span className="text-xs font-medium">Repost</span></Button>
                                                    <Button variant="ghost" className="flex-1 gap-2 text-slate-600 hover:bg-slate-100 flex-col py-3 h-auto gap-0.5"><Send className="w-5 h-5" /><span className="text-xs font-medium">Send</span></Button>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* === TWITTER (X) LAYOUT === */}
                                    {/* Order: Header → Text → Media Card with CTA → Actions */}
                                    {platform === 'twitter' && (
                                        <>
                                            {/* Header */}
                                            <div className="p-4 flex gap-3 items-start">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarFallback className="bg-black text-white text-xs">MP</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1">
                                                        <h4 className="font-bold text-sm text-gray-900">Marketing Pro</h4>
                                                        <span className="text-slate-500 text-sm">@marketing_pro</span>
                                                    </div>

                                                    {/* Primary Text ABOVE media */}
                                                    <p className="text-[15px] text-gray-900 mt-1 whitespace-pre-wrap leading-relaxed">
                                                        {primaryText || 'Your ad copy will appear here...'}
                                                    </p>

                                                    {/* Website Card - Twitter style (media + headline as card) */}
                                                    <div className="mt-3 border border-slate-200 rounded-2xl overflow-hidden">
                                                        {image ? (
                                                            <button type="button" className="w-full aspect-[1.91/1] bg-slate-100 overflow-hidden cursor-zoom-in" onClick={() => setLightboxImage(image)}>
                                                                <img src={image} alt="Ad content" className="w-full h-full object-cover" />
                                                            </button>
                                                        ) : (
                                                            <div className="w-full aspect-[1.91/1] bg-slate-50 flex flex-col items-center justify-center gap-3">
                                                                <ImageIcon className="w-8 h-8 text-slate-300" />
                                                                <p className="text-xs text-slate-400">No media</p>
                                                            </div>
                                                        )}
                                                        <div className="p-3 bg-white border-t">
                                                            {destinationUrl && <p className="text-xs text-slate-400 truncate">{destinationUrl.replace(/^https?:\/\//, '').split('/')[0]}</p>}
                                                            <p className="text-sm font-medium text-slate-900 truncate">{headline || 'Your Headline'}</p>
                                                        </div>
                                                    </div>

                                                    {/* Ad label */}
                                                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                                                        <span>Ad</span>
                                                        <span>•</span>
                                                        <Button size="sm" variant="outline" className="h-6 text-xs border-slate-300 rounded-full px-3">
                                                            {ctaOptions.find(c => c.value === cta)?.label}
                                                        </Button>
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex justify-between text-slate-500 mt-3 max-w-[90%]">
                                                        <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-blue-400"><MessageCircle className="w-4 h-4" /> 12</div>
                                                        <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-green-500"><Repeat className="w-4 h-4" /> 8</div>
                                                        <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-red-500"><Heart className="w-4 h-4" /> 124</div>
                                                        <div className="flex items-center gap-2 text-xs group cursor-pointer hover:text-blue-400"><BarChart2 className="w-4 h-4" /> 1.2k</div>
                                                        <Share2 className="w-4 h-4 hover:text-blue-400 cursor-pointer" />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                </div>
                            </div>
                        </div>

                        {/* Mobile Bottom Nav */}
                        {previewDevice === 'mobile' && (
                            <div className="h-16 bg-white border-t flex justify-around items-center text-xs text-slate-500 font-medium shrink-0 z-20">
                                <div className="flex flex-col items-center gap-1 text-slate-900"><Home className="w-5 h-5" /><span>Home</span></div>
                                <div className="flex flex-col items-center gap-1"><Search className="w-5 h-5" /><span>Search</span></div>
                                <div className="flex flex-col items-center gap-1"><Bell className="w-5 h-5" /><span>Notifications</span></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-2 text-center border-t bg-white text-[10px] text-slate-400 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
                <span>{currentSpec.name} Ad Preview</span>
                <span className="text-slate-300">•</span>
                <span>{previewDevice}</span>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-foreground">Social Media Ads</h3>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2" onClick={() => handleOpen()}>
                            <Plus className="w-4 h-4" /> New Ad
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl h-[90vh] p-0 flex flex-col overflow-hidden">
                        {/* Dialog Header */}
                        <div className="p-4 border-b flex items-center justify-between bg-white shrink-0">
                            <div>
                                {isEditingName ? (
                                    <div className="flex items-center gap-2">
                                        <Input
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="h-8 text-lg font-bold w-64"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                                        />
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => setIsEditingName(false)}>
                                            <Check className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                                        <DialogTitle className="text-lg font-bold text-gray-900">{name}</DialogTitle>
                                        <Pencil className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                )}
                                <DialogDescription className="text-xs text-muted-foreground">Social Media Advertisement</DialogDescription>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">Save Ad</Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden flex">
                            {/* Editor Column */}
                            <ScrollArea className="flex-1 border-r border-slate-200 bg-slate-50/50">
                                <div className="p-8 space-y-6 max-w-2xl mx-auto">
                                    {/* Topic / Idea */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6">
                                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Topic / Idea</Label>
                                            <Textarea
                                                placeholder="Describe your ad concept, target audience, or key message..."
                                                value={topic}
                                                onChange={(e) => setTopic(e.target.value)}
                                                className="min-h-[80px] resize-none"
                                            />
                                        </CardContent>
                                    </Card>

                                    {/* Platform Selector */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6">
                                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Select Channels</Label>
                                            <div className="flex flex-wrap gap-3">
                                                {(['linkedin', 'twitter', 'instagram', 'facebook'] as const).map((p) => {
                                                    const Icon = p === 'linkedin' ? Linkedin : p === 'twitter' ? Twitter : p === 'instagram' ? Instagram : Facebook;
                                                    const label = p === 'twitter' ? 'Twitter' : p.charAt(0).toUpperCase() + p.slice(1);
                                                    const isSelected = platform === p;

                                                    return (
                                                        <button
                                                            key={p}
                                                            onClick={() => setPlatform(p)}
                                                            className={cn(
                                                                "flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm font-medium",
                                                                isSelected
                                                                    ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                                                            )}
                                                        >
                                                            <Icon className={cn("w-4 h-4", isSelected ? "text-blue-700" : "text-slate-500")} fill={isSelected ? "currentColor" : "none"} />
                                                            <span>{label}</span>
                                                            {isSelected && (
                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 ml-1" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Primary Text */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6">
                                            <div className="flex justify-between items-center mb-2">
                                                <Label className="text-sm font-semibold text-slate-700">Primary Text</Label>
                                                <span className="text-xs text-slate-400">{primaryText.length}/{platformSpecs[platform].textLimit}</span>
                                            </div>
                                            <Textarea
                                                placeholder="Write compelling ad copy that grabs attention..."
                                                value={primaryText}
                                                onChange={(e) => setPrimaryText(e.target.value)}
                                                maxLength={platformSpecs[platform].textLimit}
                                                className="min-h-[100px] resize-none"
                                            />
                                        </CardContent>
                                    </Card>

                                    {/* Headline & Description */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6 space-y-4">
                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <Label className="text-sm font-semibold text-slate-700">Headline</Label>
                                                    <span className="text-xs text-slate-400">{headline.length}/{platformSpecs[platform].headlineLimit}</span>
                                                </div>
                                                <Input
                                                    placeholder="Catchy headline for your ad"
                                                    value={headline}
                                                    onChange={(e) => setHeadline(e.target.value)}
                                                    maxLength={platformSpecs[platform].headlineLimit}
                                                />
                                            </div>
                                            {platform === 'facebook' && (
                                                <div>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <Label className="text-sm font-semibold text-slate-700">Description</Label>
                                                        <span className="text-xs text-slate-400">{description.length}/30</span>
                                                    </div>
                                                    <Input
                                                        placeholder="Brief description (Facebook only)"
                                                        value={description}
                                                        onChange={(e) => setDescription(e.target.value)}
                                                        maxLength={30}
                                                    />
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    {/* Visual Guide */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6 space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <Label className="text-sm font-semibold text-slate-700">Visual Guide</Label>
                                                    <p className="text-xs text-slate-500 mt-1">Use this as the image direction for the paid social creative.</p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-2"
                                                    disabled={!visualGuide.trim() || isGeneratingImage}
                                                    onClick={handleGenerateImage}
                                                >
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                                                </Button>
                                            </div>
                                            <Textarea
                                                placeholder="e.g. Premium paid social image, confident subject, clean negative space, brand-safe palette, no dense text, clear CTA area."
                                                value={visualGuide}
                                                onChange={(e) => setVisualGuide(e.target.value)}
                                                className="min-h-[120px] resize-none"
                                            />
                                            <VisualGuideControls
                                                selectedAspectRatio={selectedAspectRatio}
                                                onAspectRatioChange={setSelectedAspectRatio}
                                                useBrandGuide={useBrandGuide}
                                                onUseBrandGuideChange={setUseBrandGuide}
                                                hasBrandGuide={!!brandVisualContext}
                                            />
                                            <GeneratedImageStrip
                                                images={generatedImages}
                                                selectedImage={image}
                                                onSelect={setImage}
                                                onPreview={setLightboxImage}
                                            />
                                        </CardContent>
                                    </Card>

                                    {/* Image Upload */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6">
                                            <Label className="text-sm font-semibold text-slate-700 mb-3 block">Ad Image</Label>
                                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                                            {image ? (
                                                <div className="relative group cursor-zoom-in" onClick={() => setLightboxImage(image)}>
                                                    <img src={image} alt="Ad" className="w-full h-48 object-cover rounded-lg" />
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(event) => { event.stopPropagation(); setImage(''); }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button variant="outline" className="w-full h-32 border-dashed" onClick={() => fileInputRef.current?.click()}>
                                                    <UploadCloud className="w-6 h-6 mr-2" /> Upload Image
                                                </Button>
                                            )}
                                        </CardContent>
                                    </Card>

                                    {/* CTA & URL */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6 space-y-4">
                                            <div>
                                                <Label className="text-sm font-semibold text-slate-700 mb-2 block">Call to Action</Label>
                                                <div className="flex gap-2 flex-wrap">
                                                    {ctaOptions.map((option) => (
                                                        <Button
                                                            key={option.value}
                                                            variant={cta === option.value ? 'default' : 'outline'}
                                                            size="sm"
                                                            onClick={() => setCta(option.value as typeof cta)}
                                                        >
                                                            {option.label}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-sm font-semibold text-slate-700 mb-2 block">Destination URL</Label>
                                                <Input
                                                    placeholder="https://example.com/landing-page"
                                                    value={destinationUrl}
                                                    onChange={(e) => setDestinationUrl(e.target.value)}
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Schedule Date */}
                                    <Card className="border-none shadow-sm ring-1 ring-slate-200/50 bg-white">
                                        <CardContent className="p-6">
                                            <Label className="text-sm font-semibold text-slate-700 mb-3 block">Schedule Date</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className={cn(
                                                            "w-full justify-start text-left font-normal bg-slate-50 border-slate-200",
                                                            !scheduledDate && "text-muted-foreground"
                                                        )}
                                                    >
                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                        {scheduledDate ? format(scheduledDate, "d MMM yyyy") : <span>Pick a date</span>}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={scheduledDate}
                                                        onSelect={setScheduledDate}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </CardContent>
                                    </Card>
                                    <div className="h-10"></div>
                                </div>
                            </ScrollArea>

                            {/* Preview Column */}
                            <div className="w-[45%] hidden lg:flex flex-col">
                                <AdPreview />
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage('')} />

            {/* Cards Grid */}
            {campaignAds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
                    <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
                        <Share2 className="w-8 h-8 opacity-50" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">No Social Ads Created</h3>
                    <p className="mb-6 max-w-sm text-center">Create high-converting ads for Facebook, Instagram, LinkedIn, and X.</p>
                    <Button onClick={() => handleOpen()}>Create Social Ad</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {campaignAds.map((ad) => {
                        const adPlatform = normalizeSocialPlatform(ad.platform);
                        const adPlatformSpec = platformSpecs[adPlatform];

                        return (
                        <Card
                            key={ad.id}
                            className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-muted relative"
                            onClick={() => handleOpen(ad)}
                        >
                            {/* Image */}
                            <div className="aspect-square bg-slate-100 flex items-center justify-center relative">
                                {ad.image ? (
                                    <img src={ad.image} alt={ad.name} className="w-full h-full object-cover" />
                                ) : (
                                    <Share2 className="w-12 h-12 text-slate-300" />
                                )}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button variant="secondary" size="sm">Edit Ad</Button>
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 h-7 w-7 bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                    onClick={(e) => { e.stopPropagation(); deleteContentItem.mutate(ad.id); }}
                                >
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </Button>
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="outline" className="text-[10px] font-normal">
                                        {formatDateLabel(ad.scheduledDate, 'MMM d', 'Unscheduled')}
                                    </Badge>
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] border-2 border-white text-white"
                                        style={{ backgroundColor: adPlatformSpec.color }}>
                                        {adPlatform.charAt(0).toUpperCase()}
                                    </div>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900 line-clamp-1 mb-1">
                                    {ad.name || "Untitled Ad"}
                                </h4>
                            </CardContent>
                        </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const BlogsTab = ({ campaignId }: { campaignId: string }) => {
    const { data: dbItems = [], addContentItem, updateContentItem, deleteContentItem } = useContentItems(campaignId);
    const blogs = (dbItems || []).filter(i => i.type === 'blog' || i.type === 'blogs').map(i => ({ id: i.id, campaignId: i.campaignId, name: i.name, status: i.status, ...i.payload }));
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBlog, setEditingBlog] = useState<typeof blogs[0] | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isSeoPanelOpen, setIsSeoPanelOpen] = useState(false);

    // Editor State
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [plainTextContent, setPlainTextContent] = useState('');
    const [slug, setSlug] = useState('');
    const [metaTitle, setMetaTitle] = useState('');
    const [metaDesc, setMetaDesc] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [publishDate, setPublishDate] = useState<Date | undefined>(undefined);
    const [name, setName] = useState('New Blog Post');
    const [isEditingName, setIsEditingName] = useState(false);

    const wordCount = plainTextContent.split(/\s+/).filter(w => w.length > 0).length;
    const readTime = Math.ceil(wordCount / 200) || 1;
    const campaignBlogs = blogs.filter(b => b.campaignId === campaignId);

    useEffect(() => {
        if (titleRef.current) {
            titleRef.current.style.height = 'auto';
            titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
        }
    }, [title]);

    const handleContentChange = (jsonContent: string, plainText: string) => {
        setContent(jsonContent);
        setPlainTextContent(plainText);
    };

    const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    setCoverImage(reader.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeleteConfirm = () => {
        if (deleteConfirmId) {
            deleteContentItem.mutate(deleteConfirmId);
            setDeleteConfirmId(null);
        }
    };

    const handleOpen = (blog?: typeof blogs[0]) => {
        if (blog) {
            setEditingBlog(blog);
            setName(blog.title || 'Untitled Blog');
            setTitle(blog.title);
            setContent(blog.content);
            setSlug(blog.slug);
            setMetaTitle(blog.metaTitle);
            setMetaDesc(blog.metaDescription);
            setCoverImage(blog.featuredImage || null);
            setPublishDate(toValidDate(blog.publishDate));
        } else {
            setEditingBlog(null);
            setName('New Blog Post');
            setTitle('');
            setContent('');
            setSlug('');
            setMetaTitle('');
            setMetaDesc('');
            setCoverImage(null);
            setPublishDate(undefined);
        }
        setIsSeoPanelOpen(false);
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        const blogData = {
            campaignId,
            title: title || 'Untitled Post',
            content,
            slug,
            metaTitle,
            metaDescription: metaDesc,
            featuredImage: coverImage || undefined,
            publishDate: publishDate ? format(publishDate, 'yyyy-MM-dd') : undefined,
            keywords: [],
            status: 'draft' as const,
        };

        if (editingBlog) {
            updateContentItem.mutate({ id: editingBlog.id, updates: { name, payload: blogData } });
        } else {
            addContentItem.mutate({ type: 'blog', name, payload: blogData });
        }
        setIsDialogOpen(false);
    };


    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Blog Articles</h3>
                    <p className="text-sm text-muted-foreground">Create and manage blog content for SEO and engagement.</p>
                </div>
                <Button onClick={() => handleOpen()} className="gap-2 rounded-full"><Plus className="w-4 h-4" /> New Blog</Button>
            </div>

            {campaignBlogs.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed rounded-xl bg-slate-50/50">
                    <FileText className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <p className="text-muted-foreground mb-4">No blog articles yet. Create your first blog post!</p>
                    <Button onClick={() => handleOpen()} variant="outline">Create Blog</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {campaignBlogs.map(blog => (
                        <Card key={blog.id} className="overflow-hidden hover:shadow-md transition-all cursor-pointer group border-muted relative" onClick={() => handleOpen(blog)}>
                            <div className="bg-muted h-40 flex items-center justify-center text-muted-foreground relative overflow-hidden">
                                <div className="flex flex-col items-center gap-2">
                                    <FileText className="w-8 h-8 opacity-20" />
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button variant="secondary" size="sm">Edit Blog</Button>
                                </div>
                            </div>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant={blog.status === 'published' ? 'default' : 'secondary'} className="text-[10px]">{blog.status}</Badge>
                                    <span className="text-[10px] text-slate-400">{formatDateLabel(blog.publishDate, 'MMM d', 'Unscheduled')}</span>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900 line-clamp-2">{blog.title || "Untitled Blog"}</h4>
                            </CardContent>
                            <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7 bg-white/80 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(blog.id); }}>
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                        </Card>
                    ))}
                </div>
            )}

            {/* Editor Modal */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[1200px] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden bg-slate-50">
                    <div className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-20 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="bg-emerald-100 p-2 rounded-lg"><FileText className="w-5 h-5 text-emerald-600" /></div>
                            <div>
                                {isEditingName ? (
                                    <div className="flex items-center gap-2">
                                        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-lg font-bold w-64" autoFocus onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)} />
                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => setIsEditingName(false)}><Check className="w-4 h-4" /></Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                                        <DialogTitle className="text-lg font-bold text-gray-900">{name}</DialogTitle>
                                        <Pencil className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100" />
                                    </div>
                                )}
                                <DialogDescription className="text-xs text-muted-foreground">{wordCount} words • {readTime} min</DialogDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="sm" className={cn("gap-2", isSeoPanelOpen && "bg-blue-50 text-blue-600")} onClick={() => setIsSeoPanelOpen(!isSeoPanelOpen)}><PanelRight className="w-4 h-4" /> SEO</Button>
                            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">Save Draft</Button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden flex">
                        <ScrollArea className="flex-1 bg-white">
                            <div className="max-w-4xl mx-auto py-10 px-12">
                                <label className="group relative h-56 bg-slate-50 rounded-xl mb-6 border-2 border-dashed flex items-center justify-center cursor-pointer block">
                                    {coverImage ? (<img src={coverImage} alt="Cover" className="w-full h-full object-cover rounded-xl" />) : (<div className="text-center"><ImageIcon className="w-10 h-10 mx-auto text-slate-300 mb-2" /><span className="text-sm text-slate-400">Click to add cover</span></div>)}
                                    <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                                </label>
                                <textarea ref={titleRef} className="w-full text-3xl font-bold border-none outline-none placeholder:text-slate-300 py-3 mb-2 bg-transparent resize-none" placeholder="Article Title" value={title} onChange={(e) => setTitle(e.target.value)} rows={2} />
                                <div className="mt-4"><BlogEditor key={editingBlog?.id || 'new'} initialContent={content} onChange={handleContentChange} editable={true} /></div>
                            </div>
                        </ScrollArea>
                        {isSeoPanelOpen && (
                            <div className="w-80 border-l bg-slate-50 overflow-y-auto shrink-0">
                                <div className="p-4 border-b"><h4 className="font-semibold text-sm flex items-center gap-2"><Search className="w-4 h-4" /> SEO</h4></div>
                                <div className="p-4 space-y-4">
                                    <div className="space-y-1"><Label className="text-xs">URL Slug</Label><Input className="bg-white h-8 text-sm" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-slug" /></div>
                                    <div className="space-y-1"><Label className="text-xs">Meta Title</Label><Input className="bg-white h-8 text-sm" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} /></div>
                                    <div className="space-y-1"><Label className="text-xs">Meta Description</Label><Textarea className="bg-white text-sm" value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} /></div>
                                    <div className="space-y-1"><Label className="text-xs">Publish Date</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start bg-white h-8 text-sm"><CalendarIcon className="mr-2 h-4 w-4" />{publishDate ? format(publishDate, "PPP") : "Pick date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={publishDate} onSelect={setPublishDate} /></PopoverContent></Popover></div>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                        <h3 className="text-lg font-semibold mb-2">Delete Article?</h3>
                        <p className="text-sm text-slate-600 mb-6">This cannot be undone.</p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};














// --- Main Page Component ---

export default function CampaignDashboard() {
    const { projectId, folderId, campaignId } = useParams();
    const location = useLocation();
    const { data: projects = [], isLoading: isLoadingProjects } = useProjects();
    const project = findBySlug(projects, projectId);
    const { data: folders = [], isLoading: isLoadingFolders } = useFolders(project?.id || '');
    const folder = findBySlug(folders, folderId);
    const { data: campaigns = [], isLoading: isLoadingCampaigns, updateCampaign } = useCampaigns(folder?.id || '');
    const campaign = findBySlug(campaigns, campaignId);
    const brandGuideList = useBrandGuide('');
    const activeBrandGuideId = brandGuideList.guides.find((guide) => guide.project_id === project?.id)?.id || brandGuideList.guides[0]?.id || '';
    const activeBrandGuide = useBrandGuide(activeBrandGuideId);
    const brandVisualContext = buildBrandVisualContext(activeBrandGuide);

    const campaignName = campaign?.name || "Campaign Dashboard";
    const resolvedCampaignId = campaign?.id || '';

    // Auto-navigation logic
    const autoCreate = location.state?.autoCreate;
    const initialType = location.state?.type; // 'socials', 'google-ad', etc.

    const getTabFromType = (type: string) => {
        if (type === 'google-ad') return 'google-ads';
        if (type === 'meta-ad') return 'social-ads';
        if (type === 'blogs') return 'blogs';
        return 'posts'; // default for 'socials'
    };

    // Use initialType from navigation state, or fall back to campaign's actual type
    const defaultTab = initialType
        ? getTabFromType(initialType)
        : campaign?.type
            ? getTabFromType(campaign.type)
            : 'posts';

    if (isLoadingProjects || isLoadingFolders || isLoadingCampaigns) {
        return (
            <AppLayout breadcrumbs={[{ label: 'Projects', path: '/projects' }]}>
                <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            </AppLayout>
        );
    }

    if (!project || !folder || !campaign) {
        return (
            <AppLayout breadcrumbs={[{ label: 'Projects', path: '/projects' }]}>
                <div className="text-center py-12 text-muted-foreground">
                    Content not found
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout
            breadcrumbs={[
                { label: 'Projects', path: '/projects' },
                { label: project.name, path: projectPath(project, projects) },
                { label: folder.name, path: folderPath(project, folder, projects, folders) },
                { label: campaignName, path: campaignPath(project, folder, campaign, projects, folders, campaigns) },
            ]}
        >
            <PageHeader
                title={campaignName}
                onRename={(newName) => updateCampaign.mutate({ id: resolvedCampaignId, updates: { name: newName } })}
            />

            <Tabs key={defaultTab} defaultValue={defaultTab} className="w-full space-y-6">

                <TabsContent value="posts">
                    <SocialPostsTab
                        campaignId={resolvedCampaignId}
                        autoCreate={autoCreate && defaultTab === 'posts'}
                        brandVisualContext={brandVisualContext}
                    />
                </TabsContent>
                <TabsContent value="google-ads">
                    <GoogleAdsTab
                        campaignId={resolvedCampaignId}
                        autoCreate={autoCreate && defaultTab === 'google-ads'}
                    />
                </TabsContent>
                <TabsContent value="social-ads">
                    <SocialAdsTab
                        campaignId={resolvedCampaignId}
                        autoCreate={autoCreate && defaultTab === 'social-ads'}
                        brandVisualContext={brandVisualContext}
                    />
                </TabsContent>
                <TabsContent value="blogs">
                    <BlogsTab campaignId={resolvedCampaignId} />
                </TabsContent>
            </Tabs>
        </AppLayout>
    );
}
