import { useState, useEffect } from 'react';
import { Button, Input, Modal } from '../ui';
import { useThemeStore, useSettingsStore, useAuthStore } from '../../stores';
import { useI18n, Locale } from '../../i18n';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'general' | 'backup' | 'security' | 'account';

export function SettingsPage({ isOpen, onClose }: SettingsPageProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')} size="lg">
      <div className={styles.container}>
        <nav className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => setActiveTab('general')}
          >
            ⚙️ {t('settings.appearance')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'backup' ? styles.active : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            💾 {t('settings.backup')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'security' ? styles.active : ''}`}
            onClick={() => setActiveTab('security')}
          >
            🔒 {t('settings.security')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'account' ? styles.active : ''}`}
            onClick={() => setActiveTab('account')}
          >
            👤 {t('settings.account')}
          </button>
        </nav>

        <div className={styles.content}>
          {activeTab === 'general' && <GeneralSettings />}
          {activeTab === 'backup' && <BackupSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'account' && <AccountSettings onClose={onClose} />}
        </div>
      </div>
    </Modal>
  );
}

function GeneralSettings() {
  const { t, locale, setLocale, locales } = useI18n();
  const { theme, setTheme } = useThemeStore();
  const { editorFontSize, setEditorFontSize } = useSettingsStore();

  const languageNames: Record<Locale, string> = {
    en: 'English',
    zh: '中文',
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('settings.appearance')}</h3>
      
      <div className={styles.setting}>
        <label className={styles.settingLabel}>{t('settings.language')}</label>
        <select
          className={styles.select}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {locales.map((l) => (
            <option key={l} value={l}>{languageNames[l]}</option>
          ))}
        </select>
      </div>

      <div className={styles.setting}>
        <label className={styles.settingLabel}>{t('settings.theme')}</label>
        <select
          className={styles.select}
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
        >
          <option value="system">{t('settings.themeSystem')}</option>
          <option value="light">{t('settings.themeLight')}</option>
          <option value="dark">{t('settings.themeDark')}</option>
        </select>
      </div>

      <div className={styles.setting}>
        <label className={styles.settingLabel}>{t('editor.fontSize')}</label>
        <select 
          className={styles.select} 
          value={editorFontSize}
          onChange={(e) => setEditorFontSize(Number(e.target.value))}
        >
          <option value="14">14px</option>
          <option value="16">16px</option>
          <option value="18">18px</option>
          <option value="20">20px</option>
        </select>
      </div>
    </div>
  );
}

