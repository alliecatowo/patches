import type { PageBlock, RenderablePageBlock } from '@patches/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type JSX } from 'react';

import { api } from '../api/client.js';
import { useErrorToast } from '../hooks/useErrorToast.js';
import { decodePageDocument } from '../lib/page.js';
import { CloseIcon, TrashIcon } from './icons/Icons.js';
import { useToast } from './ToastProvider.js';
import styles from './EditWallDialog.module.css';

export interface EditWallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocument?: Uint8Array | undefined;
  handle: string;
}

type BlockType = 'Text' | 'NowPlaying' | 'Hero' | 'AsciiArt';

function extractInitialBlocks(currentDocument?: Uint8Array): PageBlock[] {
  if (!currentDocument || currentDocument.length === 0) return [];
  const decoded = decodePageDocument(currentDocument);
  if (!decoded?.pages[0]?.blocks) return [];
  return decoded.pages[0].blocks.filter(
    (b): b is PageBlock =>
      b.type === 'Text' ||
      b.type === 'Markdown' ||
      b.type === 'NowPlaying' ||
      b.type === 'Hero' ||
      b.type === 'AsciiArt' ||
      b.type === 'Links' ||
      b.type === 'Spacer' ||
      b.type === 'Image',
  );
}

export function EditWallDialog({
  isOpen,
  onClose,
  currentDocument,
  handle,
}: EditWallDialogProps): JSX.Element | null {
  const queryClient = useQueryClient();
  const onError = useErrorToast();
  const toast = useToast();

  const [blocks, setBlocks] = useState<PageBlock[]>(() => extractInitialBlocks(currentDocument));
  const [selectedType, setSelectedType] = useState<BlockType>('Text');
  const [bodyInput, setBodyInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [subtitleInput, setSubtitleInput] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleAddBlock = (): void => {
    if (selectedType === 'Text') {
      if (!bodyInput.trim()) return;
      setBlocks((prev) => [...prev, { type: 'Text', body: bodyInput.trim() }]);
      setBodyInput('');
    } else if (selectedType === 'NowPlaying') {
      if (!bodyInput.trim()) return;
      setBlocks((prev) => [...prev, { type: 'NowPlaying', text: bodyInput.trim() }]);
      setBodyInput('');
    } else if (selectedType === 'Hero') {
      if (!titleInput.trim()) return;
      setBlocks((prev) => [
        ...prev,
        { type: 'Hero', title: titleInput.trim(), subtitle: subtitleInput.trim() || undefined },
      ]);
      setTitleInput('');
      setSubtitleInput('');
    } else if (selectedType === 'AsciiArt') {
      if (!bodyInput.trim()) return;
      setBlocks((prev) => [...prev, { type: 'AsciiArt', art: bodyInput }]);
      setBodyInput('');
    }
  };

  const handleDeleteBlock = (index: number): void => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const doc = {
        version: 1,
        pages: [
          {
            slug: 'home',
            title: 'Home',
            blocks,
          },
        ],
      };
      const encoded = new TextEncoder().encode(JSON.stringify(doc));
      return await api.pages.updatePage({ document: encoded });
    },
    onSuccess: async () => {
      toast.pushToast({ message: 'Wall updated', tone: 'info' });
      await queryClient.invalidateQueries({ queryKey: ['page', handle] });
      onClose();
    },
    onError: (err) => onError(err),
  });

  if (!isOpen) return null;

  const getPreviewText = (block: RenderablePageBlock): string => {
    if (block.type === 'Text' || block.type === 'Markdown') return block.body;
    if (block.type === 'NowPlaying') return `♪ ${block.text}`;
    if (block.type === 'Hero')
      return `${block.title} ${block.subtitle ? `(${block.subtitle})` : ''}`;
    if (block.type === 'AsciiArt') return block.art.slice(0, 30);
    return `[${block.type}]`;
  };

  return (
    <div
      className={styles['overlay']}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit Profile Wall"
    >
      <div className={styles['dialog']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['header']}>
          <span className={styles['title']}>Edit Wall</span>
          <button type="button" className={styles['closeBtn']} onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className={styles['body']}>
          {/* Existing Blocks List */}
          <div className={styles['blockSection']}>
            <span className={styles['sectionTitle']}>Wall Blocks ({blocks.length})</span>
            {blocks.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
                Your wall is empty. Add blocks below!
              </p>
            ) : (
              <div className={styles['existingBlockList']}>
                {blocks.map((block, idx) => (
                  <div key={idx} className={styles['existingBlockCard']}>
                    <div className={styles['blockCardContent']}>
                      <span className={styles['blockCardType']}>{block.type}</span>
                      <span className={styles['blockCardPreview']}>{getPreviewText(block)}</span>
                    </div>
                    <button
                      type="button"
                      className={styles['deleteBlockBtn']}
                      onClick={() => handleDeleteBlock(idx)}
                      aria-label="Remove block"
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Block */}
          <div className={styles['blockSection']}>
            <span className={styles['sectionTitle']}>Add New Block</span>
            <div className={styles['addBlockForm']}>
              <div className={styles['typeSelector']}>
                <button
                  type="button"
                  className={`${styles['typeBtn']} ${selectedType === 'Text' ? styles['active'] : ''}`}
                  onClick={() => setSelectedType('Text')}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`${styles['typeBtn']} ${selectedType === 'NowPlaying' ? styles['active'] : ''}`}
                  onClick={() => setSelectedType('NowPlaying')}
                >
                  Now Playing
                </button>
                <button
                  type="button"
                  className={`${styles['typeBtn']} ${selectedType === 'Hero' ? styles['active'] : ''}`}
                  onClick={() => setSelectedType('Hero')}
                >
                  Hero
                </button>
                <button
                  type="button"
                  className={`${styles['typeBtn']} ${selectedType === 'AsciiArt' ? styles['active'] : ''}`}
                  onClick={() => setSelectedType('AsciiArt')}
                >
                  ASCII Art
                </button>
              </div>

              {selectedType === 'Hero' ? (
                <>
                  <input
                    className={styles['formInput']}
                    placeholder="Hero Headline"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                  />
                  <input
                    className={styles['formInput']}
                    placeholder="Subtitle (optional)"
                    value={subtitleInput}
                    onChange={(e) => setSubtitleInput(e.target.value)}
                  />
                </>
              ) : selectedType === 'NowPlaying' ? (
                <input
                  className={styles['formInput']}
                  placeholder="Song or Track Title (e.g. Daft Punk - Digital Love)"
                  value={bodyInput}
                  onChange={(e) => setBodyInput(e.target.value)}
                />
              ) : selectedType === 'AsciiArt' ? (
                <textarea
                  className={styles['formTextarea']}
                  placeholder="Paste ASCII art..."
                  value={bodyInput}
                  onChange={(e) => setBodyInput(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
              ) : (
                <textarea
                  className={styles['formTextarea']}
                  placeholder="Write text or markdown for your wall..."
                  value={bodyInput}
                  onChange={(e) => setBodyInput(e.target.value)}
                />
              )}

              <button
                type="button"
                className={styles['addBlockActionBtn']}
                onClick={handleAddBlock}
              >
                + Add Block
              </button>
            </div>
          </div>
        </div>

        <div className={styles['footer']}>
          <button type="button" className={styles['cancelBtn']} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles['saveBtn']}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save Wall'}
          </button>
        </div>
      </div>
    </div>
  );
}
