import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ContentItem, useAllCampaigns, useAllContentItems, useAllFolders, useProjects } from '@/hooks/useDatabase';
import { ChevronLeft, ChevronRight, FileText, Megaphone, Share2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, parseISO, isValid } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { campaignPath } from '@/lib/routes';
import { CampaignType } from '@/types';

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: 'socials' | 'google-ad' | 'meta-ad' | 'blogs';
  projectId?: string;
  campaignId: string;
  folderId?: string;
  contentType: CampaignType;
}

const typeIcons: Record<string, typeof FileText> = {
  'blogs': FileText,
  'google-ad': Megaphone,
  'meta-ad': Megaphone,
  'socials': Share2,
};

const typeColors: Record<string, string> = {
  'blogs': 'bg-badge-blogs-bg text-badge-blogs border-badge-blogs/20',
  'google-ad': 'bg-badge-google-bg text-badge-google border-badge-google/20',
  'meta-ad': 'bg-badge-meta-bg text-badge-meta border-badge-meta/20',
  'socials': 'bg-badge-socials-bg text-badge-socials border-badge-socials/20',
};

const dateValue = (payload: ContentItem['payload'], ...keys: string[]) => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
};

const getCalendarPlacement = (item: ContentItem): { type: CampaignType; dateStr?: string } | null => {
  const payload = item.payload || {};

  if (item.type === 'social-post' || item.type === 'socials' || item.type === 'post') {
    return { type: 'socials', dateStr: dateValue(payload, 'scheduledDate', 'scheduled_date') };
  }

  if (item.type === 'social-ad' || item.type === 'meta-ad' || item.type === 'ad') {
    return { type: 'meta-ad', dateStr: dateValue(payload, 'scheduledDate', 'scheduled_date') };
  }

  if (item.type === 'google-ad') {
    return { type: 'google-ad', dateStr: dateValue(payload, 'startDate', 'start_date') };
  }

  if (item.type === 'blog' || item.type === 'blogs') {
    return { type: 'blogs', dateStr: dateValue(payload, 'publishDate', 'publish_date') };
  }

  return null;
};