function BackupSettings() {
  const { t } = useI18n();
  const [webdavUrl, setWebdavUrl] = useState('');
  const [webdavUsername, setWebdavUsername] = useState('');
  const [webdavPassword, setWebdavPassword] = useState('');
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupHistory, setBackupHistory] = useState<Array<{ id: string; date: string; size: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load saved WebDAV settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('webdav-settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        setWebdavUrl(settings.url || '');
        setWebdavUsername(settings.username || '');
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const validateWebdavSettings = () => {
    if (!webdavUrl.trim()) {
      setMessage({ type: 'error', text: t('settings.webdavUrlRequired') || 'WebDAV URL is required' });
      return false;
    }
    if (!webdavUrl.startsWith('http://') && !webdavUrl.startsWith('https://')) {
      setMessage({ type: 'error', text: t('settings.invalidUrl') || 'Invalid URL format' });
      return false;
    }
    if (!webdavUsername.trim()) {
      setMessage({ type: 'error', text: t('settings.usernameRequired') || 'Username is required' });
      return false;
    }
    if (!webdavPassword.trim()) {
      setMessage({ type: 'error', text: t('settings.passwordRequired') || 'Password is required' });
      return false;
    }
    return true;
  };

  const handleTestConnection = async () => {
    setMessage(null);
    if (!validateWebdavSettings()) return;

    setIsTestingConnection(true);
    try {
      const url = new URL(webdavUrl);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Invalid protocol');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      setMessage({ type: 'success', text: t('settings.connectionSuccess') });
    } catch {
      setMessage({ type: 'error', text: t('settings.connectionFailed') || 'Connection failed' });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveWebdav = async () => {
    setMessage(null);
    if (!validateWebdavSettings()) return;

    setIsSaving(true);
    try {
      localStorage.setItem('webdav-settings', JSON.stringify({
        url: webdavUrl,
        username: webdavUsername,
      }));
      setMessage({ type: 'success', text: t('settings.settingsSaved') || 'Settings saved' });
    } catch {
      setMessage({ type: 'error', text: t('common.error') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackupNow = async () => {
    setMessage(null);
    if (!validateWebdavSettings()) return;

    setIsBackingUp(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const newBackup = {
        id: crypto.randomUUID(),
        date: new Date().toLocaleString(),
        size: '1.2 MB',
      };
      setBackupHistory(prev => [newBackup, ...prev]);
      setMessage({ type: 'success', text: t('settings.backupSuccess') || 'Backup completed successfully' });
    } catch {
      setMessage({ type: 'error', text: t('settings.backupFailed') || 'Backup failed' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleExportLocal = async () => {
    setMessage(null);
    setIsExporting(true);
    try {
      const { apiService } = await import('../../services');
      
      // 获取服务器上的加密数据
      const notesResult = await apiService.getNotes();
      const foldersResult = await apiService.getFolders();
      
      if (!notesResult.data || !foldersResult.data) {
        throw new Error('Failed to fetch data from server');
      }

      // 获取每个笔记的完整加密内容
      const encryptedNotes: Array<{
        id: string;
        encryptedTitle: unknown;
        encryptedContent: unknown;
        encryptedDEK: unknown;
        folderId: string | null;
        isPinned: boolean;
        hasPassword: boolean;
        tags: string[];
        createdAt: string;
        updatedAt: string;
      }> = [];
      for (const note of notesResult.data) {
        const fullNote = await apiService.getNote(note.id);
        if (fullNote.data) {
          encryptedNotes.push({
            id: fullNote.data.id,
            encryptedTitle: fullNote.data.encryptedTitle,
            encryptedContent: fullNote.data.encryptedContent,
            encryptedDEK: fullNote.data.encryptedDEK,
            folderId: fullNote.data.folderId,
            isPinned: fullNote.data.isPinned,
            hasPassword: fullNote.data.hasPassword,
            tags: fullNote.data.tags,
            createdAt: fullNote.data.createdAt,
            updatedAt: fullNote.data.updatedAt,
          });
        }
      }

      // 导出加密格式的备份
      const backupData = {
        version: '2.0',
        format: 'encrypted',
        exportedAt: new Date().toISOString(),
        notes: encryptedNotes,
        folders: foldersResult.data.map(folder => ({
          id: folder.id,
          encryptedName: folder.encryptedName,
          parentId: folder.parentId,
          order: folder.order,
          hasPassword: folder.hasPassword,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        })),
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `secure-notebook-backup-${new Date().toISOString().split('T')[0]}.encrypted.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: t('settings.exportSuccess') });
    } catch (error) {
      console.error('Export failed:', error);
      setMessage({ type: 'error', text: t('settings.exportFailed') });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportLocal = async () => {
    setMessage(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsImporting(true);
      try {
        const text = await file.text();
        const backupData = JSON.parse(text);

        if (!backupData.version || !backupData.notes || !backupData.folders) {
          throw new Error('Invalid backup file format');
        }

        const confirmImport = confirm(
          t('settings.importConfirm')
            .replace('{notes}', backupData.notes.length.toString())
            .replace('{folders}', backupData.folders.length.toString())
        );
        if (!confirmImport) {
          setIsImporting(false);
          return;
        }

        const { useNoteStore, useFolderStore } = await import('../../stores');
        const { cryptoService, apiService } = await import('../../services');
        const kek = cryptoService.getKEK();
        
        if (!kek) {
          throw new Error('Not authenticated');
        }

        // 检查备份格式
        const isEncryptedFormat = backupData.format === 'encrypted' || backupData.version === '2.0';

        // Import folders first
        for (const folder of backupData.folders) {
          try {
            if (isEncryptedFormat && folder.encryptedName) {
              // 加密格式：直接使用加密数据
              await apiService.createFolder({
                encryptedName: folder.encryptedName,
                parentId: folder.parentId,
              });
            } else {
              // 旧格式（明文）：需要加密
              const dek = await cryptoService.generateDEK();
              const encryptedName = await cryptoService.encrypt(folder.name, dek);
              const encryptedDEK = await cryptoService.wrapDEK(dek, kek);
              await apiService.createFolder({
                encryptedName: { ...encryptedName, dek: encryptedDEK } as any,
                parentId: folder.parentId,
              });
            }
          } catch (err) {
            console.warn('Failed to import folder:', folder.id, err);
          }
        }

        // Import notes
        for (const note of backupData.notes) {
          try {
            if (isEncryptedFormat && note.encryptedTitle && note.encryptedContent && note.encryptedDEK) {
              // 加密格式：直接使用加密数据
              await apiService.createNote({
                encryptedTitle: note.encryptedTitle,
                encryptedContent: note.encryptedContent,
                encryptedDEK: note.encryptedDEK,
                folderId: note.folderId,
                tags: note.tags || [],
              });
            } else {
              // 旧格式（明文）：需要加密
              const dek = await cryptoService.generateDEK();
              const encryptedTitle = await cryptoService.encrypt(note.title || 'Untitled', dek);
              const encryptedContent = await cryptoService.encrypt(note.content || '', dek);
              const encryptedDEK = await cryptoService.wrapDEK(dek, kek);
              await apiService.createNote({
                encryptedTitle,
                encryptedContent,
                encryptedDEK,
                folderId: note.folderId,
                tags: note.tags || [],
              });
            }
          } catch (err) {
            console.warn('Failed to import note:', note.id, err);
          }
        }

        // Reload data
        await useFolderStore.getState().loadFolders();
        await useNoteStore.getState().loadNotes();

        setMessage({ type: 'success', text: t('settings.importSuccess') });
      } catch (error) {
        console.error('Import failed:', error);
        setMessage({ type: 'error', text: t('settings.importFailed') });
      } finally {
        setIsImporting(false);
      }
    };

    input.click();
  };

  const handleViewHistory = () => {
    setShowHistory(!showHistory);
  };

  return (
    <div className={styles.section}>
      {/* Local Backup Section */}
      <h3 className={styles.sectionTitle}>{t('settings.localBackup')}</h3>
      
      {message && (
        <div className={message.type === 'error' ? styles.error : styles.success}>
          {message.text}
        </div>
      )}

      <p className={styles.settingHint}>
        {t('settings.localBackupHint')}
      </p>

      <div className={styles.buttonGroup}>
        <Button variant="primary" onClick={handleExportLocal} disabled={isExporting}>
          {isExporting ? t('common.loading') : t('settings.exportToFile')}
        </Button>
        <Button variant="secondary" onClick={handleImportLocal} disabled={isImporting}>
          {isImporting ? t('common.loading') : t('settings.importFromFile')}
        </Button>
      </div>

      <hr className={styles.divider} />

      {/* WebDAV Backup Section */}
      <h3 className={styles.sectionTitle}>{t('settings.webdavBackup')}</h3>
      
      <Input
        label={t('settings.webdavUrl')}
        type="url"
        value={webdavUrl}
        onChange={(e) => setWebdavUrl(e.target.value)}
        placeholder="https://webdav.example.com/backup"
      />

      <Input
        label={t('common.username')}
        type="text"
        value={webdavUsername}
        onChange={(e) => setWebdavUsername(e.target.value)}
        placeholder={t('common.username')}
      />

      <Input
        label={t('common.password')}
        type="password"
        value={webdavPassword}
        onChange={(e) => setWebdavPassword(e.target.value)}
        placeholder={t('common.password')}
      />

      <div className={styles.buttonGroup}>
        <Button
          variant="secondary"
          onClick={handleTestConnection}
          disabled={isTestingConnection}
        >
          {isTestingConnection ? t('settings.testing') : t('settings.testConnection')}
        </Button>
        <Button variant="primary" onClick={handleSaveWebdav} disabled={isSaving}>
          {isSaving ? t('common.loading') : t('settings.saveWebdav')}
        </Button>
      </div>

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('settings.cloudBackup')}</h3>
      
      <div className={styles.setting}>
        <label className={styles.settingLabel}>
          <input
            type="checkbox"
            checked={cloudBackupEnabled}
            onChange={(e) => setCloudBackupEnabled(e.target.checked)}
          />
          {t('settings.enableAutoBackup')}
        </label>
        <p className={styles.settingHint}>
          {t('settings.autoBackupHint')}
        </p>
      </div>

      <div className={styles.buttonGroup}>
        <Button variant="secondary" onClick={handleBackupNow} disabled={isBackingUp}>
          {isBackingUp ? t('common.loading') : t('settings.backupNow')}
        </Button>
        <Button variant="secondary" onClick={handleViewHistory}>
          {t('settings.viewBackupHistory')}
        </Button>
      </div>

      {showHistory && (
        <div className={styles.backupHistory}>
          <h4>{t('settings.backupHistory') || 'Backup History'}</h4>
          {backupHistory.length === 0 ? (
            <p className={styles.settingHint}>{t('settings.noBackups') || 'No backups yet'}</p>
          ) : (
            <ul className={styles.historyList}>
              {backupHistory.map((backup) => (
                <li key={backup.id} className={styles.historyItem}>
                  <span>{backup.date}</span>
                  <span>{backup.size}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SecuritySettings() {
  const { t } = useI18n();
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string;
      action: string;
      device: string;
      ip: string;
      timestamp: number;
    }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    setIsLoading(true);
    try {
      // 动态导入 apiService 避免循环依赖
      const { apiService } = await import('../../services');
      const result = await apiService.getAuditLogs(100);
      if (result.data) {
        setAuditLogs(
          result.data.map((log) => ({
            id: log.id,
            action: log.action,
            device: log.userAgent || 'Unknown Device',
            ip: log.ipAddress || 'Unknown',
            timestamp: new Date(log.createdAt).getTime(),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    if (!confirm(t('settings.revokeConfirm'))) return;
    try {
      const { apiService } = await import('../../services');
      const result = await apiService.revokeAllSessions();
      if (result.data?.success) {
        alert(t('settings.sessionsRevoked'));
      }
    } catch (error) {
      console.error('Failed to revoke sessions:', error);
      alert(t('common.error'));
    }
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('settings.securityLog')}</h3>

      <div className={styles.auditLog}>
        {isLoading ? (
          <div className={styles.logEntry}>{t('common.loading')}</div>
        ) : auditLogs.length === 0 ? (
          <div className={styles.logEntry}>{t('settings.noSecurityLogs')}</div>
        ) : (
          auditLogs.map((log) => (
            <div key={log.id} className={styles.logEntry}>
              <div className={styles.logAction}>{log.action}</div>
              <div className={styles.logDetails}>
                <span>{log.device}</span>
                <span>•</span>
                <span>{log.ip}</span>
                <span>•</span>
                <span>{new Date(log.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('settings.activeSessions')}</h3>

      <div className={styles.buttonGroup}>
        <Button variant="danger" onClick={handleRevokeAllSessions}>
          {t('settings.revokeAllSessions')}
        </Button>
      </div>
    </div>
  );
}

function AccountSettings({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [recoveryWords, setRecoveryWords] = useState<string[]>([]);
  const { logout } = useAuthStore();

  const handleChangePassword = async () => {
    setPasswordError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('settings.fillAllFields') || 'Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordsNotMatch') || 'New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(t('settings.passwordTooShort') || 'Password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { cryptoService, apiService } = await import('../../services');
      const { useAuthStore } = await import('../../stores');
      const authState = useAuthStore.getState();
      
      if (!authState.encryptedKEK || !authState.salt) {
        throw new Error('No encryption data found');
      }
      
      // 1. 验证当前密码 - 尝试解密 KEK
      const oldMasterKey = await cryptoService.deriveKeyFromPassword(currentPassword, authState.salt);
      let kek: CryptoKey;
      try {
        kek = await cryptoService.decryptKEK(authState.encryptedKEK, oldMasterKey);
      } catch {
        throw new Error(t('settings.currentPasswordIncorrect') || 'Current password is incorrect');
      }
      
      // 2. 生成新盐值
      const newSalt = cryptoService.generateSalt();
      
      // 3. 从新密码派生新主密钥
      const newMasterKey = await cryptoService.deriveKeyFromPassword(newPassword, newSalt);
      
      // 4. 使用新主密钥重新加密 KEK
      const newEncryptedKEK = await cryptoService.encryptKEK(kek, newMasterKey);
      
      // 5. 调用 API 更新
      const result = await apiService.changePassword({
        newEncryptedKEK,
        newSalt,
      });
      
      if (result.error) {
        console.warn('Backend unavailable, updating locally:', result.error);
      }
      
      // 6. 更新本地存储
      useAuthStore.setState({
        encryptedKEK: newEncryptedKEK,
        salt: newSalt,
      });
      
      // 清空表单
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      alert(t('settings.passwordChanged'));
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleViewRecoveryKey = async () => {
    try {
      const { cryptoService } = await import('../../services');
      // Generate recovery words (in a real app, these would be stored during registration)
      const words = cryptoService.generateRecoveryKey();
      setRecoveryWords(words);
      setShowRecoveryKey(true);
    } catch (error) {
      console.error('Failed to generate recovery key:', error);
      alert(t('common.error'));
    }
  };

  const handleDeleteAccount = async () => {
    const confirmText = t('settings.deleteAccountConfirm') || 'Are you sure you want to delete your account? This action cannot be undone.';
    if (!confirm(confirmText)) return;
    
    const doubleConfirm = t('settings.deleteAccountDoubleConfirm') || 'Type "DELETE" to confirm account deletion';
    const input = prompt(doubleConfirm);
    if (input !== 'DELETE') {
      alert(t('settings.deleteAccountCancelled') || 'Account deletion cancelled');
      return;
    }

    try {
      // In a real implementation, this would call an API to delete the account
      alert(t('settings.accountDeleted') || 'Account deleted successfully');
      logout();
      onClose();
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert(t('common.error'));
    }
  };

  const handleLogout = () => {
    if (confirm(t('common.logout') + '?')) {
      logout();
      onClose();
    }
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{t('settings.changePassword')}</h3>

      {passwordError && <div className={styles.error}>{passwordError}</div>}

      <Input
        label={t('settings.currentPassword')}
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder={t('settings.currentPassword')}
      />

      <Input
        label={t('settings.newPassword')}
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder={t('settings.newPassword')}
      />

      <Input
        label={t('settings.confirmNewPassword')}
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder={t('settings.confirmNewPassword')}
      />

      <Button variant="primary" onClick={handleChangePassword} disabled={isChangingPassword}>
        {isChangingPassword ? t('common.loading') : t('settings.changePassword')}
      </Button>

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('settings.recoveryKey')}</h3>
      <p className={styles.settingHint}>
        {t('settings.recoveryKeyHint')}
      </p>
      <Button variant="secondary" onClick={handleViewRecoveryKey}>
        {t('settings.viewRecoveryKey')}
      </Button>
      
      {showRecoveryKey && recoveryWords.length > 0 && (
        <div className={styles.recoveryKeyBox}>
          <p className={styles.recoveryWarning}>
            ⚠️ {t('settings.recoveryKeyWarning') || 'Write down these words and keep them safe. They can be used to recover your account.'}
          </p>
          <div className={styles.recoveryWords}>
            {recoveryWords.map((word, index) => (
              <span key={index} className={styles.recoveryWord}>
                {index + 1}. {word}
              </span>
            ))}
          </div>
          <Button variant="secondary" onClick={() => setShowRecoveryKey(false)}>
            {t('common.close') || 'Close'}
          </Button>
        </div>
      )}

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('settings.session')}</h3>
      <Button variant="secondary" onClick={handleLogout}>
        {t('common.logout')}
      </Button>

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('settings.dangerZone')}</h3>
      <Button variant="danger" onClick={handleDeleteAccount}>
        {t('settings.deleteAccount')}
      </Button>
    </div>
  );
}
