import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { platformSpecs } from './platformSpecs';

interface PlatformSelectorProps {
    selectedPlatformId: string;
    selectedFormatId: string;
    onSelectPlatform: (id: string) => void;
    onSelectFormat: (id: string) => void;
}

export function PlatformSelector({
    selectedPlatformId,
    selectedFormatId,
    onSelectPlatform,
    onSelectFormat,
}: PlatformSelectorProps) {
    const selectedPlatform = platformSpecs.find((platform) => platform.id === selectedPlatformId) ?? platformSpecs[0];

    return (
        <div className="space-y-6">
            <section>
                <SectionLabel>Platform</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                    {platformSpecs.map((platform) => {
                        const Icon = platform.icon;
                        const isSelected = platform.id === selectedPlatformId;

                        return (
                            <button
                                key={platform.id}
                                type="button"
                                onClick={() => {
                                    onSelectPlatform(platform.id);
                                    onSelectFormat(platform.formats[0].id);
                                }}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg border p-3 text-left transition-all',
                                    isSelected
                                        ? 'border-primary/30 bg-primary/5 text-primary shadow-sm'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                                )}
                            >
                                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md border', platform.accentClass)}>
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold leading-tight">{platform.shortName || platform.name}</span>
                                    <span className="mt-0.5 block text-xs text-slate-500">{platform.formats.length} formats</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section>
                <SectionLabel>Format</SectionLabel>
                <div className="space-y-2">
                    {selectedPlatform.formats.map((format) => {
                        const isSelected = selectedFormatId === format.id;

                        return (
                            <button
                                key={format.id}
                                type="button"
                                onClick={() => onSelectFormat(format.id)}
                                className={cn(
                                    'w-full rounded-lg border p-3 text-left transition-all',
                                    isSelected
                                        ? 'border-primary/30 bg-white shadow-sm ring-1 ring-primary/10'
                                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white',
                                )}
                            >
                                <span className="flex items-start justify-between gap-3">
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-950">{format.label}</span>
                                        <span className="mt-1 block text-xs leading-5 text-slate-500">{format.recommendedFor}</span>
                                    </span>
                                    <Badge variant="secondary" className="shrink-0 rounded-md font-mono text-[11px]">
                                        {format.width}x{format.height}
                                    </Badge>
                                </span>
                                {format.aspectLabel && (
                                    <span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                                        {format.aspectLabel}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {children}
        </h2>
    );
}

