import { Crop, Grid3X3, Maximize, Monitor, Smartphone } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CropMode } from './previewHelpers';

interface DeviceToolbarProps {
    deviceMode: 'mobile' | 'desktop';
    setDeviceMode: (mode: 'mobile' | 'desktop') => void;
    cropMode: CropMode;
    setCropMode: (mode: CropMode) => void;
    showGrid: boolean;
    setShowGrid: (show: boolean) => void;
    showSafeZones: boolean;
    setShowSafeZones: (show: boolean) => void;
    allowGrid?: boolean;
}

export function DeviceToolbar({
    deviceMode,
    setDeviceMode,
    cropMode,
    setCropMode,
    showGrid,
    setShowGrid,
    showSafeZones,
    setShowSafeZones,
    allowGrid = true,
}: DeviceToolbarProps) {
    return (
        <div className="space-y-5">
            <ControlBlock title="Device frame">
                <ToggleGroup
                    type="single"
                    value={deviceMode}
                    onValueChange={(value) => value && setDeviceMode(value as 'mobile' | 'desktop')}
                    className="grid grid-cols-2 gap-2"
                >
                    <ToggleGroupItem value="mobile" className="h-10 rounded-md data-[state=on]:bg-primary data-[state=on]:text-white">
                        <Smartphone className="mr-2 h-4 w-4" />
                        Mobile
                    </ToggleGroupItem>
                    <ToggleGroupItem value="desktop" className="h-10 rounded-md data-[state=on]:bg-primary data-[state=on]:text-white">
                        <Monitor className="mr-2 h-4 w-4" />
                        Desktop
                    </ToggleGroupItem>
                </ToggleGroup>
            </ControlBlock>

            <ControlBlock title="Fit mode">
                <ToggleGroup
                    type="single"
                    value={cropMode}
                    onValueChange={(value) => value && setCropMode(value as CropMode)}
                    className="grid grid-cols-2 gap-2"
                >
                    <ToggleGroupItem value="crop" className="h-10 rounded-md data-[state=on]:bg-primary data-[state=on]:text-white">
                        <Crop className="mr-2 h-4 w-4" />
                        Crop
                    </ToggleGroupItem>
                    <ToggleGroupItem value="fit" className="h-10 rounded-md data-[state=on]:bg-primary data-[state=on]:text-white">
                        <Maximize className="mr-2 h-4 w-4" />
                        Fit
                    </ToggleGroupItem>
                </ToggleGroup>
            </ControlBlock>

            <ControlBlock title="Overlays">
                <div className="space-y-3">
                    <SwitchRow
                        icon={Maximize}
                        label="Safe zones"
                        description="Show platform UI risk areas"
                        checked={showSafeZones}
                        onCheckedChange={setShowSafeZones}
                    />
                    {allowGrid && (
                        <SwitchRow
                            icon={Grid3X3}
                            label="Profile grid"
                            description="Check thumbnail crop"
                            checked={showGrid}
                            onCheckedChange={setShowGrid}
                        />
                    )}
                </div>
            </ControlBlock>
        </div>
    );
}

function ControlBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
            {children}
        </section>
    );
}

function SwitchRow({
    icon: Icon,
    label,
    description,
    checked,
    onCheckedChange,
}: {
    icon: typeof Maximize;
    label: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/80 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                </Tooltip>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{label}</p>
                    <p className="text-xs leading-4 text-slate-500">{description}</p>
                </div>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}
