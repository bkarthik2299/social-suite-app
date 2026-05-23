import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    Image as ImageIcon,
    Info,
    ScanEye,
    XCircle,
} from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { DeviceToolbar } from '@/components/tools/social-preview/DeviceToolbar';
import { FileUpload } from '@/components/tools/social-preview/FileUpload';
import { PlatformSelector } from '@/components/tools/social-preview/PlatformSelector';
import { PreviewCanvas } from '@/components/tools/social-preview/PreviewCanvas';
import { platformSpecs } from '@/components/tools/social-preview/platformSpecs';
import {
    AssetMetadata,
    CropMode,
    FitAssessment,
    formatRatio,
    getAssetMetadata,
    getFitAssessment,
} from '@/components/tools/social-preview/previewHelpers';
import { cn } from '@/lib/utils';

const statusStyles: Record<FitAssessment['status'], {
    icon: typeof CheckCircle2;
    badge: string;
    panel: string;
    label: string;
}> = {
    idle: {
        icon: Info,
        badge: 'bg-slate-100 text-slate-600',
        panel: 'border-slate-200 bg-white',
        label: 'Waiting',
    },
    pass: {
        icon: CheckCircle2,
        badge: 'bg-emerald-100 text-emerald-700',
        panel: 'border-emerald-200 bg-emerald-50',
        label: 'Pass',
    },
    warn: {
        icon: AlertTriangle,
        badge: 'bg-amber-100 text-amber-800',
        panel: 'border-amber-200 bg-amber-50',
        label: 'Review',
    },
    mismatch: {
        icon: XCircle,
        badge: 'bg-red-100 text-red-700',
        panel: 'border-red-200 bg-red-50',
        label: 'Resize',
    },
};

