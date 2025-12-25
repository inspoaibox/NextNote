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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" style="max-width:100%"/>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/^\s*[-*+] (.*$)/gim, '<li>$1</li>')
    .replace(/^\s*\d+\. (.*$)/gim, '<li>$1</li>')
    .replace(/^---$/gim, '<hr/>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/(<li>.*?<\/li>)(<br\/>)?/g, '$1');
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
    unlockedNoteIds,
  } = useNoteStore();
  
  const note = getSelectedNote();
  
  // 同步计算锁定状态，避免闪烁
  const isLocked = useMemo(() => {
    if (!note) return false;
    return note.isPasswordProtected && !unlockedNoteIds.has(note.id);
  }, [note, unlockedNoteIds]);
  
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showTagsDialog, setShowTagsDialog] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'set' | 'verify' | 'remove'>('set');
  const [isSyncing, setIsSyncing] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  
  const cloudSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentNoteIdRef = useRef<string | null>(null);

  // 只在非编辑模式下计算预览 HTML
  const previewHtml = useMemo(() => {
    if (editorMode === 'edit') return '';
    return markdownToHtml(content);
  }, [content, editorMode]);

  // 加载笔记数据
  useEffect(() => {
    // 切换笔记时，先同步之前的更改
    if (cloudSyncTimeoutRef.current) {
      clearTimeout(cloudSyncTimeoutRef.current);
      cloudSyncTimeoutRef.current = null;
    }

    if (note) {
      currentNoteIdRef.current = note.id;
      // 重置解锁表单
      setUnlockPassword('');
      setUnlockError('');
      
      if (!isLocked) {
        setContent(note.content);
        setTitle(note.title);
        setHasUnsavedChanges(false);
        loadVersions(note.id);
        loadShares(note.id);
      }
    } else {
      currentNoteIdRef.current = null;
      setContent('');
      setTitle('');
      setVersions([]);
      setShares([]);
      setHasUnsavedChanges(false);
    }

    return () => {
      if (cloudSyncTimeoutRef.current) {
        clearTimeout(cloudSyncTimeoutRef.current);
      }
    };
  }, [note?.id, isLocked]);

  const loadVersions = async (noteId: string) => {
    const result = await apiService.getNoteVersions(noteId);
    if (result.data) {
      setVersions(result.data.map((v) => ({
        id: v.id, noteId, content: '', size: v.size,
        createdAt: new Date(v.createdAt).getTime(),
      })));
    }
  };

  const loadShares = async (noteId: string) => {
    const result = await apiService.getNoteShares(noteId);
    if (result.data) {
      setShares(result.data.map((s) => ({
        id: s.id, recipientEmail: s.recipientEmail,
        permission: s.permission, createdAt: new Date(s.createdAt).getTime(),
      })));
    }
  };

  // 同步到云端 - 10秒防抖
  const scheduleCloudSync = useCallback((noteId: string, newTitle: string, newContent: string) => {
    if (cloudSyncTimeoutRef.current) {
      clearTimeout(cloudSyncTimeoutRef.current);
    }
    
    cloudSyncTimeoutRef.current = setTimeout(async () => {
      if (currentNoteIdRef.current !== noteId) return;
      
      setIsSyncing(true);
      try {
        await updateEncryptedNote(noteId, { title: newTitle, content: newContent });
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Failed to sync to cloud:', error);
      } finally {
        setIsSyncing(false);
      }
    }, 10000); // 10秒后同步到云端
  }, [updateEncryptedNote]);

  // 标题变化 - 立即保存到本地 store
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setHasUnsavedChanges(true);
    if (note) {
      // 立即更新本地 store
      updateNote(note.id, { title: newTitle });
      // 延迟同步到云端
      scheduleCloudSync(note.id, newTitle, content);
    }
  }, [note, content, updateNote, scheduleCloudSync]);

  // 内容变化 - 立即保存到本地 store
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasUnsavedChanges(true);
    if (note) {
      // 立即更新本地 store
      updateNote(note.id, { content: newContent });
      // 延迟同步到云端
      scheduleCloudSync(note.id, title, newContent);
    }
  }, [note, title, updateNote, scheduleCloudSync]);

  // 插入图片到编辑器
  const insertImage = useCallback((dataUrl: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !note) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const imageName = `image-${Date.now()}`;
    const imageMarkdown = `![${imageName}](${dataUrl})`;
    const newContent = content.substring(0, start) + imageMarkdown + content.substring(end);
    
    setContent(newContent);
    setHasUnsavedChanges(true);
    updateNote(note.id, { content: newContent });
    scheduleCloudSync(note.id, title, newContent);

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + imageMarkdown.length;
        textareaRef.current.focus();
      }
    });
  }, [content, title, note, updateNote, scheduleCloudSync]);

  // 图片粘贴处理 - 支持多种来源
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (!note) return;
    
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // 方法1: 优先检查 files (最可靠的方式)
    const files = clipboardData.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          setIsUploadingImage(true);
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            insertImage(dataUrl);
          } catch (error) {
            console.error('Failed to paste image from files:', error);
          } finally {
            setIsUploadingImage(false);
          }
          return;
        }
      }
    }

    // 方法2: 检查 items (适用于截图)
    const items = clipboardData.items;
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          setIsUploadingImage(true);
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            insertImage(dataUrl);
          } catch (error) {
            console.error('Failed to paste image:', error);
          } finally {
            setIsUploadingImage(false);
          }
          return;
        }
      }
    }

    // 方法3: 检查 HTML 内容中的图片 (适用于从网页复制图片)
    const htmlData = clipboardData.getData('text/html');
    if (htmlData) {
      // 匹配 img 标签的 src
      const imgMatch = htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        const imgSrc = imgMatch[1];
        if (imgSrc.startsWith('data:image/') || imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
          e.preventDefault();
          setIsUploadingImage(true);
          try {
            let dataUrl = imgSrc;
            
            // 如果是网络图片，尝试转换为 data URL
            if (imgSrc.startsWith('http')) {
              try {
                const response = await fetch(imgSrc, { mode: 'cors' });
                const blob = await response.blob();
                dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              } catch {
                // 如果无法获取，直接使用原始 URL
                dataUrl = imgSrc;
              }
            }
            
            insertImage(dataUrl);
          } catch (error) {
            console.error('Failed to paste image from HTML:', error);
          } finally {
            setIsUploadingImage(false);
          }
          return;
        }
      }
    }
  }, [note, insertImage]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || !note) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        setIsUploadingImage(true);
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          insertImage(dataUrl);
        } catch (error) {
          console.error('Failed to drop image:', error);
        } finally {
          setIsUploadingImage(false);
        }
        break;
      }
    }
  }, [note, insertImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleTogglePin = async () => {
    if (note) {
      try {
        await apiService.pinNote(note.id, !note.isPinned);
        await reloadNote(note.id);
      } catch (error) {
        console.error('Failed to toggle pin:', error);
      }
    }
  };

  const handleLockClick = () => {
    if (note) {
      setPasswordMode(note.isPasswordProtected ? 'remove' : 'set');
      setShowPasswordDialog(true);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!note) return false;
    if (passwordMode === 'set') {
      const success = await setNotePassword(note.id, password);
      if (success) { selectNote(null); return true; }
      return false;
    } else if (passwordMode === 'remove') {
      return await removeNotePassword(note.id, password);
    } else if (passwordMode === 'verify') {
      const valid = await verifyNotePassword(note.id, password);
      if (valid) {
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
    }
  };

  // 内联解锁笔记
  const handleInlineUnlock = async () => {
    if (!note || !unlockPassword) return;
    
    const valid = await verifyNotePassword(note.id, unlockPassword);
    if (valid) {
      // 解锁成功后，isNoteUnlocked 会返回 true，isLocked 会自动变为 false
      setUnlockPassword('');
      setUnlockError('');
      // 加载笔记内容
      setContent(note.content);
      setTitle(note.title);
      loadVersions(note.id);
      loadShares(note.id);
    } else {
      setUnlockError(t('passwordDialog.incorrectPassword'));
    }
  };

  const handleUnlockKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInlineUnlock();
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
      if (!kek || !note.encryptedDEK) throw new Error('Encryption not available');
      const encryptedShareKey = JSON.stringify(note.encryptedDEK);
      const result = await apiService.shareNote(note.id, { recipientEmail: email, permission, encryptedShareKey });
      if (result.data) loadShares(note.id);
    } catch (error) {
      console.error('Failed to share note:', error);
      throw error;
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!note) return;
    try {
      const result = await apiService.revokeShare(note.id, shareId);
      if (result.data?.success) setShares((prev) => prev.filter((s) => s.id !== shareId));
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

  const handleExportPDF = () => {
    if (note) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
          <style>body{font-family:system-ui;padding:40px;max-width:800px;margin:0 auto}
          pre{background:#f5f5f5;padding:15px;border-radius:5px}</style></head>
          <body><h1>${title}</h1><div>${previewHtml}</div></body></html>`);
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
      try {
        await updateEncryptedNote(note.id, { tags: newTags });
      } catch (error) {
        console.error('Failed to save tags:', error);
      }
    }
  };

  const cycleEditorMode = () => {
    const modes: EditorMode[] = ['edit', 'split', 'preview'];
    const idx = modes.indexOf(editorMode);
    setEditorMode(modes[(idx + 1) % modes.length]);
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
      <div className={styles.editor}>
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onBack} aria-label="Back">←</button>
          <span className={styles.lockedTitle}>🔒 {note.title || t('notes.untitled')}</span>
        </div>
        <div className={styles.lockedContent}>
          <div className={styles.lockIcon}>🔒</div>
          <p className={styles.lockText}>{t('notes.locked')}</p>
          <p className={styles.lockHint}>{t('notes.enterPasswordToView')}</p>
          <div className={styles.unlockForm}>
            <input
              type="password"
              className={styles.unlockInput}
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              onKeyDown={handleUnlockKeyDown}
              placeholder={t('passwordDialog.enterPlaceholder')}
              autoFocus
            />
            <button
              className={styles.unlockButton}
              onClick={handleInlineUnlock}
              disabled={!unlockPassword}
            >
              {t('auth.unlock')}
            </button>
          </div>
          {unlockError && <p className={styles.unlockError}>{unlockError}</p>}
        </div>
      </div>
    );
  }


  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack} aria-label="Back">←</button>
        <input type="text" className={styles.titleInput} value={title}
          onChange={handleTitleChange} placeholder={t('notes.untitled')} />
        <div className={styles.toolbar}>
          <button className={styles.toolbarButton} title={getModeTitle()} onClick={cycleEditorMode}>
            {getModeIcon()}
          </button>
          <button className={styles.toolbarButton} title={note.isPinned ? t('editor.unpin') : t('editor.pin')}
            onClick={handleTogglePin}>
            {note.isPinned ? '📌' : '📍'}
          </button>
          <button className={styles.toolbarButton}
            title={note.isPasswordProtected ? t('editor.removePassword') : t('editor.setPassword')}
            onClick={handleLockClick}>
            {note.isPasswordProtected ? '🔒' : '🔓'}
          </button>
          <button className={styles.toolbarButton} title={t('editor.share')}
            onClick={() => setShowShareDialog(true)}>🔗</button>
          <button className={styles.toolbarButton} title={t('editor.history')}
            onClick={() => setShowVersionHistory(true)}>📜</button>
          <div className={styles.moreMenuWrapper}>
            <button className={styles.toolbarButton} title={t('editor.moreOptions')}
              onClick={() => setShowMoreMenu(!showMoreMenu)}>⋯</button>
            {showMoreMenu && (
              <div className={styles.moreMenu}>
                <button className={styles.menuItem} onClick={handleExportMarkdown}>
                  📤 {t('editor.exportMarkdown')}
                </button>
                <button className={styles.menuItem} onClick={handleExportPDF}>
                  📄 {t('editor.exportPDF')}
                </button>
                <button className={styles.menuItem} onClick={handleManageTags}>
                  🏷️ {t('editor.manageTags')}
                </button>
                <hr className={styles.menuDivider} />
                <button className={`${styles.menuItem} ${styles.danger}`} onClick={handleDeleteNote}>
                  🗑️ {t('editor.deleteNote')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          {t('editor.lastEdited')}: {new Date(note.updatedAt).toLocaleString()}
          {hasUnsavedChanges && !isSyncing && ` (${t('editor.unsaved')})`}
          {isSyncing && ` (${t('editor.syncing')})`}
          {isUploadingImage && ` (${t('editor.uploadingImage')})`}
        </span>
        {note.tags.length > 0 && (
          <span className={styles.tags}>
            {note.tags.map((tag) => (<span key={tag} className={styles.tag}>#{tag}</span>))}
          </span>
        )}
      </div>

      <div className={`${styles.editorContent} ${styles[editorMode]}`}>
        {(editorMode === 'edit' || editorMode === 'split') && (
          <textarea ref={textareaRef} className={styles.content} value={content}
            onChange={handleContentChange} onPaste={handlePaste} onDrop={handleDrop}
            onDragOver={handleDragOver} placeholder={t('editor.placeholder')} />
        )}
        {(editorMode === 'preview' || editorMode === 'split') && (
          <div className={styles.preview} dangerouslySetInnerHTML={{ __html: previewHtml }} />
        )}
      </div>

      <VersionHistory isOpen={showVersionHistory} onClose={() => setShowVersionHistory(false)}
        versions={versions} currentContent={content} onRestore={handleVersionRestore} />
      <PasswordDialog isOpen={showPasswordDialog} onClose={handlePasswordDialogClose}
        mode={passwordMode} title={passwordMode === 'remove' ? t('editor.removePassword') : undefined}
        onSubmit={handlePasswordSubmit} />
      <ShareDialog isOpen={showShareDialog} onClose={() => setShowShareDialog(false)}
        noteTitle={title || 'Untitled'} existingShares={shares} onShare={handleShare}
        onRevoke={handleRevokeShare} />
      <TagsDialog isOpen={showTagsDialog} onClose={() => setShowTagsDialog(false)}
        tags={note.tags} onSave={handleSaveTags} />
    </div>
  );
}
