import { useState } from 'react';
import { Button, Input, Modal } from '../ui';
import { useI18n } from '../../i18n';
import styles from './TagsDialog.module.css';

interface TagsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tags: string[];
  onSave: (tags: string[]) => void;
}

export function TagsDialog({ isOpen, onClose, tags, onSave }: TagsDialogProps) {
  const { t } = useI18n();
  const [currentTags, setCurrentTags] = useState<string[]>(tags);
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (!tag) return;

    if (currentTags.includes(tag)) {
      setError(t('tags.tagExists'));
      return;
    }

    if (tag.length > 20) {
      setError(t('tags.tagTooLong'));
      return;
    }

    setCurrentTags([...currentTags, tag]);
    setNewTag('');
    setError(null);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setCurrentTags(currentTags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = () => {
    onSave(currentTags);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🏷️ ${t('tags.title')}`} size="sm">
      <div className={styles.container}>
        <div className={styles.inputRow}>
          <Input
            placeholder={t('tags.addTag')}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            error={error || undefined}
          />
          <Button variant="secondary" onClick={handleAddTag}>
            {t('common.add')}
          </Button>
        </div>

        <div className={styles.tagList}>
          {currentTags.length === 0 ? (
            <p className={styles.empty}>{t('tags.noTags')}</p>
          ) : (
            currentTags.map((tag) => (
              <div key={tag} className={styles.tag}>
                <span className={styles.tagName}>#{tag}</span>
                <button
                  className={styles.removeButton}
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`${t('common.remove')} ${tag}`}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {t('tags.saveTags')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
