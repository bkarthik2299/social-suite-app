import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Images,
  Plus,
  Trash2,
  UploadCloud,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_MEDIA_ACCEPT,
  CAMPAIGN_MEDIA_MAX_LABEL,
  type EditableCampaignMediaAsset,
} from '@/lib/campaignMedia';
import type { CampaignMediaAsset, CampaignMediaFormat } from '@/types';

type MediaContentProps = {
  asset: CampaignMediaAsset;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
};

export const CampaignMediaContent = ({
  asset,
  className,
  controls = false,
  autoPlay = false,
}: MediaContentProps) => asset.kind === 'video' ? (
  <video
    src={asset.url}
    className={cn('h-full w-full object-contain', className)}
    controls={controls}
    autoPlay={autoPlay}
    loop
    muted
    playsInline
    preload="metadata"
  />
) : (
  <img src={asset.url} alt={asset.name || 'Campaign media'} className={cn('h-full w-full object-contain', className)} />
);

type CampaignMediaPreviewProps = {
  assets: CampaignMediaAsset[];
  format: CampaignMediaFormat;
  platform: string;
  aspectClass: string;
  className?: string;
  onImageClick?: (url: string) => void;
};

export const CampaignMediaPreview = ({
  assets,
  format,
  platform,
  aspectClass,
  className,
  onImageClick,
}: CampaignMediaPreviewProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const carouselActive = format === 'carousel' && assets.length > 1;
  const safeIndex = Math.min(activeIndex, Math.max(assets.length - 1, 0));
  const asset = assets[safeIndex];

  useEffect(() => {
    setActiveIndex(0);
  }, [platform, format, assets.length]);

  if (!asset) {
    return (
      <div className={cn('flex w-full flex-col items-center justify-center gap-3 bg-slate-50', aspectClass, className)}>
        <ImageIcon className="h-8 w-8 text-slate-300" />
        <p className="text-xs text-slate-400">No media</p>
      </div>
    );
  }

  const previous = () => setActiveIndex((current) => (current - 1 + assets.length) % assets.length);
  const next = () => setActiveIndex((current) => (current + 1) % assets.length);
  const platformKey = platform.toLowerCase();
  const roundedSlides = platformKey.includes('twitter') || platformKey === 'x';

  return (
    <div className={cn('relative w-full overflow-hidden bg-white', aspectClass, roundedSlides && 'rounded-xl', className)}>
      {asset.kind === 'image' && onImageClick ? (
        <button
          type="button"
          onClick={() => onImageClick(asset.url)}
          className="h-full w-full cursor-zoom-in"
          aria-label={`Open media ${safeIndex + 1} preview`}
        >
          <CampaignMediaContent asset={asset} />
        </button>
      ) : (
        <CampaignMediaContent asset={asset} controls={asset.kind === 'video'} autoPlay={asset.kind === 'video'} />
      )}

      {carouselActive && (
        <>
          <Badge className="absolute right-2 top-2 border-0 bg-slate-950/70 text-[10px] text-white hover:bg-slate-950/70">
            {safeIndex + 1}/{assets.length}
          </Badge>
          <button
            type="button"
            onClick={previous}
            aria-label="Previous carousel item"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next carousel item"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/45 px-2 py-1 backdrop-blur-sm">
            {assets.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show carousel item ${index + 1}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === safeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/80',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

type CampaignMediaEditorProps = {
  assets: EditableCampaignMediaAsset[];
  format: CampaignMediaFormat;
  maxItems: number;
  disabled?: boolean;
  onFormatChange: (format: CampaignMediaFormat) => void;
  onFilesSelected: (files: File[]) => void;
  onRemove: (id: string) => void;
  onPreview?: (url: string) => void;
};

export const CampaignMediaEditor = ({
  assets,
  format,
  maxItems,
  disabled,
  onFormatChange,
  onFilesSelected,
  onRemove,
  onPreview,
}: CampaignMediaEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const allowedCount = format === 'carousel' ? maxItems : 1;
  const canAdd = assets.length < allowedCount;

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onFilesSelected(Array.from(files));
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => onFormatChange('single')}
          disabled={disabled}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
            format === 'single' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          <ImageIcon className="h-4 w-4" /> Single media
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('carousel')}
          disabled={disabled}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
            format === 'carousel' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          <GalleryHorizontalEnd className="h-4 w-4" /> Carousel
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={CAMPAIGN_MEDIA_ACCEPT}
        multiple={format === 'carousel'}
        onChange={(event) => handleFiles(event.target.files)}
        aria-label="Choose campaign media files"
      />

      {assets.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {assets.map((asset, index) => (
            <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {asset.kind === 'image' && onPreview ? (
                <button type="button" className="h-full w-full" onClick={() => onPreview(asset.url)}>
                  <CampaignMediaContent asset={asset} className="object-cover" />
                </button>
              ) : (
                <CampaignMediaContent asset={asset} className="object-cover" controls={asset.kind === 'video'} />
              )}
              <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-1 text-[10px] font-medium text-white">
                {asset.kind === 'video' ? <Video className="h-3 w-3" /> : <Images className="h-3 w-3" />}
                {index + 1}
              </div>
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute right-2 top-2 h-7 w-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
                onClick={() => onRemove(asset.id)}
                disabled={disabled}
                aria-label={`Remove media ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {canAdd && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-100 bg-blue-50/50 text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-semibold">Add media</span>
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex min-h-[160px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-100 bg-blue-50/50 p-8 text-center transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
        >
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <UploadCloud className="h-6 w-6 text-blue-600" />
          </span>
          <span className="text-sm font-semibold text-blue-900">Upload image, GIF, or video</span>
          <span className="mt-1 text-xs text-blue-700/80">
            JPG, PNG, WEBP, GIF, MP4, MOV or WEBM · {CAMPAIGN_MEDIA_MAX_LABEL} each
          </span>
        </button>
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{format === 'carousel' ? `Add 2–${maxItems} ordered slides.` : 'Use one image, GIF, or video.'}</span>
        <span>{assets.length}/{allowedCount}</span>
      </div>
    </div>
  );
};