export default function Calendar() {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const { data: folders = [] } = useAllFolders();
  const { data: campaigns = [] } = useAllCampaigns();
  const { data: contentItems = [] } = useAllContentItems();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  // Build events from actual content data
  const allEvents = useMemo((): CalendarEvent[] => {
    const events: CalendarEvent[] = [];

    contentItems.forEach((item: ContentItem) => {
      const payload = item.payload || {};
      const placement = getCalendarPlacement(item);
      if (!placement?.dateStr) return;

      if (placement.dateStr) {
          const date = parseISO(placement.dateStr);
          if (isValid(date)) {
              // Extract joined fields
              const folderId = item.campaigns?.folder_id;
              const projectId = item.campaigns?.folders?.project_id;
              
              events.push({
                  id: item.id,
                  title: item.name || (typeof payload.caption === 'string' ? payload.caption.slice(0, 30) : '') || (typeof payload.headline === 'string' ? payload.headline : '') || 'Content',
                  date,
                  type: placement.type,
                  projectId,
                  folderId,
                  campaignId: item.campaignId,
                  contentType: placement.type,
              });
          }
      }
    });

    return events;
  }, [contentItems]);

  // Filter events by selected projects (multi-select)
  const filteredEvents = useMemo(() => {
    if (selectedProjectIds.length === 0) return allEvents;
    return allEvents.filter(event => event.projectId && selectedProjectIds.includes(event.projectId));
  }, [allEvents, selectedProjectIds]);

  // Navigate to content
  const handleEventClick = (event: CalendarEvent) => {
    const campaign = campaigns.find(c => c.id === event.campaignId);
    const folder = folders.find(f => f.id === event.folderId);
    const project = projects.find(p => p.id === event.projectId);
    if (!campaign || !event.folderId || !event.projectId) return;
    if (!folder || !project) return;

    navigate(
      campaignPath(
        project,
        folder,
        campaign,
        projects,
        folders.filter((item) => item.projectId === project.id),
        campaigns.filter((item) => item.folderId === folder.id),
      ),
      { state: { type: event.contentType || campaign.type } }
    );
  };

  // Toggle project selection
  const toggleProject = (projectId: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const rows = [];
  let days = [];
  let day = startDate;

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const currentDay = day;
      const dayEvents = filteredEvents.filter(event =>
        isSameDay(event.date, currentDay)
      );
      const formattedDate = format(day, 'd');
      const isCurrentMonth = isSameMonth(day, monthStart);
      const isToday = isSameDay(day, new Date());

      days.push(
        <div
          key={day.toString()}
          className={cn(
            "min-h-28 p-2 border-b border-r border-border",
            !isCurrentMonth && "bg-muted/30"
          )}
        >
          <div className="flex items-start justify-between">
            <span
              className={cn(
                "text-sm font-medium",
                !isCurrentMonth && "text-muted-foreground",
                isToday && "w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
              )}
            >
              {formattedDate}
            </span>
            {dayEvents.length > 2 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs text-primary font-medium hover:underline cursor-pointer">
                    +{dayEvents.length - 2} more
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="end">
                  <div className="text-sm font-semibold mb-3 text-slate-700">
                    {format(currentDay, 'MMMM d, yyyy')}
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {dayEvents.map((event) => {
                      const Icon = typeIcons[event.type] || FileText;
                      return (
                        <div
                          key={event.id}
                          onClick={() => handleEventClick(event)}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity",
                            typeColors[event.type]
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          <span className="truncate">{event.title}</span>
                          <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="mt-1 space-y-1">
            {dayEvents.slice(0, 2).map((event) => {
              const Icon = typeIcons[event.type] || FileText;
              return (
                <div
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity",
                    typeColors[event.type]
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span className="truncate">{event.title}</span>
                  <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div key={day.toString()} className="grid grid-cols-7">
        {days}
      </div>
    );
    days = [];
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'Calendar', path: '/calendar' }]}>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center px-4 py-2 bg-primary rounded-xl text-primary-foreground">
              <span className="text-xs font-medium uppercase">{format(currentDate, 'MMM')}</span>
              <span className="text-2xl font-bold">{format(currentDate, 'd')}</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">{format(currentDate, 'MMMM yyyy')}</h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Multi-Select Project Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-48 justify-between">
                  {selectedProjectIds.length === 0
                    ? 'All Projects'
                    : `${selectedProjectIds.length} project${selectedProjectIds.length > 1 ? 's' : ''}`}
                  <ChevronRight className="w-4 h-4 ml-auto rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-1">
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted text-sm",
                      selectedProjectIds.length === 0 && "bg-muted"
                    )}
                    onClick={() => setSelectedProjectIds([])}
                  >
                    {selectedProjectIds.length === 0 && <Check className="w-4 h-4" />}
                    <span className={selectedProjectIds.length === 0 ? "" : "ml-6"}>All Projects</span>
                  </div>
                  {projects.map(project => (
                    <div
                      key={project.id}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted text-sm",
                        selectedProjectIds.includes(project.id) && "bg-muted"
                      )}
                      onClick={() => toggleProject(project.id)}
                    >
                      {selectedProjectIds.includes(project.id) && <Check className="w-4 h-4" />}
                      <span className={selectedProjectIds.includes(project.id) ? "" : "ml-6"}>{project.name}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {/* Month Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-[100px] text-center">{format(currentDate, 'MMM yyyy')}</span>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
              <div
                key={dayName}
                className="px-4 py-3 text-sm font-semibold text-muted-foreground text-center"
              >
                {dayName}
              </div>
            ))}
          </div>
          {/* Calendar Rows */}
          {rows}
        </div>
      </div>
    </AppLayout>
  );
}
