import { ImagePlus, Layers3 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlatformFormat, SafeZone } from './platformSpecs';
import { CropMode, getSafeZoneStyle } from './previewHelpers';

interface PreviewCanvasProps {
    file: File | null;
    previewUrl: string | null;
    format: PlatformFormat;
    cropMode: CropMode;
    showSafeZones: boolean;
    showGrid: boolean;
    deviceMode: 'mobile' | 'desktop';
}

const zoneTone: Record<SafeZone['type'], string> = {
    safe: 'border-emerald-500/80 bg-emerald-500/15 text-emerald-50',
    warning: 'border-amber-500/80 bg-amber-500/18 text-amber-50',
    danger: 'border-red-500/80 bg-red-500/18 text-red-50',
};

export function PreviewCanvas({
    file,
    previewUrl,
    format,
    cropMode,
    showSafeZones,
    showGrid,
    deviceMode,
}: PreviewCanvasProps) {
    const isVideo = file?.type.startsWith('video/');
    const canShowGrid = showGrid && !!format.hasGrid && !!previewUrl;
    const maxWidth = deviceMode === 'mobile'
        ? 'min(100%, 430px)'
        : format.width > format.height
            ? 'min(100%, 900px)'
            : 'min(100%, 520px)';

    return (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
            <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                    backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }}
            />

            <div className="relative z-10 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 py-3 backdrop-blur">
                <div>
                    <p className="text-sm font-semibold text-slate-950">{format.label}</p>
                    <p className="text-xs text-slate-500">{format.width}x{format.height}px / {format.aspectLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-md bg-white">
                        {cropMode === 'crop' ? 'Crop preview' : 'Fit preview'}
                    </Badge>
                    {canShowGrid && (
                        <Badge variant="secondary" className="rounded-md">
                            Grid mode
                        </Badge>
                    )}
                </div>
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
                {!file || !previewUrl ? (
                    <EmptyPreview />
                ) : canShowGrid ? (
                    <GridPreview previewUrl={previewUrl} isVideo={!!isVideo} maxWidth={maxWidth} />
                ) : (
                    <div
                        className={cn(
                            'relative w-full overflow-hidden bg-black shadow-2xl ring-1 ring-black/10',
                            deviceMode === 'mobile' ? 'rounded-[28px]' : 'rounded-lg',
                        )}
                        style={{
                            aspectRatio: `${format.width} / ${format.height}`,
                            maxWidth,
                        }}
                    >
                        {isVideo ? (
                            <video
                                src={previewUrl}
                                className={cn('h-full w-full', cropMode === 'crop' ? 'object-cover' : 'object-contain')}
                                autoPlay
                                loop
                                muted
                                playsInline
                            />
                        ) : (
                            <img
                                src={previewUrl}
                                alt=""
                                className={cn('h-full w-full', cropMode === 'crop' ? 'object-cover' : 'object-contain')}
                            />
                        )}

                        {showSafeZones && format.safeZones?.map((zone, index) => (
                            <div
                                key={`${zone.label}-${index}`}
                                style={getSafeZoneStyle(zone, format)}
                                className={cn(
                                    'flex items-center justify-center border border-dashed text-center text-[10px] font-semibold',
                                    zoneTone[zone.type],
                                )}
                            >
                                {zone.label && (
                                    <span className="rounded bg-black/60 px-1.5 py-1 leading-none text-white shadow-sm">
                                        {zone.label}
                                    </span>
                                )}
                            </div>
                        ))}

                        <div
                            className={cn(
                                'pointer-events-none absolute inset-0 z-40 border border-white/20',
                                deviceMode === 'mobile' ? 'rounded-[28px] ring-[7px] ring-black/5' : 'rounded-lg',
                            )}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyPreview() {
    return (
        <div className="flex max-w-sm flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white/75 p-8 text-center shadow-sm">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ImagePlus className="h-7 w-7" />
            </div>
            <h2 className="text-base font-semibold text-slate-950">Ready to preview</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Upload a creative asset, then compare the active format here.</p>
        </div>
    );
}

function GridPreview({ previewUrl, isVideo, maxWidth }: { previewUrl: string; isVideo: boolean; maxWidth: string }) {
    return (
        <div
            className="w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
            style={{ aspectRatio: '9 / 16', maxWidth }}
        >
            <div className="flex h-full flex-col">
                <div className="border-b border-slate-100 p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <div className="h-3 w-28 rounded-full bg-slate-200" />
                        <Layers3 className="h-4 w-4 text-slate-300" />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-slate-200" />
                        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                            {['Posts', 'Reach', 'Saves'].map((label) => (
                                <div key={label}>
                                    <div className="mx-auto mb-1 h-3 w-8 rounded-full bg-slate-200" />
                                    <p className="text-[10px] text-slate-400">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-px bg-white p-px">
                    <div className="relative aspect-square overflow-hidden bg-black">
                        {isVideo ? (
                            <video src={previewUrl} className="h-full w-full object-cover" autoPlay loop muted playsInline />
                        ) : (
                            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                        )}
                        <div className="absolute inset-0 border-2 border-primary" />
                    </div>
                    {Array.from({ length: 11 }).map((_, index) => (
                        <div key={index} className="aspect-square bg-slate-100">
                            <div className="h-full w-full bg-gradient-to-br from-slate-100 to-slate-200" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

