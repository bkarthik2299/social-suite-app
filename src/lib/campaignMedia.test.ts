import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_MEDIA_MAX_BYTES,
  getCarouselLimit,
  inferCampaignMediaKind,
  normalizeCampaignMediaAssets,
  normalizeCampaignMediaFormat,
  validateCampaignMediaFile,
} from './campaignMedia';

describe('campaign media helpers', () => {
  it('accepts supported images, GIFs, and videos within the 10 MB limit', () => {
    expect(validateCampaignMediaFile({ name: 'creative.gif', type: 'image/gif', size: 1024 }).valid).toBe(true);
    expect(validateCampaignMediaFile({ name: 'creative.mp4', type: 'video/mp4', size: CAMPAIGN_MEDIA_MAX_BYTES }).valid).toBe(true);
  });

  it('rejects unsupported files and files over the upload limit', () => {
    expect(validateCampaignMediaFile({ name: 'creative.svg', type: 'image/svg+xml', size: 1024 }).valid).toBe(false);
    expect(validateCampaignMediaFile({ name: 'large.webm', type: 'video/webm', size: CAMPAIGN_MEDIA_MAX_BYTES + 1 }).valid).toBe(false);
  });

  it('normalizes ordered assets and preserves legacy single-image content', () => {
    const normalized = normalizeCampaignMediaAssets({
      mediaAssets: [
        { id: 'one', url: 'https://example.com/one.png', kind: 'image' },
        { id: 'two', url: 'https://example.com/two.mp4', mimeType: 'video/mp4' },
      ],
    });

    expect(normalized.map((asset) => asset.id)).toEqual(['one', 'two']);
    expect(normalized[1].kind).toBe('video');
    expect(normalizeCampaignMediaFormat(undefined, normalized.length)).toBe('carousel');

    const legacy = normalizeCampaignMediaAssets({}, 'https://example.com/legacy.gif');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].kind).toBe('image');
  });

  it('uses the current platform-specific carousel limits', () => {
    expect(getCarouselLimit(['instagram', 'facebook'], 'post')).toBe(10);
    expect(getCarouselLimit('linkedin', 'post')).toBe(10);
    expect(getCarouselLimit(['instagram', 'twitter'], 'post')).toBe(4);
    expect(getCarouselLimit('twitter', 'ad')).toBe(10);
    expect(inferCampaignMediaKind('https://example.com/clip.mov')).toBe('video');
  });
});
