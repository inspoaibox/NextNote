import { useState } from 'react';
import { Button, Input, Modal } from '../ui';
import { useI18n } from '../../i18n';
import styles from './PasswordDialog.module.css';

interface PasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'set' | 'verify' | 'remove';
  title?: string;
  onSubmit: (password: string) => Promise<boolean>;
  attemptsRemaining?: number;
  isLocked?: boolean;
  lockoutRemainingMs?: number;
}

export function PasswordDialog({
  isOpen,
  onClose,
  mode,
  title,
  onSubmit,
  attemptsRemaining = 5,
  isLocked = false,
  lockoutRemainingMs = 0,
}: PasswordDialogProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTitle = () => {
    if (title) return title;
    switch (mode) {
      case 'set':
        return `🔒 ${t('passwordDialog.setPassword')}`;
      case 'verify':
        return `🔐 ${t('passwordDialog.enterPassword')}`;
      case 'remove':
        return `🔓 ${t('passwordDialog.removePassword')}`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'set' && password !== confirmPassword) {
      setError(t('passwordDialog.passwordsNotMatch'));
      return;
    }

    if (password.length < 4) {
      setError(t('passwordDialog.passwordTooShort'));
      return;
    }

    setIsLoading(true);

    try {
      const success = await onSubmit(password);
      if (success) {
        setPassword('');
        setConfirmPassword('');
        onClose();
      } else {
        setError(t('passwordDialog.incorrectPassword'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const formatLockoutTime = (ms: number) => {
    const minutes = Math.ceil(ms / 60000);
    return `${minutes} ${t('passwordDialog.minutes')}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle()} size="sm">
      <form onSubmit={handleSubmit} className={styles.form}>
        {isLocked ? (
          <div className={styles.lockout}>
            <span className={styles.lockoutIcon}>⏳</span>
            <p>{t('passwordDialog.tooManyAttempts')}</p>
            <p>{t('passwordDialog.tryAgainIn')} {formatLockoutTime(lockoutRemainingMs)}</p>
          </div>
        ) : (
          <>
            {error && <div className={styles.error}>{error}</div>}

            <Input
              label={t('passwordDialog.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordDialog.enterPlaceholder')}
              autoFocus
              required
            />

            {mode === 'set' && (
              <Input
                label={t('passwordDialog.confirmPassword')}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('passwordDialog.confirmPlaceholder')}
                required
              />
            )}

            {mode === 'verify' && attemptsRemaining < 5 && (
              <p className={styles.attempts}>
                {attemptsRemaining} {t('passwordDialog.attemptsRemaining')}
              </p>
            )}

            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={isLoading}>
                {isLoading ? t('common.processing') : mode === 'set' ? t('passwordDialog.setPassword') : t('common.confirm')}
              </Button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
