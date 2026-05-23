import {
    Facebook,
    Image as ImageIcon,
    Instagram,
    Linkedin,
    Music2,
    Twitter,
    Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface SafeZone {
    type: 'safe' | 'warning' | 'danger';
    label?: string;
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
}

export interface PlatformFormat {
    id: string;
    label: string;
    width: number;
    height: number;
    aspectLabel?: string;
    description?: string;
    recommendedFor?: string;
    sourceUrl?: string;
    safeZones?: SafeZone[];
    hasGrid?: boolean;
}

export interface PlatformSpec {
    id: string;
    name: string;
    shortName?: string;
    icon: LucideIcon;
    accentClass: string;
    formats: PlatformFormat[];
}

const metaReelsSource = 'https://www.facebook.com/business/ads/facebook-instagram-reels-ads';
const instagramReelsSource = 'https://www.facebook.com/help/1038071743007909';
const youtubeShortsSource = 'https://support.google.com/youtube/answer/15424877';
const tiktokSource = 'https://ads.tiktok.com/help/article/creative-specifications-for-automotive-ads';
const pinterestSource = 'https://business.pinterest.com/en-ca/creative-best-practices/';
const xSource = 'https://business.x.com/en/help/campaign-setup/creative-ad-specifications';
const linkedinSource = 'https://www.linkedin.com/help/linkedin/answer/a424737';

export const platformSpecs: PlatformSpec[] = [
    {
        id: 'instagram',
        name: 'Instagram',
        icon: Instagram,
        accentClass: 'text-pink-600 bg-pink-50 border-pink-100',
        formats: [
            {
                id: 'ig-reel',
                label: 'Reel / Story',
                width: 1080,
                height: 1920,
                aspectLabel: '9:16',
                description: 'Full-screen vertical placement with top, bottom, and action rail overlays.',
                recommendedFor: 'Reels, Stories, and short-form vertical creative',
                sourceUrl: metaReelsSource,
                hasGrid: true,
                safeZones: [
                    { type: 'danger', label: 'Top UI', top: 220 },
                    { type: 'danger', label: 'Caption / CTA', bottom: 420 },
                    { type: 'warning', label: 'Action rail', right: 90, top: 360, bottom: 420 },
                ],
            },
            {
                id: 'ig-post-square',
                label: 'Square Post',
                width: 1080,
                height: 1080,
                aspectLabel: '1:1',
                description: 'Balanced feed creative and profile-grid thumbnail check.',
                recommendedFor: 'Feed posts, carousel slides, and grid covers',
                sourceUrl: instagramReelsSource,
                hasGrid: true,
            },
            {
                id: 'ig-post-portrait',
                label: 'Portrait Post',
                width: 1080,
                height: 1350,
                aspectLabel: '4:5',
                description: 'Tall feed creative with strong mobile feed presence.',
                recommendedFor: 'Feed posts and carousel slides',
                sourceUrl: instagramReelsSource,
                hasGrid: true,
            },
        ],
    },
    {
        id: 'tiktok',
        name: 'TikTok',
        icon: Music2,
        accentClass: 'text-slate-950 bg-slate-100 border-slate-200',
        formats: [
            {
                id: 'tiktok-video',
                label: 'Video',
                width: 1080,
                height: 1920,
                aspectLabel: '9:16',
                description: 'Vertical video with action buttons and caption controls around the lower-right area.',
                recommendedFor: 'Organic TikTok, in-feed video, and creator-style ads',
                sourceUrl: tiktokSource,
                hasGrid: true,
                safeZones: [
                    { type: 'danger', label: 'Top tabs', top: 250 },
                    { type: 'danger', label: 'Caption / nav', bottom: 480 },
                    { type: 'warning', label: 'Action rail', right: 96, top: 320, bottom: 500 },
                ],
            },
        ],
    },
    {
        id: 'youtube',
        name: 'YouTube',
        icon: Youtube,
        accentClass: 'text-red-600 bg-red-50 border-red-100',
        formats: [
            {
                id: 'yt-shorts',
                label: 'Shorts',
                width: 1080,
                height: 1920,
                aspectLabel: '9:16',
                description: 'Vertical Shorts placement with lower caption and right-side actions.',
                recommendedFor: 'Shorts and vertical video distribution',
                sourceUrl: youtubeShortsSource,
                safeZones: [
                    { type: 'danger', label: 'Header', top: 200 },
                    { type: 'danger', label: 'Caption / controls', bottom: 400 },
                    { type: 'warning', label: 'Actions', right: 90, top: 320, bottom: 450 },
                ],
            },
            {
                id: 'yt-video',
                label: 'Landscape Video',
                width: 1920,
                height: 1080,
                aspectLabel: '16:9',
                description: 'Standard landscape video preview.',
                recommendedFor: 'YouTube watch page and widescreen creative',
                sourceUrl: youtubeShortsSource,
            },
        ],
    },
    {
        id: 'facebook',
        name: 'Facebook',
        icon: Facebook,
        accentClass: 'text-blue-600 bg-blue-50 border-blue-100',
        formats: [
            {
                id: 'fb-reel',
                label: 'Reel',
                width: 1080,
                height: 1920,
                aspectLabel: '9:16',
                description: 'Full-screen Facebook Reels placement with stacked UI overlays.',
                recommendedFor: 'Facebook Reels and vertical video campaigns',
                sourceUrl: metaReelsSource,
                safeZones: [
                    { type: 'danger', label: 'Top UI', top: 180 },
                    { type: 'danger', label: 'Caption / nav', bottom: 360 },
                    { type: 'warning', label: 'Actions', right: 90, top: 360, bottom: 420 },
                ],
            },
            {
                id: 'fb-post',
                label: 'Feed Post',
                width: 1080,
                height: 1080,
                aspectLabel: '1:1',
                description: 'Square creative for feed placements and cross-posting.',
                recommendedFor: 'Feed posts and carousel creative',
                sourceUrl: metaReelsSource,
            },
        ],
    },
    {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: Linkedin,
        accentClass: 'text-sky-700 bg-sky-50 border-sky-100',
        formats: [
            {
                id: 'li-post',
                label: 'Portrait Post',
                width: 1080,
                height: 1350,
                aspectLabel: '4:5',
                description: 'Tall professional feed creative with header and action areas reserved.',
                recommendedFor: 'LinkedIn feed posts and sponsored creative',
                sourceUrl: linkedinSource,
                safeZones: [
                    { type: 'warning', label: 'Header context', top: 120 },
                    { type: 'warning', label: 'Social actions', bottom: 260 },
                ],
            },
        ],
    },
    {
        id: 'x',
        name: 'X / Twitter',
        shortName: 'X',
        icon: Twitter,
        accentClass: 'text-slate-950 bg-slate-100 border-slate-200',
        formats: [
            {
                id: 'x-square',
                label: 'Square Post',
                width: 1080,
                height: 1080,
                aspectLabel: '1:1',
                description: 'Square image or video creative for timeline consistency.',
                recommendedFor: 'Posts, promoted posts, and carousel-like assets',
                sourceUrl: xSource,
            },
            {
                id: 'x-vertical',
                label: 'Vertical Video',
                width: 1080,
                height: 1920,
                aspectLabel: '9:16',
                description: 'Full-screen vertical video placement.',
                recommendedFor: 'Vertical video and immersive media viewer creative',
                sourceUrl: xSource,
            },
            {
                id: 'x-landscape',
                label: 'Landscape Video',
                width: 1920,
                height: 1080,
                aspectLabel: '16:9',
                description: 'Widescreen video creative for timeline playback.',
                recommendedFor: 'Video posts and promoted video',
                sourceUrl: xSource,
            },
        ],
    },
    {
        id: 'pinterest',
        name: 'Pinterest',
        icon: ImageIcon,
        accentClass: 'text-red-700 bg-red-50 border-red-100',
        formats: [
            {
                id: 'pin-standard',
                label: 'Standard Pin',
                width: 1000,
                height: 1500,
                aspectLabel: '2:3',
                description: 'Pinterest-recommended vertical pin shape.',
                recommendedFor: 'Standard pins and evergreen visual content',
                sourceUrl: pinterestSource,
            },
            {
                id: 'pin-idea',
                label: 'Idea Pin',
                width: 1080,
                height: 1920,
                aspectLabel: '9:16',
                description: 'Full-screen vertical idea pin preview.',
                recommendedFor: 'Idea Pins and story-style creative',
                sourceUrl: pinterestSource,
                safeZones: [
                    { type: 'warning', label: 'Top UI', top: 270 },
                    { type: 'warning', label: 'Bottom UI', bottom: 440 },
                ],
            },
        ],
    },
];

