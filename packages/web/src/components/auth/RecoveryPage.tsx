import { useState } from 'react';
import { Button, Input } from '../ui';
import styles from './AuthPage.module.css';

interface RecoveryPageProps {
  onRecover: (email: string, recoveryKey: string, newPassword: string) => Promise<void>;
  onBackToLogin: () => void;
}

export function RecoveryPage({ onRecover, onBackToLogin }: RecoveryPageProps) {
  const [email, setEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !recoveryKey || !newPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Validate recovery key format (24 words)
    const words = recoveryKey.trim().split(/\s+/);
    if (words.length !== 24) {
      setError('Recovery key must be 24 words');
      return;
    }

    setIsLoading(true);

    try {
      await onRecover(email, recoveryKey, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.logo}>✅ Password Reset</h1>
            <p className={styles.subtitle}>Your password has been successfully reset</p>
          </div>
          <Button variant="primary" fullWidth onClick={onBackToLogin}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.logo}>🔑 Account Recovery</h1>
          <p className={styles.subtitle}>Enter your recovery key to reset your password</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
          />

          <div className={styles.recoveryInput}>
            <label className={styles.label}>Recovery Key (24 words)</label>
            <textarea
              className={styles.textarea}
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value)}
              placeholder="Enter your 24-word recovery key, separated by spaces"
              rows={4}
              required
            />
          </div>

          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            required
          />

          <Input
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            required
          />

          <Button type="submit" variant="primary" fullWidth disabled={isLoading}>
            {isLoading ? 'Recovering...' : 'Reset Password'}
          </Button>
        </form>

        <div className={styles.footer}>
          <button className={styles.switchLink} onClick={onBackToLogin}>
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
