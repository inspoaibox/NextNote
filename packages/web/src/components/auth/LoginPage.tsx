import { useState } from 'react';
import { Button, Input } from '../ui';
import { useI18n } from '../../i18n';
import styles from './AuthPage.module.css';

interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSwitchToRegister?: () => void;
  onForgotPassword: () => void;
}

export function LoginPage({ onLogin, onSwitchToRegister, onForgotPassword }: LoginPageProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.logo}>🔐 Secure Notebook</h1>
          <p className={styles.subtitle}>{t('auth.loginTitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email')}
            required
          />

          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password')}
            required
          />

          <button
            type="button"
            className={styles.forgotLink}
            onClick={onForgotPassword}
          >
            {t('auth.forgotPassword')}
          </button>

          <Button type="submit" variant="primary" fullWidth disabled={isLoading}>
            {isLoading ? t('auth.signingIn') : t('auth.login')}
          </Button>
        </form>

        <div className={styles.footer}>
          {onSwitchToRegister && (
            <>
              <span>{t('auth.noAccount')}</span>
              <button className={styles.switchLink} onClick={onSwitchToRegister}>
                {t('auth.register')}
              </button>
            </>
          )}
          {!onSwitchToRegister && (
            <span className={styles.registrationClosed}>{t('auth.registrationClosed')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
