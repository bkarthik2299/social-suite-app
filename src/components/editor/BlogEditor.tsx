import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { PartialBlock } from "@blocknote/core";
import { useCallback, useRef } from "react";

interface BlogEditorProps {
    initialContent?: string;
    onChange?: (content: string, plainText: string) => void;
    editable?: boolean;
}

export function BlogEditor({ initialContent, onChange, editable = true }: BlogEditorProps) {
    // Parse initial content from JSON string
    const getInitialBlocks = (): PartialBlock[] | undefined => {
        if (!initialContent) return undefined;
        try {
            const parsed = JSON.parse(initialContent);
            return Array.isArray(parsed) ? parsed : undefined;
        } catch {
            // If not valid JSON, create a paragraph with the text
            return initialContent ? [{ type: "paragraph", content: initialContent }] : undefined;
        }
    };

    // Image upload handler - converts to base64 for demo
    const uploadFile = useCallback(async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Failed to read file'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }, []);

    const editor = useCreateBlockNote({
        initialContent: getInitialBlocks(),
        uploadFile,
    });

    // Extract plain text from blocks for SEO preview
    const extractPlainText = useCallback((blocks: PartialBlock[]): string => {
        const textParts: string[] = [];

        const processContent = (content: unknown) => {
            if (!content) return;
            if (typeof content === 'string') {
                textParts.push(content);
                return;
            }
            if (Array.isArray(content)) {
                content.forEach(item => {
                    if (typeof item === 'string') {
                        textParts.push(item);
                    } else if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
                        textParts.push(item.text);
                    } else if (item && typeof item === 'object' && 'content' in item) {
                        processContent(item.content);
                    }
                });
            }
        };

        blocks.forEach(block => {
            if (block.content) {
                processContent(block.content);
            }
            if (block.children && Array.isArray(block.children)) {
                textParts.push(extractPlainText(block.children));
            }
        });

        return textParts.join(' ').trim();
    }, []);

    const handleChange = () => {
        if (onChange) {
            const blocks = editor.document;
            const jsonContent = JSON.stringify(blocks);
            const plainText = extractPlainText(blocks);
            onChange(jsonContent, plainText);
        }
    };

    return (
        <div className="blocknote-editor-wrapper">
            <style>{`
                /* H1 - Largest body heading, but smaller than title */
                .blocknote-editor-wrapper h1,
                .blocknote-editor-wrapper [data-content-type="heading"][data-level="1"],
                .blocknote-editor-wrapper [data-level="1"] {
                    font-size: 1.5rem !important;
                    line-height: 2rem !important;
                    font-weight: 700 !important;
                }
                /* H2 - Medium heading */
                .blocknote-editor-wrapper h2,
                .blocknote-editor-wrapper [data-content-type="heading"][data-level="2"],
                .blocknote-editor-wrapper [data-level="2"] {
                    font-size: 1.25rem !important;
                    line-height: 1.75rem !important;
                    font-weight: 600 !important;
                }
                /* H3 - Small heading */
                .blocknote-editor-wrapper h3,
                .blocknote-editor-wrapper [data-content-type="heading"][data-level="3"],
                .blocknote-editor-wrapper [data-level="3"] {
                    font-size: 1.125rem !important;
                    line-height: 1.5rem !important;
                    font-weight: 600 !important;
                }
            `}</style>
            <BlockNoteView
                editor={editor}
                editable={editable}
                onChange={handleChange}
                theme="light"
            />
        </div>
    );
}

export default BlogEditor;
