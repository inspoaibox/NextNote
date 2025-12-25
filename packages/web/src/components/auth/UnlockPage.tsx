import { useState } from 'react';
import { Button, Input } from '../ui';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores';
import styles from './AuthPage.module.css';

interface UnlockPageProps {
  onUnlock: (password: string) => Promise<void>;
  onLogout: () => void;
}

export function UnlockPage({ onUnlock, onLogout }: UnlockPageProps) {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.logo}>🔐 Secure Notebook</h1>
          <p className={styles.subtitle}>{t('auth.unlockSession')}</p>
          {user?.email && <p style={{ fontSize: '0.9rem', color: '#666' }}>{user.email}</p>}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password')}
            required
            autoFocus
          />

          <Button type="submit" variant="primary" fullWidth disabled={isLoading}>
            {isLoading ? t('common.loading') : t('auth.unlock')}
          </Button>
        </form>

        <div className={styles.footer}>
          <button className={styles.switchLink} onClick={onLogout}>
            {t('auth.switchAccount')}
          </button>
        </div>
      </div>
    </div>
  );
}
