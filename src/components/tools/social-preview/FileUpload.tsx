import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileImage, FileVideo, Replace, UploadCloud, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AssetMetadata } from './previewHelpers';

interface FileUploadProps {
    file: File | null;
    previewUrl: string | null;
    metadata?: AssetMetadata | null;
    onFileSelect: (file: File | null) => void;
}

export function FileUpload({ file, previewUrl, metadata, onFileSelect }: FileUploadProps) {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        onFileSelect(acceptedFiles[0] ?? null);
    }, [onFileSelect]);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
            'video/*': ['.mp4', '.webm', '.mov'],
        },
        maxFiles: 1,
        multiple: false,
        noClick: !!file,
        noKeyboard: !!file,
    });

    const isVideo = file?.type.startsWith('video/');
    const TypeIcon = isVideo ? FileVideo : FileImage;

    if (file) {
        return (
            <div className="tool-surface overflow-hidden rounded-xl">
                <div className="flex gap-3 p-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {previewUrl && isVideo ? (
                            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
                        ) : previewUrl ? (
                            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center">
                                <TypeIcon className="h-6 w-6 text-slate-400" />
                            </div>
                        )}
                        <div className="absolute bottom-1 left-1 rounded bg-black/60 p-1 text-white">
                            <TypeIcon className="h-3.5 w-3.5" />
                        </div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-950" title={file.name}>{file.name}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                    {metadata ? ` / ${metadata.width}x${metadata.height}px` : ''}
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 rounded-md text-slate-400 hover:text-red-600"
                                onClick={() => onFileSelect(null)}
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Remove asset</span>
                            </Button>
                        </div>

                        <div {...getRootProps()} className="mt-3">
                            <input {...getInputProps()} />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg border-0 bg-slate-50 hover:bg-blue-50"
                                onClick={open}
                            >
                                <Replace className="mr-2 h-3.5 w-3.5" />
                                Replace
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            {...getRootProps()}
            className={cn(
                'group cursor-pointer rounded-xl border border-dashed p-6 text-center transition-all',
                isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 bg-white shadow-[0_10px_28px_-24px_rgba(37,99,235,0.35),0_1px_3px_rgba(15,23,42,0.05)] hover:border-primary/40 hover:bg-blue-50/30',
            )}
        >
            <input {...getInputProps()} />
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-950">
                {isDragActive ? 'Drop asset here' : 'Upload asset'}
            </p>
            <p className="mt-1 text-xs text-slate-500">JPG, PNG, WebP, MP4, MOV</p>
        </div>
    );
}
