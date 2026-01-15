import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { calendarEvents } from '@/data/mockData';
import { ChevronLeft, ChevronRight, FileText, Megaphone, Search as SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

const typeIcons: Record<string, typeof FileText> = {
  'blogs': FileText,
  'meta-ad': Megaphone,
  'google-ad': SearchIcon,
  'socials': FileText,
};

const typeColors: Record<string, string> = {
  'blogs': 'bg-badge-blogs-bg text-badge-blogs border-badge-blogs/20',
  'meta-ad': 'bg-badge-meta-bg text-badge-meta border-badge-meta/20',
  'google-ad': 'bg-badge-google-bg text-badge-google border-badge-google/20',
  'socials': 'bg-badge-socials-bg text-badge-socials border-badge-socials/20',
};

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 5, 18)); // June 2025

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const rows = [];
  let days = [];
  let day = startDate;

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const dayEvents = calendarEvents.filter(event => 
        isSameDay(new Date(event.date), day)
      );
      const formattedDate = format(day, 'd');
      const isCurrentMonth = isSameMonth(day, monthStart);
      const isToday = isSameDay(day, new Date(2025, 5, 18));

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
              <span className="text-xs text-primary font-medium">+{dayEvents.length - 2} more</span>
            )}
          </div>
          <div className="mt-1 space-y-1">
            {dayEvents.slice(0, 2).map((event) => {
              const Icon = typeIcons[event.type] || FileText;
              return (
                <div
                  key={event.id}
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

  const upcomingEvents = calendarEvents.slice(0, 4);

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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium">{format(currentDate, 'MMM yyyy')}</span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          {upcomingEvents.map((event) => (
            <div
              key={event.id}
              className="flex-shrink-0 w-56 p-4 bg-card border border-border rounded-xl hover:shadow-md transition-shadow"
            >
              <h3 className="font-semibold text-foreground mb-1">{event.title}</h3>
              <p className="text-xs text-muted-foreground mb-3">Today, 9AM - 10PM</p>
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border",
                  typeColors[event.type]
                )}
              >
                {event.type === 'meta-ad' && <Megaphone className="w-3 h-3" />}
                {event.type === 'google-ad' && <SearchIcon className="w-3 h-3" />}
                {event.type === 'socials' && <FileText className="w-3 h-3" />}
                {event.type === 'blogs' && <FileText className="w-3 h-3" />}
                <span className="capitalize">{event.type.replace('-', ' ')}</span>
                <ChevronRight className="w-3 h-3 ml-auto" />
              </div>
            </div>
          ))}
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
