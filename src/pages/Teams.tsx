import { AppLayout } from '@/components/layout/AppLayout';
import { teamMembers } from '@/data/mockData';
import { MoreHorizontal, UserPlus } from 'lucide-react';
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
  'viewer': 'bg-slate-50 text-slate-500',
};

export default function Teams() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Teams', path: '/teams' }]}>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground">Manage workspace members and access levels.</p>
        </div>
        <Button className="gap-2 rounded-full bg-primary px-6 text-white hover:bg-primary/90">
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>
      
      <div className="tool-surface animate-fade-in overflow-hidden rounded-xl bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-blue-100/60 bg-slate-50/80 hover:bg-slate-50/80">
              <TableHead className="font-semibold text-foreground">Member</TableHead>
              <TableHead className="font-semibold text-foreground">Email</TableHead>
              <TableHead className="font-semibold text-foreground">Role</TableHead>
              <TableHead className="font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamMembers.map((member) => (
              <TableRow key={member.id} className="border-blue-100/60 hover:bg-blue-50/35">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shadow-[0_12px_28px_-22px_rgba(37,99,235,0.65)]">
                      <span className="text-sm font-medium text-primary">
                        {member.name.charAt(0)}
                      </span>
                    </div>
                    <span className="font-medium text-foreground">{member.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{member.email}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize shadow-[0_8px_20px_-18px_rgba(37,99,235,0.35),0_1px_2px_rgba(15,23,42,0.04)] ${roleColors[member.role]}`}>
                    {member.role}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-blue-50">
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
