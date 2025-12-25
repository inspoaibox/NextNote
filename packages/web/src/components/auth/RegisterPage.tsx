import { useState } from 'react';
import { Button, Input, Modal } from '../ui';
import { useI18n } from '../../i18n';
import styles from './AuthPage.module.css';

interface RegisterPageProps {
  onRegister: (email: string, password: string) => Promise<{ recoveryKey: string[] }>;
  onSwitchToLogin: () => void;
}

export function RegisterPage({ onRegister, onSwitchToLogin }: RegisterPageProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string[] | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = await onRegister(email, password);
      setRecoveryKey(result.recoveryKey);
      setShowRecoveryModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyRecoveryKey = () => {
    if (recoveryKey) {
      navigator.clipboard.writeText(recoveryKey.join(' '));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoWrapper}>
            <div className={styles.logoIcon}>🔐</div>
            <h1 className={styles.logo}>Secure Notebook</h1>
          </div>
          <p className={styles.subtitle}>{t('auth.registerTitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>⚠️ {error}</div>}

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

          <Input
            label={t('auth.confirmPassword')}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t('auth.confirmPassword')}
            required
          />

          <Button type="submit" variant="primary" fullWidth disabled={isLoading}>
            {isLoading ? t('auth.registering') : t('auth.register')}
          </Button>
        </form>

        <div className={styles.footer}>
          <span>{t('auth.hasAccount')}</span>
          <button className={styles.switchLink} onClick={onSwitchToLogin}>
            {t('auth.login')}
          </button>
        </div>
      </div>

      <Modal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        title="⚠️ Save Your Recovery Key"
        size="md"
      >
        <div className={styles.recoveryModal}>
          <div className={styles.recoveryWarning}>
            <span className={styles.warningIcon}>⚠️</span>
            <div>
              <p>This is your account recovery key. Write it down and store it in a safe place.
              You will need it to recover your account if you forget your password.</p>
              <p><strong>This key will only be shown once!</strong></p>
            </div>
          </div>

          <div className={styles.recoveryKeyBox}>
            {recoveryKey?.map((word, index) => (
              <span key={index} className={styles.recoveryWord}>
                <span className={styles.wordIndex}>{index + 1}.</span>
                {word}
              </span>
            ))}
          </div>

          <div className={styles.recoveryActions}>
            <Button variant="secondary" onClick={handleCopyRecoveryKey}>
              📋 Copy to Clipboard
            </Button>
            <Button variant="primary" onClick={() => setShowRecoveryModal(false)}>
              ✓ I've Saved My Recovery Key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
