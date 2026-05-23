import type { CSSProperties } from 'react';
import type { PlatformFormat, SafeZone } from './platformSpecs';

export type CropMode = 'crop' | 'fit';
export type FitStatus = 'idle' | 'pass' | 'warn' | 'mismatch';

export type AssetMetadata = {
    width: number;
    height: number;
    kind: 'image' | 'video';
    duration?: number;
};

export type FitAssessment = {
    status: FitStatus;
    targetRatio: number;
    assetRatio?: number;
    ratioDelta?: number;
    ratioDeltaPercent?: number;
    impactPercent?: number;
    impactAxis?: 'width' | 'height';
    title: string;
    message: string;
};

const formatPercent = (value: number) => `${Math.round(value * 10) / 10}%`;

export function getAssetMetadata(file: File, mediaElement: HTMLImageElement | HTMLVideoElement): AssetMetadata {
    if (mediaElement instanceof HTMLVideoElement) {
        return {
            width: mediaElement.videoWidth,
            height: mediaElement.videoHeight,
            kind: 'video',
            duration: Number.isFinite(mediaElement.duration) ? mediaElement.duration : undefined,
        };
    }

    return {
        width: mediaElement.naturalWidth || mediaElement.width,
        height: mediaElement.naturalHeight || mediaElement.height,
        kind: file.type.startsWith('video/') ? 'video' : 'image',
    };
}

export function getFitAssessment(
    asset: Pick<AssetMetadata, 'width' | 'height'> | null | undefined,
    format: PlatformFormat,
    cropMode: CropMode,
): FitAssessment {
    const targetRatio = format.width / format.height;

    if (!asset?.width || !asset?.height) {
        return {
            status: 'idle',
            targetRatio,
            title: 'Ready to check',
            message: `Upload an asset to compare it with ${format.label}.`,
        };
    }

    const assetRatio = asset.width / asset.height;
    const ratioDelta = Math.abs(assetRatio - targetRatio) / targetRatio;
    const status: FitStatus = ratioDelta <= 0.02 ? 'pass' : ratioDelta <= 0.08 ? 'warn' : 'mismatch';
    const assetIsWider = assetRatio > targetRatio;
    const impactPercent = assetIsWider
        ? (1 - targetRatio / assetRatio) * 100
        : (1 - assetRatio / targetRatio) * 100;
    const impactAxis = cropMode === 'crop'
        ? assetIsWider ? 'width' : 'height'
        : assetIsWider ? 'height' : 'width';
    const impactVerb = cropMode === 'crop' ? 'cropped' : 'padded';
    const impactSide = impactAxis === 'width' ? 'left and right' : 'top and bottom';

    if (status === 'pass') {
        return {
            status,
            targetRatio,
            assetRatio,
            ratioDelta,
            ratioDeltaPercent: ratioDelta * 100,
            impactPercent: Math.max(0, impactPercent),
            impactAxis,
            title: 'Strong fit',
            message: `The asset is within ${formatPercent(ratioDelta * 100)} of the target aspect ratio.`,
        };
    }

    if (status === 'warn') {
        return {
            status,
            targetRatio,
            assetRatio,
            ratioDelta,
            ratioDeltaPercent: ratioDelta * 100,
            impactPercent,
            impactAxis,
            title: 'Minor adjustment',
            message: `${formatPercent(impactPercent)} of the ${impactAxis} will be ${impactVerb} around the ${impactSide}.`,
        };
    }

    return {
        status,
        targetRatio,
        assetRatio,
        ratioDelta,
        ratioDeltaPercent: ratioDelta * 100,
        impactPercent,
        impactAxis,
        title: 'Needs resize',
        message: `${formatPercent(impactPercent)} of the ${impactAxis} will be ${impactVerb} around the ${impactSide}.`,
    };
}

export function getSafeZoneStyle(zone: SafeZone, format: PlatformFormat): CSSProperties {
    const edges = ['top', 'bottom', 'left', 'right'].filter((edge) => zone[edge as keyof SafeZone] !== undefined);
    const style: CSSProperties = {
        position: 'absolute',
        zIndex: 30,
        pointerEvents: 'none',
    };

    const pctX = (value: number) => `${(value / format.width) * 100}%`;
    const pctY = (value: number) => `${(value / format.height) * 100}%`;

    if (edges.length === 1) {
        if (zone.top !== undefined) {
            return { ...style, top: 0, left: 0, right: 0, height: pctY(zone.top) };
        }
        if (zone.bottom !== undefined) {
            return { ...style, bottom: 0, left: 0, right: 0, height: pctY(zone.bottom) };
        }
        if (zone.left !== undefined) {
            return { ...style, top: 0, bottom: 0, left: 0, width: pctX(zone.left) };
        }
        if (zone.right !== undefined) {
            return { ...style, top: 0, bottom: 0, right: 0, width: pctX(zone.right) };
        }
    }

    if (zone.top !== undefined) style.top = pctY(zone.top);
    if (zone.bottom !== undefined) style.bottom = pctY(zone.bottom);
    if (zone.left !== undefined) {
        style.left = 0;
        style.width = pctX(zone.left);
    }
    if (zone.right !== undefined) {
        style.right = 0;
        style.width = pctX(zone.right);
    }

    if (style.top === undefined && style.bottom === undefined) {
        style.top = 0;
        style.bottom = 0;
    }
    if (style.left === undefined && style.right === undefined) {
        style.left = 0;
        style.right = 0;
    }

    return style;
}

export function formatRatio(value: number | undefined): string {
    if (!value || !Number.isFinite(value)) return '-';
    return value.toFixed(2).replace(/\.00$/, '');
}
