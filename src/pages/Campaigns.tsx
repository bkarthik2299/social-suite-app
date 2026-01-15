import { useParams } from 'react-router-dom';
import { MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { CampaignBadge } from '@/components/shared/CampaignBadge';
import { campaigns, folders, projects } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';

export default function Campaigns() {
  const { projectId, folderId } = useParams();
  
  const project = projects.find(p => p.id === projectId);
  const folder = folders.find(f => f.id === folderId);
  const folderCampaigns = campaigns.filter(c => c.folderId === folderId);

  if (!project || !folder) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">
          Campaign not found
        </div>
      </AppLayout>
    );
  }

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), 'MMM dd, yyyy');
  };

  const getBadgeLabel = (type: string, name: string) => {
    if (type === 'socials') {
      return name.includes('May') ? 'May Socials' : name.includes('April') ? 'April Socials' : 'Socials';
    }
    return undefined;
  };

  return (
    <AppLayout
      breadcrumbs={[
        { label: 'Projects', path: '/projects' },
        { label: 'Folders', path: `/projects/${projectId}/folders` },
        { label: 'Campaigns', path: `/projects/${projectId}/folders/${folderId}/campaigns` },
      ]}
    >
      <PageHeader title="Campaigns" actionLabel="New Campaign" />
      
      <div className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold text-foreground">Campaign</TableHead>
              <TableHead className="font-semibold text-foreground">Type</TableHead>
              <TableHead className="font-semibold text-foreground">Deadline</TableHead>
              <TableHead className="font-semibold text-foreground">Created at</TableHead>
              <TableHead className="font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {folderCampaigns.map((campaign) => (
              <TableRow key={campaign.id} className="hover:bg-muted/20">
                <TableCell className="font-medium text-foreground">
                  {campaign.name}
                </TableCell>
                <TableCell>
                  <CampaignBadge 
                    type={campaign.type} 
                    label={getBadgeLabel(campaign.type, campaign.name)}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(campaign.deadline)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(campaign.createdAt)}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-2 py-4 border-t border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 bg-primary text-primary-foreground hover:bg-primary/90">
            1
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