export default function SocialPreview() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [assetMetadata, setAssetMetadata] = useState<AssetMetadata | null>(null);
    const [metadataError, setMetadataError] = useState('');

    const [selectedPlatformId, setSelectedPlatformId] = useState(platformSpecs[0].id);
    const [selectedFormatId, setSelectedFormatId] = useState(platformSpecs[0].formats[0].id);
    const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('mobile');
    const [cropMode, setCropMode] = useState<CropMode>('crop');
    const [showSafeZones, setShowSafeZones] = useState(true);
    const [showGrid, setShowGrid] = useState(false);

    const selectedPlatform = platformSpecs.find((platform) => platform.id === selectedPlatformId) ?? platformSpecs[0];
    const selectedFormat = selectedPlatform.formats.find((format) => format.id === selectedFormatId) ?? selectedPlatform.formats[0];

    useEffect(() => {
        if (!selectedFormat.hasGrid && showGrid) {
            setShowGrid(false);
        }
    }, [selectedFormat.hasGrid, showGrid]);

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            setAssetMetadata(null);
            setMetadataError('');
            return;
        }

        let cancelled = false;
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        setAssetMetadata(null);
        setMetadataError('');

        if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                if (!cancelled) setAssetMetadata(getAssetMetadata(file, video));
            };
            video.onerror = () => {
                if (!cancelled) setMetadataError('Could not read video metadata.');
            };
            video.src = url;
        } else {
            const image = new Image();
            image.onload = () => {
                if (!cancelled) setAssetMetadata(getAssetMetadata(file, image));
            };
            image.onerror = () => {
                if (!cancelled) setMetadataError('Could not read image dimensions.');
            };
            image.src = url;
        }

        return () => {
            cancelled = true;
            URL.revokeObjectURL(url);
        };
    }, [file]);

    const assessment = useMemo(
        () => getFitAssessment(assetMetadata, selectedFormat, cropMode),
        [assetMetadata, selectedFormat, cropMode],
    );

    const handlePlatformSelect = (platformId: string) => {
        const nextPlatform = platformSpecs.find((platform) => platform.id === platformId) ?? platformSpecs[0];
        setSelectedPlatformId(nextPlatform.id);
        setSelectedFormatId(nextPlatform.formats[0].id);
    };

    return (
        <AppLayout breadcrumbs={[{ label: 'Tools', path: '#' }, { label: 'SM Preview', path: '/tools/sm-preview' }]} noPadding>
            <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col overflow-hidden bg-slate-50 lg:flex-row">
                <aside className="flex min-h-0 border-b border-slate-200 bg-white lg:w-[360px] lg:flex-col lg:border-b-0 lg:border-r">
                    <div className="hidden border-b border-slate-200 p-5 lg:block">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <ScanEye className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-slate-950">SM Preview</h1>
                                <p className="text-sm text-slate-500">Creative fit checker</p>
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                        <div className="space-y-7">
                            <section>
                                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Asset</h2>
                                <FileUpload
                                    file={file}
                                    previewUrl={previewUrl}
                                    metadata={assetMetadata}
                                    onFileSelect={setFile}
                                />
                                {metadataError && (
                                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                        {metadataError}
                                    </p>
                                )}
                            </section>

                            <PlatformSelector
                                selectedPlatformId={selectedPlatformId}
                                selectedFormatId={selectedFormatId}
                                onSelectPlatform={handlePlatformSelect}
                                onSelectFormat={setSelectedFormatId}
                            />
                        </div>
                    </div>
                </aside>

                <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <PreviewCanvas
                        file={file}
                        previewUrl={previewUrl}
                        format={selectedFormat}
                        cropMode={cropMode}
                        showSafeZones={showSafeZones}
                        showGrid={showGrid}
                        deviceMode={deviceMode}
                    />
                </main>

                <aside className="min-h-0 border-t border-slate-200 bg-white lg:w-[340px] lg:border-l lg:border-t-0">
                    <div className="h-full overflow-y-auto p-5">
                        <div className="space-y-6">
                            <FitStatusCard assessment={assessment} />

                            <section className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-sm font-semibold text-slate-950">Format details</h2>
                                        <p className="text-xs text-slate-500">{selectedPlatform.name}</p>
                                    </div>
                                    <Badge variant="secondary" className="rounded-md font-mono">
                                        {selectedFormat.aspectLabel}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <Metric label="Target" value={`${selectedFormat.width}x${selectedFormat.height}`} />
                                    <Metric label="Target ratio" value={formatRatio(assessment.targetRatio)} />
                                    <Metric label="Asset" value={assetMetadata ? `${assetMetadata.width}x${assetMetadata.height}` : '-'} />
                                    <Metric label="Asset ratio" value={formatRatio(assessment.assetRatio)} />
                                </div>

                                <Separator className="my-4" />

                                <div className="space-y-3">
                                    <div className="flex gap-3">
                                        <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                                        <p className="text-sm leading-6 text-slate-600">{selectedFormat.description}</p>
                                    </div>
                                    {selectedFormat.sourceUrl && (
                                        <Button variant="outline" size="sm" className="h-8 rounded-md" asChild>
                                            <a href={selectedFormat.sourceUrl} target="_blank" rel="noreferrer">
                                                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                                Source
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            </section>

                            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                <DeviceToolbar
                                    deviceMode={deviceMode}
                                    setDeviceMode={setDeviceMode}
                                    cropMode={cropMode}
                                    setCropMode={setCropMode}
                                    showGrid={showGrid}
                                    setShowGrid={setShowGrid}
                                    showSafeZones={showSafeZones}
                                    setShowSafeZones={setShowSafeZones}
                                    allowGrid={!!selectedFormat.hasGrid}
                                />
                            </section>
                        </div>
                    </div>
                </aside>
            </div>
        </AppLayout>
    );
}

function FitStatusCard({ assessment }: { assessment: FitAssessment }) {
    const styles = statusStyles[assessment.status];
    const Icon = styles.icon;

    return (
        <section className={cn('rounded-lg border p-4', styles.panel)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                        <Icon className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-950">{assessment.title}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{assessment.message}</p>
                    </div>
                </div>
                <Badge className={cn('shrink-0 rounded-md border-0', styles.badge)}>
                    {styles.label}
                </Badge>
            </div>
            {assessment.ratioDeltaPercent !== undefined && (
                <div className="mt-4 rounded-md bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aspect delta</p>
                    <p className="mt-1 text-lg font-bold text-slate-950">{assessment.ratioDeltaPercent.toFixed(1)}%</p>
                </div>
            )}
        </section>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-950" title={value}>{value}</p>
        </div>
    );
}

