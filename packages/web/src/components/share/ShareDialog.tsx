import { useState } from 'react';
import { Button, Input, Modal } from '../ui';
import { useI18n } from '../../i18n';
import styles from './ShareDialog.module.css';

interface ShareInfo {
  id: string;
  recipientEmail: string;
  permission: 'view' | 'edit';
  createdAt: number;
}

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  noteTitle: string;
  existingShares: ShareInfo[];
  onShare: (email: string, permission: 'view' | 'edit') => Promise<void>;
  onRevoke: (shareId: string) => Promise<void>;
}

export function ShareDialog({
  isOpen,
  onClose,
  noteTitle,
  existingShares,
  onShare,
  onRevoke,
}: ShareDialogProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.includes('@')) {
      setError(t('share.invalidEmail'));
      return;
    }

    setIsLoading(true);

    try {
      await onShare(email, permission);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('share.failedToShare'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await onRevoke(shareId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('share.failedToRevoke'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('share.title')} size="md">
      <div className={styles.container}>
        <p className={styles.noteTitle}>
          {t('share.sharing')}: <strong>{noteTitle}</strong>
        </p>

        <form onSubmit={handleShare} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.inputRow}>
            <Input
              label={t('common.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('share.enterEmail')}
              required
            />

            <div className={styles.permissionSelect}>
              <label className={styles.label}>{t('share.permission')}</label>
              <select
                className={styles.select}
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
              >
                <option value="view">{t('share.canView')}</option>
                <option value="edit">{t('share.canEdit')}</option>
              </select>
            </div>
          </div>

          <Button type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? t('common.sharing') : t('common.share')}
          </Button>
        </form>

        {existingShares.length > 0 && (
          <>
            <hr className={styles.divider} />
            <h4 className={styles.sectionTitle}>{t('share.sharedWith')}</h4>
            <div className={styles.shareList}>
              {existingShares.map((share) => (
                <div key={share.id} className={styles.shareItem}>
                  <div className={styles.shareInfo}>
                    <span className={styles.shareEmail}>{share.recipientEmail}</span>
                    <span className={styles.sharePermission}>
                      {share.permission === 'view' ? `👁️ ${t('share.viewOnly')}` : `✏️ ${t('share.canEdit')}`}
                    </span>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRevoke(share.id)}
                  >
                    {t('common.revoke')}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
