import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNoteStore, useSettingsStore } from '../../stores';
import { apiService } from '../../services';
import { useI18n } from '../../i18n';
import { VersionHistory } from '../version';
import { PasswordDialog } from '../password';
import { ShareDialog } from '../share';
import { TagsDialog } from '../tags';
import styles from './Editor.module.css';

interface EditorProps {
  onBack?: () => void;
}

interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  size: number;
  createdAt: number;
}

interface ShareInfo {
  id: string;
  recipientEmail: string;
  permission: 'view' | 'edit';
  createdAt: number;
}

type EditorMode = 'edit' | 'preview' | 'split';

// Simple Markdown to HTML converter
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Images
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" style="max-width:100%"/>')
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Blockquotes
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    // Unordered lists
    .replace(/^\s*[-*+] (.*$)/gim, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\. (.*$)/gim, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gim, '<hr/>')
    // Line breaks
    .replace(/\n/g, '<br/>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)(<br\/>)?/g, '$1');
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
  
  // Clean up multiple <br/>
  html = html.replace(/(<br\/>){3,}/g, '<br/><br/>');
  
  return html;
}

export function Editor({ onBack }: EditorProps) {
  const { t } = useI18n();
  const { editorMode, setEditorMode } = useSettingsStore();
  const {
    getSelectedNote,
    updateNote,
    updateEncryptedNote,
    deleteNote,
    selectNote,
    reloadNote,
    setNotePassword,
    removeNotePassword,
    verifyNotePassword,
    isNoteUnlocked,
  } = useNoteStore();
  const note = getSelectedNote();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'set' | 'verify' | 'remove'>('set');
  const [isSaving, setIsSaving] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 延迟渲染预览，避免输入时卡顿
  const [debouncedContent, setDebouncedContent] = useState('');
  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (editorMode === 'edit') {
      // 纯编辑模式不需要更新预览
      return;
    }
    
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    
    previewDebounceRef.current = setTimeout(() => {
      setDebouncedContent(content);
    }, 300); // 300ms 延迟更新预览
    
    return () => {
      if (previewDebounceRef.current) {
        clearTimeout(previewDebounceRef.current);
      }
    };
  }, [content, editorMode]);

  // Convert markdown to HTML for preview - 使用延迟的内容
  const previewHtml = useMemo(() => markdownToHtml(debouncedContent), [debouncedContent]);

  // 检查笔记是否需要解锁
  useEffect(() => {
    // 清理之前的保存定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingUpdatesRef.current = {};
    
    if (note) {
      if (note.isPasswordProtected && !isNoteUnlocked(note.id)) {
        setIsLocked(true);
        setPasswordMode('verify');
        setShowPasswordDialog(true);
      } else {
        setIsLocked(false);
        setContent(note.content);
        setTitle(note.title);
        setDebouncedContent(note.content);
        loadVersions(note.id);
        loadShares(note.id);
      }
    } else {
      setContent('');
      setTitle('');
      setDebouncedContent('');
      setVersions([]);
      setShares([]);
      setIsLocked(false);
    }
    
    // 组件卸载时清理
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [note?.id, note?.isPasswordProtected]);

  const loadVersions = async (noteId: string) => {
    const result = await apiService.getNoteVersions(noteId);
    if (result.data) {
      setVersions(
        result.data.map((v) => ({
          id: v.id,
          noteId,
          content: '',
          size: v.size,
          createdAt: new Date(v.createdAt).getTime(),
        }))
      );
    }
  };

  const loadShares = async (noteId: string) => {
    const result = await apiService.getNoteShares(noteId);
    if (result.data) {
      setShares(
        result.data.map((s) => ({
          id: s.id,
          recipientEmail: s.recipientEmail,
          permission: s.permission,
          createdAt: new Date(s.createdAt).getTime(),
        }))
      );
    }
  };

  // 待保存的更新缓存
  const pendingUpdatesRef = useRef<{ title?: string; content?: string }>({});
  
  // 防抖保存 - 增加到 2 秒，合并多次更新
  const debouncedSave = useCallback(
    (noteId: string, updates: { title?: string; content?: string }) => {
      // 合并更新
      pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
      
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(async () => {
        const pendingUpdates = pendingUpdatesRef.current;
        pendingUpdatesRef.current = {};
        
        if (Object.keys(pendingUpdates).length === 0) return;
        
        setIsSaving(true);
        try {
          await updateEncryptedNote(noteId, pendingUpdates);
        } catch (error) {
          console.error('Failed to save note:', error);
        } finally {
          setIsSaving(false);
        }
      }, 2000); // 增加到 2 秒
    },
    [updateEncryptedNote]
  );

  // Handle image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !note) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setIsUploadingImage(true);
        try {
          // Convert image to base64 data URL
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Insert markdown image at cursor position
          const textarea = textareaRef.current;
          if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const imageName = `image-${Date.now()}`;
            const imageMarkdown = `![${imageName}](${dataUrl})`;
            
            const newContent = content.substring(0, start) + imageMarkdown + content.substring(end);
            setContent(newContent);
            
            // Update note
            updateNote(note.id, { content: newContent });
            debouncedSave(note.id, { content: newContent });

            // Move cursor after the inserted image
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length;
              textarea.focus();
            }, 0);
          }
        } catch (error) {
          console.error('Failed to paste image:', error);
        } finally {
          setIsUploadingImage(false);
        }
        break;
      }
    }
  }, [content, note, updateNote, debouncedSave]);

  // Handle drag and drop for images
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || !note) return;

    for (const file of files) {
      if (file.type.startsWith('image/')) {
        setIsUploadingImage(true);
        try {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const imageName = file.name || `image-${Date.now()}`;
          const imageMarkdown = `\n![${imageName}](${dataUrl})\n`;
          
          const newContent = content + imageMarkdown;
          setContent(newContent);
          updateNote(note.id, { content: newContent });
          debouncedSave(note.id, { content: newContent });
        } catch (error) {
          console.error('Failed to drop image:', error);
        } finally {
          setIsUploadingImage(false);
        }
        break;
      }
    }
  }, [content, note, updateNote, debouncedSave]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (note) {
      // 只更新本地状态，不触发 store 更新
      debouncedSave(note.id, { title: newTitle });
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    if (note) {
      // 只更新本地状态，不触发 store 更新
      debouncedSave(note.id, { content: newContent });
    }
  };

  const handleTogglePin = () => {
    if (note) {
      updateNote(note.id, { isPinned: !note.isPinned });
    }
  };

  const handleLockClick = () => {
    if (note) {
      if (note.isPasswordProtected) {
        setPasswordMode('remove');
      } else {
        setPasswordMode('set');
      }
      setShowPasswordDialog(true);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!note) return false;

    if (passwordMode === 'set') {
      const success = await setNotePassword(note.id, password);
      if (success) {
        selectNote(null);
        return true;
      }
      return false;
    } else if (passwordMode === 'remove') {
      const success = await removeNotePassword(note.id, password);
      return success;
    } else if (passwordMode === 'verify') {
      const valid = await verifyNotePassword(note.id, password);
      if (valid) {
        setIsLocked(false);
        setContent(note.content);
        setTitle(note.title);
        loadVersions(note.id);
        loadShares(note.id);
        return true;
      }
      return false;
    }
    return false;
  };

  const handlePasswordDialogClose = () => {
    setShowPasswordDialog(false);
    if (passwordMode === 'verify' && isLocked) {
      selectNote(null);
      setIsLocked(false);
    }
  };

  const handleVersionRestore = async (versionId: string) => {
    if (!note) return;
    try {
      const result = await apiService.restoreNoteVersion(note.id, versionId);
      if (result.data?.success) {
        await reloadNote(note.id);
        const updatedNote = getSelectedNote();
        if (updatedNote) {
          setTitle(updatedNote.title);
          setContent(updatedNote.content);
        }
        loadVersions(note.id);
      }
    } catch (error) {
      console.error('Failed to restore version:', error);
    }
  };

  const handleShare = async (email: string, permission: 'view' | 'edit') => {
    if (!note) return;
    try {
      const { cryptoService } = await import('../../services');
      const kek = cryptoService.getKEK();
      if (!kek || !note.encryptedDEK) {
        throw new Error('Encryption not available');
      }
      
      const encryptedShareKey = JSON.stringify(note.encryptedDEK);
      
      const result = await apiService.shareNote(note.id, {
        recipientEmail: email,
        permission,
        encryptedShareKey,
      });
      if (result.data) {
        loadShares(note.id);
      }
    } catch (error) {
      console.error('Failed to share note:', error);
      throw error;
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!note) return;
    try {
      const result = await apiService.revokeShare(note.id, shareId);
      if (result.data?.success) {
        setShares((prev) => prev.filter((s) => s.id !== shareId));
      }
    } catch (error) {
      console.error('Failed to revoke share:', error);
      throw error;
    }
  };

  const handleDeleteNote = () => {
    if (note && confirm(t('notes.deleteConfirm'))) {
      deleteNote(note.id);
      selectNote(null);
      setShowMoreMenu(false);
    }
  };

  const handleExportMarkdown = () => {
    if (note) {
      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'untitled'}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setShowMoreMenu(false);
    }
  };

  const handleExportPDF = async () => {
    if (note) {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title || 'Untitled'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
            code { background: #f5f5f5; padding: 2px 5px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>${title || 'Untitled'}</h1>
          <div>${previewHtml}</div>
        </body>
        </html>
      `;
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
      }
      setShowMoreMenu(false);
    }
  };

  const handleManageTags = () => {
    setShowTagsDialog(true);
    setShowMoreMenu(false);
  };

  const handleSaveTags = async (newTags: string[]) => {
    if (note) {
      updateNote(note.id, { tags: newTags });
      try {
        await updateEncryptedNote(note.id, { tags: newTags });
      } catch (error) {
        console.error('Failed to save tags:', error);
      }
    }
  };

  const cycleEditorMode = () => {
    const modes: EditorMode[] = ['edit', 'split', 'preview'];
    const currentIndex = modes.indexOf(editorMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setEditorMode(modes[nextIndex]);
  };

  const getModeIcon = () => {
    switch (editorMode) {
      case 'edit': return '✏️';
      case 'preview': return '👁️';
      case 'split': return '⬛';
    }
  };

  const getModeTitle = () => {
    switch (editorMode) {
      case 'edit': return t('editor.modeEdit');
      case 'preview': return t('editor.modePreview');
      case 'split': return t('editor.modeSplit');
    }
  };

  if (!note) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📝</div>
        <p className={styles.emptyText}>{t('editor.selectNote')}</p>
        <p className={styles.emptyHint}>{t('editor.createHint')}</p>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🔒</div>
        <p className={styles.emptyText}>{t('notes.locked')}</p>
        <p className={styles.emptyHint}>{t('notes.enterPasswordToView')}</p>
        <PasswordDialog
          isOpen={showPasswordDialog}
          onClose={handlePasswordDialogClose}
          mode="verify"
          title={t('notes.unlockNote')}
          onSubmit={handlePasswordSubmit}
        />
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack} aria-label="Back to list">
          ←
        </button>
        <input
          type="text"
          className={styles.titleInput}
          value={title}
          onChange={handleTitleChange}
          placeholder={t('notes.untitled')}
        />
        <div className={styles.toolbar}>
          <button
            className={styles.toolbarButton}
            title={getModeTitle()}
            onClick={cycleEditorMode}
          >
            {getModeIcon()}
          </button>
          <button
            className={styles.toolbarButton}
            title={note.isPinned ? t('editor.unpin') : t('editor.pin')}
            onClick={handleTogglePin}
          >
            {note.isPinned ? '📌' : '📍'}
          </button>
          <button
            className={styles.toolbarButton}
            title={note.isPasswordProtected ? t('editor.removePassword') : t('editor.setPassword')}
            onClick={handleLockClick}
          >
            {note.isPasswordProtected ? '🔒' : '🔓'}
          </button>
          <button
            className={styles.toolbarButton}
            title={t('editor.share')}
            onClick={() => setShowShareDialog(true)}
          >
            🔗
          </button>
          <button
            className={styles.toolbarButton}
            title={t('editor.history')}
            onClick={() => setShowVersionHistory(true)}
          >
            📜
          </button>
          <div className={styles.moreMenuWrapper}>
            <button
              className={styles.toolbarButton}
              title={t('editor.moreOptions')}
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              ⋯
            </button>
            {showMoreMenu && (
              <div className={styles.moreMenu}>
                <button className={styles.menuItem} onClick={handleExportMarkdown}>📤 {t('editor.exportMarkdown')}</button>
                <button className={styles.menuItem} onClick={handleExportPDF}>📄 {t('editor.exportPDF')}</button>
                <button className={styles.menuItem} onClick={handleManageTags}>🏷️ {t('editor.manageTags')}</button>
                <hr className={styles.menuDivider} />
                <button className={styles.menuItem + ' ' + styles.danger} onClick={handleDeleteNote}>🗑️ {t('editor.deleteNote')}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          {t('editor.lastEdited')}: {new Date(note.updatedAt).toLocaleString()}
          {isSaving && ` (${t('editor.saving')})`}
          {isUploadingImage && ` (${t('editor.uploadingImage')})`}
        </span>
        {note.tags.length > 0 && (
          <span className={styles.tags}>
            {note.tags.map((tag) => (
              <span key={tag} className={styles.tag}>#{tag}</span>
            ))}
          </span>
        )}
      </div>

      <div className={`${styles.editorContent} ${styles[editorMode]}`}>
        {(editorMode === 'edit' || editorMode === 'split') && (
          <textarea
            ref={textareaRef}
            className={styles.content}
            value={content}
            onChange={handleContentChange}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            placeholder={t('editor.placeholder')}
          />
        )}
        {(editorMode === 'preview' || editorMode === 'split') && (
          <div 
            className={styles.preview}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        )}
      </div>

      {/* Dialogs */}
      <VersionHistory
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        versions={versions}
        currentContent={content}
        onRestore={handleVersionRestore}
      />

      <PasswordDialog
        isOpen={showPasswordDialog}
        onClose={handlePasswordDialogClose}
        mode={passwordMode}
        title={passwordMode === 'remove' ? t('editor.removePassword') : undefined}
        onSubmit={handlePasswordSubmit}
      />

      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        noteTitle={title || 'Untitled'}
        existingShares={shares}
        onShare={handleShare}
        onRevoke={handleRevokeShare}
      />

      <TagsDialog
        isOpen={showTagsDialog}
        onClose={() => setShowTagsDialog(false)}
        tags={note.tags}
        onSave={handleSaveTags}
      />
    </div>
  );
}
