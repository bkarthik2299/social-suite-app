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
  status: 'todo' | 'in-progress' | 'done';
  dueDate?: string;
  projectId?: string;
  campaignId?: string;
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
