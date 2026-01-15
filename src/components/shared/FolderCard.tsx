import { Folder } from 'lucide-react';
import { Link } from 'react-router-dom';

interface FolderCardProps {
  id: string;
  name: string;
  href: string;
}

export function FolderCard({ id, name, href }: FolderCardProps) {
  return (
    <Link to={href} className="folder-card group">
      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
        <Folder className="w-5 h-5 text-primary" />
      </div>
      <span className="font-medium text-foreground">{name}</span>
    </Link>
  );
}
