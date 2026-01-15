import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { teamMembers } from '@/data/mockData';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const roleColors: Record<string, string> = {
  'admin': 'bg-badge-google-bg text-badge-google',
  'editor': 'bg-badge-meta-bg text-badge-meta',
  'viewer': 'bg-muted text-muted-foreground',
};

export default function Teams() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Teams', path: '/teams' }]}>
      <PageHeader title="Teams" actionLabel="Invite Member" />
      
      <div className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-semibold text-foreground">Member</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Role</TableHead>
              <TableHead className="font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers.map((member) => (
              <TableRow key={member.id} className="hover:bg-muted/20">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {member.name.charAt(0)}
                      </span>
                    </div>
                    <span className="font-medium text-foreground">{member.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${roleColors[member.role]}`}>
                    {member.role}
                  </span>
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
      </div>
    </AppLayout>
  );
}
