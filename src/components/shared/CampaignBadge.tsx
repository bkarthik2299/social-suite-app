import { CampaignType } from '@/types';
import { cn } from '@/lib/utils';

interface CampaignBadgeProps {
  type: CampaignType;
  label?: string;
}

const badgeConfig: Record<CampaignType, { label: string; className: string }> = {
  'socials': { label: 'May Socials', className: 'campaign-badge-socials' },
  'google-ad': { label: 'Google Ad', className: 'campaign-badge-google' },
  'meta-ad': { label: 'Meta Ad', className: 'campaign-badge-meta' },
  'blogs': { label: 'Blogs', className: 'campaign-badge-blogs' },
};

export function CampaignBadge({ type, label }: CampaignBadgeProps) {
  const config = badgeConfig[type];
  
  return (
    <span className={cn("campaign-badge", config.className)}>
      {label || config.label}
    </span>
  );
}
