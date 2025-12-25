import { useState } from 'react';
import { Modal, Button } from '../ui';
import { useI18n } from '../../i18n';
import styles from './VersionHistory.module.css';

export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  size: number;
  createdAt: number;
}

interface VersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  versions: NoteVersion[];
  currentContent: string;
  onRestore: (versionId: string) => void;
}

export function VersionHistory({
  isOpen,
  onClose,
  versions,
  currentContent,
  onRestore,
}: VersionHistoryProps) {
  const { t } = useI18n();
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRestore = () => {
    if (selectedVersion) {
      onRestore(selectedVersion.id);
      setShowConfirm(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('version.title')} size="lg">
      <div className={styles.container}>
        <div className={styles.versionList}>
          <div className={styles.listHeader}>{t('version.versions')}</div>
          {versions.map((version) => (
            <button
              key={version.id}
              className={`${styles.versionItem} ${selectedVersion?.id === version.id ? styles.selected : ''}`}
              onClick={() => setSelectedVersion(version)}
            >
              <div className={styles.versionDate}>
                {new Date(version.createdAt).toLocaleString()}
              </div>
              <div className={styles.versionSize}>
                {formatSize(version.size)}
              </div>
            </button>
          ))}
          {versions.length === 0 && (
            <div className={styles.empty}>{t('version.noVersions')}</div>
          )}
        </div>

        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            {selectedVersion ? (
              <>
                <span>{t('version.versionFrom')} {new Date(selectedVersion.createdAt).toLocaleString()}</span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowConfirm(true)}
                >
                  {t('version.restore')}
                </Button>
              </>
            ) : (
              <span>{t('version.selectVersion')}</span>
            )}
          </div>
          <div className={styles.previewContent}>
            {selectedVersion ? (
              <pre className={styles.contentPre}>{selectedVersion.content}</pre>
            ) : (
              <div className={styles.previewEmpty}>
                <span className={styles.previewIcon}>📄</span>
                <p>{t('version.selectToSee')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title={t('version.restoreConfirm')} size="sm">
        <div className={styles.confirmContent}>
          <p>{t('version.restoreWarning')}</p>
          <div className={styles.confirmActions}>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleRestore}>
              {t('version.restoreVersion')}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
