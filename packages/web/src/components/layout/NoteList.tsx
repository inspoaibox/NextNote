import { useState } from 'react';
import { useNoteStore, useFolderStore } from '../../stores';
import { apiService } from '../../services';
import { useI18n } from '../../i18n';
import styles from './NoteList.module.css';

interface NoteListProps {
  onOpenSidebar?: () => void;
}

export function NoteList({ onOpenSidebar }: NoteListProps) {
  const { t } = useI18n();
  const { getNotesByFolder, selectedNoteId, selectNote, searchQuery, setSearchQuery, createEncryptedNote, deleteNote } = useNoteStore();
  const { selectedFolderId } = useFolderStore();
  const [isCreating, setIsCreating] = useState(false);

  // 根据选中的文件夹筛选笔记
  const notes = getNotesByFolder(selectedFolderId);

  const pinnedNotes = notes.filter((n) => n.isPinned);
  const unpinnedNotes = notes.filter((n) => !n.isPinned);

  const handleNewNote = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      // 创建笔记时使用当前选中的文件夹
      await createEncryptedNote('', '', selectedFolderId, []);
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteNote = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t('notes.deleteConfirm'))) return;
    try {
      await apiService.deleteNote(noteId);
      deleteNote(noteId);
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  return (
    <div className={styles.noteList}>
      <div className={styles.mobileHeader}>
        <button className={styles.menuButton} onClick={onOpenSidebar} aria-label="Open menu">
          ☰
        </button>
        <span className={styles.mobileTitle}>{t('notes.title')}</span>
      </div>
      <div className={styles.header}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={t('notes.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles.clearSearch}
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <button className={styles.newNoteButton} onClick={handleNewNote} disabled={isCreating}>
          <span>+</span> {isCreating ? t('notes.creating') : t('notes.newNote')}
        </button>
      </div>

      <div className={styles.list}>
        {pinnedNotes.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>📌 {t('notes.pinned')}</div>
            {pinnedNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isSelected={note.id === selectedNoteId}
                onSelect={() => selectNote(note.id)}
                onDelete={(e) => handleDeleteNote(note.id, e)}
              />
            ))}
          </div>
        )}

        {unpinnedNotes.length > 0 && (
          <div className={styles.section}>
            {pinnedNotes.length > 0 && <div className={styles.sectionTitle}>{t('notes.title')}</div>}
            {unpinnedNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isSelected={note.id === selectedNoteId}
                onSelect={() => selectNote(note.id)}
                onDelete={(e) => handleDeleteNote(note.id, e)}
              />
            ))}
          </div>
        )}

        {notes.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📝</div>
            <p className={styles.emptyText}>
              {searchQuery ? t('notes.noResults') : t('notes.empty')}
            </p>
            <p className={styles.emptyHint}>
              {searchQuery ? t('notes.tryDifferent') : t('notes.createFirst')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface NoteItemProps {
  note: ReturnType<typeof useNoteStore.getState>['notes'][0];
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function NoteItem({ note, isSelected, onSelect, onDelete }: NoteItemProps) {
  const { t } = useI18n();
  const { isNoteUnlocked } = useNoteStore();

  // 如果笔记加密且未解锁，隐藏预览内容
  const isLocked = note.isPasswordProtected && !isNoteUnlocked(note.id);
  const preview = isLocked ? '' : note.content.slice(0, 100).replace(/[#*`]/g, '');
  const displayTitle = isLocked ? t('notes.locked') : note.title || t('notes.untitled');
  const date = new Date(note.updatedAt).toLocaleDateString();

  return (
    <div className={`${styles.noteItem} ${isSelected ? styles.selected : ''}`}>
      <button className={styles.noteContent} onClick={onSelect}>
        <div className={styles.noteTitle}>
          {note.isPasswordProtected && <span className={styles.lockIcon}>🔒</span>}
          {displayTitle}
        </div>
        <div className={styles.notePreview}>
          {isLocked ? t('notes.enterPasswordToView') : preview || t('notes.noContent')}
        </div>
        <div className={styles.noteMeta}>
          <span className={styles.noteDate}>{date}</span>
          {!isLocked && note.tags.length > 0 && (
            <span className={styles.noteTags}>
              {note.tags.slice(0, 2).map((tag) => (
                <span key={tag} className={styles.tag}>#{tag}</span>
              ))}
            </span>
          )}
        </div>
      </button>
      <button className={styles.deleteButton} onClick={onDelete} title={t('common.delete')}>
        🗑️
      </button>
    </div>
  );
}
