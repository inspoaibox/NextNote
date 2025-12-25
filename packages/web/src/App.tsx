import { useState, useEffect } from 'react';
import { Sidebar, NoteList, Editor } from './components/layout';
import { LoginPage, RegisterPage, RecoveryPage, UnlockPage } from './components/auth';
import { SettingsPage } from './components/settings';
import { AdminPage } from './components/admin';
import { useAuthStore, useNoteStore, useFolderStore } from './stores';
import { useSyncStore } from './stores/sync-store';
import { apiService, cryptoService } from './services';
import './styles/global.css';
import styles from './App.module.css';

function App() {
  const { isAuthenticated, isAdmin, login, register, encryptedKEK, salt, logout } = useAuthStore();
  const { selectNote, loadNotes } = useNoteStore();
  const { loadFolders } = useFolderStore();
  const { initialize: initSync, disconnect: disconnectSync } = useSyncStore();
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recovery'>('login');
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hasKEK, setHasKEK] = useState(false);

  // 等待 zustand 持久化恢复完成，并检查 KEK
  useEffect(() => {
    const init = async () => {
      // 给 zustand persist 一点时间来恢复状态
      await new Promise((resolve) => setTimeout(resolve, 100));
      // 检查 KEK 是否可用（包括从 sessionStorage 恢复）
      const kek = await cryptoService.ensureKEK();
      setHasKEK(!!kek);
      setIsHydrated(true);
    };
    init();
  }, []);

  // 计算是否需要解锁（用户已登录但 KEK 丢失）
  const needsUnlock = isHydrated && isAuthenticated && !hasKEK && !!encryptedKEK && !!salt;

  // 检查系统是否允许注册
  useEffect(() => {
    const checkRegistration = async () => {
      const result = await apiService.getSystemInfo();
      if (result.data) {
        setAllowRegistration(result.data.allowRegistration);
      }
    };
    if (!isAuthenticated) {
      checkRegistration();
    }
  }, [isAuthenticated]);

  // 登录后加载数据并初始化同步
  useEffect(() => {
    if (isAuthenticated && hasKEK) {
      // 初始化默认同步配置（首次使用时自动检测后端）
      import('./services/incremental-sync').then(async ({ initDefaultSyncConfig, startAutoSync }) => {
        await initDefaultSyncConfig();
        startAutoSync();
      }).catch(err => {
        console.error('Failed to init sync:', err);
      });
      
      // 加载数据
      loadNotes();
      loadFolders();
      
      // 初始化实时同步服务
      const authData = localStorage.getItem('auth-data');
      if (authData) {
        try {
          const { token } = JSON.parse(authData);
          if (token) {
            initSync(token);
          }
        } catch {
          // ignore
        }
      }
    }
    
    return () => {
      if (!isAuthenticated) {
        disconnectSync();
        // 停止增量同步
        import('./services/incremental-sync').then(({ stopAutoSync }) => {
          stopAutoSync();
        }).catch(() => {});
      }
    };
  }, [isAuthenticated, hasKEK, loadNotes, loadFolders, initSync, disconnectSync]);

  // 解锁处理
  const handleUnlock = async (password: string) => {
    if (!encryptedKEK || !salt) {
      throw new Error('Session expired. Please login again.');
    }
    try {
      const masterKey = await cryptoService.deriveKeyFromPassword(password, salt);
      const kek = await cryptoService.decryptKEK(encryptedKEK, masterKey);
      cryptoService.setKEK(kek);
      setHasKEK(true);
    } catch {
      throw new Error('Invalid password');
    }
  };

  // 使用真实加密的登录处理
  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
    setHasKEK(true);
  };

  // 使用真实加密的注册处理
  const handleRegister = async (email: string, password: string) => {
    const result = await register(email, password);
    setHasKEK(true);
    return result;
  };

  // 密码恢复处理
  const handleRecover = async (email: string, recoveryKey: string, _newPassword: string) => {
    // 验证恢复密钥格式
    const words = recoveryKey.trim().split(/\s+/);
    if (words.length !== 24) {
      throw new Error('Recovery key must be 24 words');
    }
    // TODO: 实现完整的恢复流程
    // 1. 验证恢复密钥哈希
    // 2. 使用恢复密钥派生密钥
    // 3. 重新加密 KEK
    console.log('Recovery for:', email);
    throw new Error('Recovery not yet implemented. Please contact support.');
  };

  // 等待状态恢复
  if (!isHydrated) {
    return (
      <div className={styles.app} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Loading...</div>
      </div>
    );
  }

  // 未登录状态
  if (!isAuthenticated) {
    if (authMode === 'login') {
      return (
        <LoginPage
          onLogin={handleLogin}
          onSwitchToRegister={allowRegistration ? () => setAuthMode('register') : undefined}
          onForgotPassword={() => setAuthMode('recovery')}
        />
      );
    }
    if (authMode === 'recovery') {
      return (
        <RecoveryPage
          onRecover={handleRecover}
          onBackToLogin={() => setAuthMode('login')}
        />
      );
    }
    return (
      <RegisterPage
        onRegister={handleRegister}
        onSwitchToLogin={() => setAuthMode('login')}
      />
    );
  }

  // 需要解锁（页面刷新后 KEK 丢失）
  if (needsUnlock) {
    return (
      <UnlockPage
        onUnlock={handleUnlock}
        onLogout={logout}
      />
    );
  }

  return (
    <div className={styles.app}>
      {sidebarOpen && (
        <div
          className={styles.sidebarOverlay}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        onOpenSettings={() => setShowSettings(true)}
        onOpenAdmin={isAdmin() ? () => setShowAdmin(true) : undefined}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <NoteList onOpenSidebar={() => setSidebarOpen(true)} />
      <Editor onBack={() => selectNote(null)} />
      <SettingsPage isOpen={showSettings} onClose={() => setShowSettings(false)} />
      {isAdmin() && <AdminPage isOpen={showAdmin} onClose={() => setShowAdmin(false)} />}
    </div>
  );
}

export default App;
