import { useState, useEffect } from 'react';
import { Button, Input, Modal } from '../ui';
import { apiService } from '../../services';
import { useI18n } from '../../i18n';
import styles from './AdminPage.module.css';

interface AdminPageProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminTab = 'dashboard' | 'users' | 'settings';

interface SystemSettings {
  siteName: string;
  siteDescription: string;
  allowRegistration: boolean;
  maxUsersLimit: number;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
}

interface UserInfo {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  noteCount: number;
  folderCount: number;
  deviceCount: number;
}

interface Stats {
  userCount: number;
  activeUsers: number;
  noteCount: number;
  folderCount: number;
  recentUsers: number;
}

export function AdminPage({ isOpen, onClose }: AdminPageProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('admin.title')} size="lg">
      <div className={styles.container}>
        <nav className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'dashboard' ? styles.active : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 {t('admin.dashboard')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'users' ? styles.active : ''}`}
            onClick={() => setActiveTab('users')}
          >
            👥 {t('admin.users')}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'settings' ? styles.active : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ {t('admin.settings')}
          </button>
        </nav>

        <div className={styles.content}>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </Modal>
  );
}

function DashboardTab() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    const result = await apiService.getAdminStats();
    if (result.data) {
      setStats(result.data);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className={styles.loading}>{t('common.loading')}</div>;
  }

  return (
    <div className={styles.dashboard}>
      <h3 className={styles.sectionTitle}>{t('admin.dashboard')}</h3>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.userCount || 0}</div>
          <div className={styles.statLabel}>{t('admin.totalUsers')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.activeUsers || 0}</div>
          <div className={styles.statLabel}>{t('admin.activeUsers')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.noteCount || 0}</div>
          <div className={styles.statLabel}>{t('admin.totalNotes')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.folderCount || 0}</div>
          <div className={styles.statLabel}>{t('admin.totalFolders')}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats?.recentUsers || 0}</div>
          <div className={styles.statLabel}>{t('admin.newUsers')}</div>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { t } = useI18n();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadUsers();
  }, [page, search]);

  const loadUsers = async () => {
    setIsLoading(true);
    const result = await apiService.getAdminUsers({ page, limit: 10, search: search || undefined });
    if (result.data) {
      setUsers(result.data.users);
      setTotalPages(result.data.totalPages);
    }
    setIsLoading(false);
  };

  const handleToggleActive = async (user: UserInfo) => {
    const result = await apiService.updateAdminUser(user.id, { isActive: !user.isActive });
    if (result.data) {
      loadUsers();
    }
  };

  const handleToggleRole = async (user: UserInfo) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`${t('admin.changeRole')} ${newRole}?`)) return;
    const result = await apiService.updateAdminUser(user.id, { role: newRole });
    if (result.data) {
      loadUsers();
    }
  };

  const handleDelete = async (user: UserInfo) => {
    if (!confirm(`${t('admin.deleteUser')} ${user.email}? ${t('admin.deleteUserConfirm')}`)) return;
    const result = await apiService.deleteAdminUser(user.id);
    if (result.data?.success) {
      loadUsers();
    }
  };

  return (
    <div className={styles.users}>
      <div className={styles.searchBar}>
        <Input
          type="text"
          placeholder={t('admin.searchUsers')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <div className={styles.loading}>{t('common.loading')}</div>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('auth.email')}</th>
                <th>{t('admin.role')}</th>
                <th>{t('admin.status')}</th>
                <th>{t('notes.title')}</th>
                <th>{t('admin.created')}</th>
                <th>{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <span className={`${styles.badge} ${user.role === 'admin' ? styles.admin : ''}`}>
                      {user.role === 'admin' ? t('admin.admin') : t('admin.user')}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${user.isActive ? styles.active : styles.inactive}`}>
                      {user.isActive ? t('admin.active') : t('admin.disabled')}
                    </span>
                  </td>
                  <td>{user.noteCount}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className={styles.actions}>
                    <button onClick={() => handleToggleActive(user)} title={user.isActive ? t('admin.disabled') : t('admin.active')}>
                      {user.isActive ? '🚫' : '✅'}
                    </button>
                    <button onClick={() => handleToggleRole(user)} title={t('admin.role')}>
                      👑
                    </button>
                    <button onClick={() => handleDelete(user)} title={t('common.delete')} className={styles.danger}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.pagination}>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ←
            </Button>
            <span>Page {page} / {totalPages}</span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SettingsTab() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    const result = await apiService.getAdminSettings();
    if (result.data) {
      setSettings(result.data);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    const result = await apiService.updateAdminSettings(settings);
    if (result.data) {
      setSettings(result.data);
      alert(t('admin.settingsSaved'));
    }
    setIsSaving(false);
  };

  if (isLoading || !settings) {
    return <div className={styles.loading}>{t('common.loading')}</div>;
  }

  return (
    <div className={styles.settings}>
      <h3 className={styles.sectionTitle}>{t('admin.siteInfo')}</h3>
      
      <Input
        label={t('admin.siteName')}
        value={settings.siteName}
        onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
      />

      <Input
        label={t('admin.siteDescription')}
        value={settings.siteDescription}
        onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
      />

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('admin.registration')}</h3>

      <div className={styles.checkbox}>
        <label>
          <input
            type="checkbox"
            checked={settings.allowRegistration}
            onChange={(e) => setSettings({ ...settings, allowRegistration: e.target.checked })}
          />
          {t('admin.allowRegistration')}
        </label>
      </div>

      <Input
        label={t('admin.maxUsersLimit')}
        type="number"
        value={settings.maxUsersLimit.toString()}
        onChange={(e) => setSettings({ ...settings, maxUsersLimit: parseInt(e.target.value) || 0 })}
      />

      <hr className={styles.divider} />

      <h3 className={styles.sectionTitle}>{t('admin.maintenance')}</h3>

      <div className={styles.checkbox}>
        <label>
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
          />
          {t('admin.enableMaintenance')}
        </label>
      </div>

      <Input
        label={t('admin.maintenanceMessage')}
        value={settings.maintenanceMessage || ''}
        onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value || null })}
        placeholder="System is under maintenance..."
      />

      <div className={styles.buttonGroup}>
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('admin.saving') : t('admin.saveSettings')}
        </Button>
      </div>
    </div>
  );
}
