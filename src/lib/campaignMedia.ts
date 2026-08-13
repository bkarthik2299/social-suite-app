import { supabase } from '@/lib/supabase';
import type {
  CampaignMediaAsset,
  CampaignMediaFormat,
  CampaignMediaKind,
} from '@/types';
import { inferLogoPlacement, type LogoPlacement } from '../../supabase/functions/_shared/visual_asset';

export const CAMPAIGN_MEDIA_BUCKET = 'campaign-media';
export const CAMPAIGN_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const CAMPAIGN_MEDIA_MAX_LABEL = '10 MB';

export const CAMPAIGN_MEDIA_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
].join(',');

const ALLOWED_MEDIA_TYPES = new Set(CAMPAIGN_MEDIA_ACCEPT.split(','));

export type EditableCampaignMediaAsset = CampaignMediaAsset & {
  file?: File;
};

export type MediaFileValidation = {
  valid: boolean;
  message?: string;
};

const createAssetId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `media-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

export const inferCampaignMediaKind = (url = '', mimeType = ''): CampaignMediaKind => {
  if (mimeType.startsWith('video/')) return 'video';
  if (/^data:video\//i.test(url) || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)) return 'video';
  return 'image';
};

export const validateCampaignMediaFile = (file: Pick<File, 'name' | 'size' | 'type'>): MediaFileValidation => {
  if (!ALLOWED_MEDIA_TYPES.has(file.type.toLowerCase())) {
    return {
      valid: false,
      message: `${file.name} is not a supported image, GIF, or video file.`,
    };
  }

  if (file.size > CAMPAIGN_MEDIA_MAX_BYTES) {
    return {
      valid: false,
      message: `${file.name} is larger than ${CAMPAIGN_MEDIA_MAX_LABEL}.`,
    };
  }

  return { valid: true };
};

export const createPendingCampaignMediaAsset = (file: File): EditableCampaignMediaAsset => ({
  id: createAssetId(),
  url: URL.createObjectURL(file),
  kind: inferCampaignMediaKind('', file.type),
  name: file.name,
  mimeType: file.type,
  size: file.size,
  file,
});

const loadCanvasImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  if (/^https?:\/\//i.test(url)) image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('An image asset could not be loaded for logo placement.'));
  image.src = url;
});

const logoCoordinates = (
  placement: LogoPlacement,
  canvasWidth: number,
  canvasHeight: number,
  logoWidth: number,
  logoHeight: number,
  margin: number,
) => {
  const centeredX = (canvasWidth - logoWidth) / 2;
  const centeredY = (canvasHeight - logoHeight) / 2;
  const left = margin;
  const right = canvasWidth - logoWidth - margin;
  const top = margin;
  const bottom = canvasHeight - logoHeight - margin;

  const positions: Record<LogoPlacement, [number, number]> = {
    'top-left': [left, top],
    'top-right': [right, top],
    'bottom-left': [left, bottom],
    'bottom-right': [right, bottom],
    'top-center': [centeredX, top],
    'bottom-center': [centeredX, bottom],
    center: [centeredX, centeredY],
  };
  return positions[placement];
};

const generatedImageFile = async (
  imageUrl: string,
  index: number,
  logoUrl?: string,
  visualGuide = '',
) => {
  const baseImage = await loadCanvasImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = baseImage.naturalWidth;
  canvas.height = baseImage.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare the generated image.');
  context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

  if (logoUrl) {
    const logo = await loadCanvasImage(logoUrl);
    const maxLogoWidth = canvas.width * 0.2;
    const maxLogoHeight = canvas.height * 0.13;
    const scale = Math.min(maxLogoWidth / logo.naturalWidth, maxLogoHeight / logo.naturalHeight);
    const logoWidth = Math.max(1, logo.naturalWidth * scale);
    const logoHeight = Math.max(1, logo.naturalHeight * scale);
    const margin = Math.max(16, Math.min(canvas.width, canvas.height) * 0.045);
    const [x, y] = logoCoordinates(
      inferLogoPlacement(visualGuide),
      canvas.width,
      canvas.height,
      logoWidth,
      logoHeight,
      margin,
    );
    context.drawImage(logo, x, y, logoWidth, logoHeight);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The generated image could not be exported.')), 'image/png');
  });
  return new File([blob], `generated-slide-${index + 1}.png`, { type: 'image/png' });
};

export const prepareGeneratedCampaignMediaAssets = async (
  imageUrls: string[],
  options: { logoUrl?: string; visualGuide?: string } = {},
): Promise<EditableCampaignMediaAsset[]> => {
  const files = await Promise.all(imageUrls.map((imageUrl, index) => (
    generatedImageFile(imageUrl, index, options.logoUrl, options.visualGuide)
  )));
  return files.map(createPendingCampaignMediaAsset);
};

const recordValue = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

export const normalizeCampaignMediaAssets = (
  payload: Record<string, unknown>,
  legacyImage = '',
): CampaignMediaAsset[] => {
  const rawAssets = payload.mediaAssets ?? payload.media_assets;
  const assets = Array.isArray(rawAssets)
    ? rawAssets.flatMap((value): CampaignMediaAsset[] => {
        if (typeof value === 'string' && value.trim()) {
          return [{
            id: createAssetId(),
            url: value.trim(),
            kind: inferCampaignMediaKind(value.trim()),
          }];
        }

        const record = recordValue(value);
        const url = typeof record?.url === 'string' ? record.url.trim() : '';
        if (!record || !url) return [];

        const mimeType = typeof record.mimeType === 'string'
          ? record.mimeType
          : typeof record.mime_type === 'string' ? record.mime_type : undefined;
        const declaredKind = record.kind === 'video' || record.kind === 'image' ? record.kind : undefined;

        return [{
          id: typeof record.id === 'string' && record.id ? record.id : createAssetId(),
          url,
          kind: declaredKind || inferCampaignMediaKind(url, mimeType),
          name: typeof record.name === 'string' ? record.name : undefined,
          mimeType,
          size: typeof record.size === 'number' ? record.size : undefined,
          storagePath: typeof record.storagePath === 'string'
            ? record.storagePath
            : typeof record.storage_path === 'string' ? record.storage_path : undefined,
        }];
      })
    : [];

  if (assets.length) return assets;

  const fallbackUrl = legacyImage.trim();
  return fallbackUrl ? [{
    id: createAssetId(),
    url: fallbackUrl,
    kind: inferCampaignMediaKind(fallbackUrl),
  }] : [];
};

export const normalizeCampaignMediaFormat = (
  value: unknown,
  assetCount = 0,
): CampaignMediaFormat => value === 'carousel' || assetCount > 1 ? 'carousel' : 'single';

export const getCarouselLimit = (
  platforms: string | string[],
  placement: 'post' | 'ad' = 'ad',
): number => {
  const values = (Array.isArray(platforms) ? platforms : [platforms])
    .map((platform) => platform.toLowerCase());
  if (placement === 'ad') {
    return 10;
  }

  const platformLimits = values.map((platform) => {
    if (platform === 'x' || platform.includes('twitter')) return 4;
    return 10;
  });
  return platformLimits.length ? Math.min(...platformLimits) : 10;
};

const safeStorageFilename = (filename: string) => {
  const lastDot = filename.lastIndexOf('.');
  const extension = lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  const base = (lastDot >= 0 ? filename.slice(0, lastDot) : filename)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'asset';
  return `${base}${extension.replace(/[^a-z0-9.]/g, '')}`;
};

export const uploadCampaignMediaAssets = async (
  campaignId: string,
  assets: EditableCampaignMediaAsset[],
): Promise<CampaignMediaAsset[]> => {
  const uploadedPaths: string[] = [];

  try {
    const results: CampaignMediaAsset[] = [];
    for (const asset of assets) {
      if (!asset.file) {
        const { file: _file, ...persistedAsset } = asset;
        results.push(persistedAsset);
        continue;
      }

      const validation = validateCampaignMediaFile(asset.file);
      if (!validation.valid) throw new Error(validation.message);

      const path = `${campaignId}/${createAssetId()}-${safeStorageFilename(asset.file.name)}`;
      const { error } = await supabase.storage
        .from(CAMPAIGN_MEDIA_BUCKET)
        .upload(path, asset.file, {
          cacheControl: '3600',
          contentType: asset.file.type,
          upsert: false,
        });
      if (error) throw error;
      uploadedPaths.push(path);

      const { data } = supabase.storage.from(CAMPAIGN_MEDIA_BUCKET).getPublicUrl(path);
      results.push({
        id: asset.id,
        url: data.publicUrl,
        kind: asset.kind,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        storagePath: path,
      });
    }

    return results;
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage.from(CAMPAIGN_MEDIA_BUCKET).remove(uploadedPaths);
    }
    throw error;
  }
};

export const removeCampaignMediaAssets = async (paths: string[]) => {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  if (!uniquePaths.length) return;
  const { error } = await supabase.storage.from(CAMPAIGN_MEDIA_BUCKET).remove(uniquePaths);
  if (error) throw error;
};

export const revokePendingCampaignMediaAssets = (assets: EditableCampaignMediaAsset[]) => {
  assets.forEach((asset) => {
    if (asset.file && asset.url.startsWith('blob:')) URL.revokeObjectURL(asset.url);
  });
};
