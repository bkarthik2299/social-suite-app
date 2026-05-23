import React from 'react';
import { Switch } from "@/components/ui/switch";
import { Info, CreditCard, Grid, Scan, Layout } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ControlPanelProps {
    showSafeZones: boolean;
    setShowSafeZones: (v: boolean) => void;
    showGrid: boolean;
    setShowGrid: (v: boolean) => void;
    showCrop: boolean;
    setShowCrop: (v: boolean) => void;
    showFeedUI: boolean;
    setShowFeedUI: (v: boolean) => void;
    validationStatus: 'success' | 'warning' | 'error';
    validationMessage?: string;
}

export function ControlPanel({
    showSafeZones,
    setShowSafeZones,
    showGrid,
    setShowGrid,
    showCrop,
    setShowCrop,
    showFeedUI,
    setShowFeedUI,
    validationStatus,
    validationMessage
}: ControlPanelProps) {
    return (
        <div className="space-y-6">
            {/* Validation Status */}
            <div className={cn(
                "p-4 rounded-xl border border-l-4",
                validationStatus === 'success' && "bg-emerald-50 border-emerald-200 border-l-emerald-500",
                validationStatus === 'warning' && "bg-amber-50 border-amber-200 border-l-amber-500",
                validationStatus === 'error' && "bg-red-50 border-red-200 border-l-red-500",
            )}>
                <div className="flex items-start gap-3">
                    <Info className={cn(
                        "w-5 h-5 shrink-0 mt-0.5",
                        validationStatus === 'success' && "text-emerald-600",
                        validationStatus === 'warning' && "text-amber-600",
                        validationStatus === 'error' && "text-red-600",
                    )} />
                    <div>
                        <h4 className={cn(
                            "text-sm font-semibold",
                            validationStatus === 'success' && "text-emerald-900",
                            validationStatus === 'warning' && "text-amber-900",
                            validationStatus === 'error' && "text-red-900",
                        )}>
                            {validationStatus === 'success' ? "Perfect Match" :
                                validationStatus === 'warning' ? "Optimization Recommended" : "Issue Detected"}
                        </h4>
                        <p className={cn(
                            "text-xs mt-1",
                            validationStatus === 'success' && "text-emerald-700",
                            validationStatus === 'warning' && "text-amber-700",
                            validationStatus === 'error' && "text-red-700",
                        )}>
                            {validationMessage || "Your creative fits perfectly within the platform specifications."}
                        </p>
                    </div>
                </div>
            </div>

            {/* Toggles */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Preview Options</h3>

                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-md text-primary">
                                <Scan className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Safe Zones</p>
                                <p className="text-xs text-muted-foreground">Show protected areas</p>
                            </div>
                        </div>
                        <Switch checked={showSafeZones} onCheckedChange={setShowSafeZones} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-md text-primary">
                                <Layout className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Crop Preview</p>
                                <p className="text-xs text-muted-foreground">Dim cropped areas</p>
                            </div>
                        </div>
                        <Switch checked={showCrop} onCheckedChange={setShowCrop} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-md text-primary">
                                <CreditCard className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Mock Interface</p>
                                <p className="text-xs text-muted-foreground">Show platform UI</p>
                            </div>
                        </div>
                        <Switch checked={showFeedUI} onCheckedChange={setShowFeedUI} />
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-md text-primary">
                                <Grid className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Grid Guide</p>
                                <p className="text-xs text-muted-foreground">3x3 Rule of Thirds</p>
                            </div>
                        </div>
                        <Switch checked={showGrid} onCheckedChange={setShowGrid} />
                    </div>
                </div>
            </div>
        </div>
    );
}
