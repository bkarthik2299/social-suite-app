export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export type CampaignType = 'socials' | 'google-ad' | 'meta-ad' | 'blogs';

export interface Campaign {
  id: string;
  folderId: string;
  name: string;
  type: CampaignType;
  deadline: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string;
  projectId?: string;
  folderId?: string;
  campaignId?: string;
  assigneeId?: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  parentId?: string;
  authorUserId?: string;
  authorName: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStage {
  id: string;
  title: string;
  color: string;
  sortOrder: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  avatar?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: CampaignType;
  campaignId: string;
}

export type CampaignMediaKind = 'image' | 'video';
export type CampaignMediaFormat = 'single' | 'carousel';

export interface CampaignMediaAsset {
  id: string;
  url: string;
  kind: CampaignMediaKind;
  name?: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
}

export interface SocialPost {
  id: string;
  campaignId: string;
  name?: string; // Custom title
  topic?: string; // Topic/Idea for the post
  creativeBrief: string;
  visualGuide?: string;
  caption: string;
  hashtags: string[];
  image?: string;
  mediaAssets?: CampaignMediaAsset[];
  mediaFormat?: CampaignMediaFormat;
  generatedImages?: string[];
  imageAspectRatio?: string;
  useBrandGuide?: boolean;
  selectedLogoId?: string;
  platforms: string[]; // e.g. ['instagram', 'facebook', 'linkedin', 'twitter']
  scheduledDate: string;
  status: 'draft' | 'scheduled' | 'published';
  createdAt: string;
}

export interface GoogleAd {
  id: string;
  campaignId: string;
  name?: string; // Custom title
  topic?: string; // Topic/Idea for the ad
  keywords?: string[]; // Search terms assigned to this ad group
  startDate?: string;
  finalUrl: string;
  path1: string;
  path2: string;
  headlines: string[];
  descriptions: string[];
  sitelinks?: { text: string, desc1?: string, desc2?: string, finalUrl?: string }[];
  callouts?: string[];
  status: 'draft' | 'active' | 'paused';
  createdAt: string;
}

export interface SocialAd {
  id: string;
  campaignId: string;
  name?: string;
  topic?: string;              // Topic/Idea for the ad
  platform: 'linkedin' | 'twitter' | 'instagram' | 'facebook';
  primaryText: string;      // 125-150 chars recommended
  headline: string;         // 40-70 chars
  description?: string;     // 30 chars (FB only)
  visualGuide?: string;
  image?: string;
  mediaAssets?: CampaignMediaAsset[];
  mediaFormat?: CampaignMediaFormat;
  generatedImages?: string[];
  imageAspectRatio?: string;
  useBrandGuide?: boolean;
  selectedLogoId?: string;
  cta: 'learn_more' | 'sign_up' | 'shop_now' | 'contact_us' | 'download';
  destinationUrl: string;
  scheduledDate?: string;
  status: 'draft' | 'scheduled' | 'published';
  createdAt: string;
}

export interface BlogPost {
  id: string;
  campaignId: string;
  title: string;
  content: string; // Markdown body
  excerpt?: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  featuredImage?: string;
  status: 'draft' | 'published' | 'archived';
  publishDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  orgId: string;
  projectId?: string;
  title: string;
  content: unknown[]; // JSON array from BlockNote
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}
