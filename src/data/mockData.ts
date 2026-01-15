import { Project, Folder, Campaign, Task, TeamMember, CalendarEvent } from '@/types';

export const projects: Project[] = [
  { id: '1', name: 'Grustl', createdAt: '2024-01-15' },
  { id: '2', name: 'KYRO', createdAt: '2024-02-20' },
];

export const folders: Folder[] = [
  { id: '1', projectId: '1', name: 'Construction Dive', createdAt: '2024-03-01' },
  { id: '2', projectId: '1', name: 'Hikaru Nagi', createdAt: '2024-03-15' },
  { id: '3', projectId: '2', name: 'Q1 Marketing', createdAt: '2024-01-10' },
];

export const campaigns: Campaign[] = [
  { id: '1', folderId: '1', name: 'May Socials', type: 'socials', deadline: '2024-06-12', createdAt: '2024-12-12' },
  { id: '2', folderId: '1', name: 'Summer Google Ads', type: 'google-ad', deadline: '2024-06-12', createdAt: '2024-12-12' },
  { id: '3', folderId: '1', name: 'Event Promotion Ads', type: 'meta-ad', deadline: '2024-06-12', createdAt: '2024-11-12' },
  { id: '4', folderId: '1', name: 'Top Trends Shaping Media Marketing', type: 'google-ad', deadline: '2024-06-12', createdAt: '2024-10-12' },
  { id: '5', folderId: '1', name: 'Maximizing Engagement with Video Content', type: 'meta-ad', deadline: '2024-07-15', createdAt: '2024-11-15' },
  { id: '6', folderId: '1', name: 'The Future of Influencer Marketing', type: 'google-ad', deadline: '2024-08-20', createdAt: '2024-12-20' },
  { id: '7', folderId: '1', name: 'Leveraging Data Analytics for Targeted Campaigns', type: 'socials', deadline: '2024-09-10', createdAt: '2025-01-10' },
  { id: '8', folderId: '1', name: 'Blogs on How to train a Dragon', type: 'blogs', deadline: '2024-09-10', createdAt: '2025-01-10' },
];

export const tasks: Task[] = [
  { id: '1', title: 'Review May Socials content', status: 'todo', dueDate: '2024-06-10', projectId: '1', campaignId: '1' },
  { id: '2', title: 'Create ad copy for Summer campaign', status: 'in-progress', dueDate: '2024-06-08', projectId: '1', campaignId: '2' },
  { id: '3', title: 'Approve Event Promotion creatives', status: 'done', dueDate: '2024-06-05', projectId: '1', campaignId: '3' },
  { id: '4', title: 'Schedule social media posts', status: 'todo', dueDate: '2024-06-15', projectId: '2' },
];

export const teamMembers: TeamMember[] = [
  { id: '1', name: 'Leo Parthiban', email: 'leodas213@gmail.com', role: 'admin' },
  { id: '2', name: 'Sarah Chen', email: 'sarah@example.com', role: 'editor' },
  { id: '3', name: 'Mike Johnson', email: 'mike@example.com', role: 'viewer' },
];

export const calendarEvents: CalendarEvent[] = [
  { id: '1', title: 'Event Promotion Ad', date: '2025-06-10', type: 'meta-ad', campaignId: '3' },
  { id: '2', title: 'Summer Google Ad', date: '2025-06-12', type: 'google-ad', campaignId: '2' },
  { id: '3', title: 'How to train your Dragon', date: '2025-06-15', type: 'blogs', campaignId: '8' },
  { id: '4', title: 'Event Promotion Ad', date: '2025-06-18', type: 'meta-ad', campaignId: '3' },
  { id: '5', title: 'Summer Google Ad', date: '2025-06-18', type: 'google-ad', campaignId: '2' },
  { id: '6', title: 'Post 20', date: '2025-06-24', type: 'socials', campaignId: '1' },
];
