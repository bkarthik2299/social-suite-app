import { describe, expect, it } from 'vitest';

import { PlatformFormat } from './platformSpecs';
import { getFitAssessment, getSafeZoneStyle } from './previewHelpers';

const reelFormat: PlatformFormat = {
    id: 'test-reel',
    label: 'Reel',
    width: 1080,
    height: 1920,
    aspectLabel: '9:16',
};

describe('getFitAssessment', () => {
    it('passes assets within 2 percent of the target ratio', () => {
        const result = getFitAssessment({ width: 1080, height: 1920 }, reelFormat, 'crop');

        expect(result.status).toBe('pass');
        expect(result.ratioDeltaPercent).toBe(0);
    });

    it('warns for small aspect-ratio drift', () => {
        const result = getFitAssessment({ width: 1080, height: 1800 }, reelFormat, 'crop');

        expect(result.status).toBe('warn');
        expect(result.impactAxis).toBe('width');
        expect(result.message).toContain('cropped');
    });

    it('flags mismatches and reports fit padding when crop mode is off', () => {
        const result = getFitAssessment({ width: 1080, height: 1080 }, reelFormat, 'fit');

        expect(result.status).toBe('mismatch');
        expect(result.impactAxis).toBe('height');
        expect(result.message).toContain('padded');
    });
});

describe('getSafeZoneStyle', () => {
    it('renders a single top inset as a top strip', () => {
        const style = getSafeZoneStyle({ type: 'danger', top: 240 }, reelFormat);

        expect(style.top).toBe(0);
        expect(style.left).toBe(0);
        expect(style.right).toBe(0);
        expect(style.height).toBe('12.5%');
    });

    it('renders combined edges as an anchored rail', () => {
        const style = getSafeZoneStyle({ type: 'warning', right: 90, top: 360, bottom: 420 }, reelFormat);

        expect(style.right).toBe(0);
        expect(style.width).toBe(`${(90 / 1080) * 100}%`);
        expect(style.top).toBe('18.75%');
        expect(style.bottom).toBe('21.875%');
    });
});
