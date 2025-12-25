import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cryptoService, apiService } from '../services';
import type { EncryptedData } from '../services/crypto-service';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  encryptedKEK: EncryptedData | null;
  salt: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;

  // Computed
  isAdmin: () => boolean;

  // 加密相关
  register: (email: string, password: string) => Promise<{ recoveryKey: string[] }>;
  login: (email: string, password: string) => Promise<void>;
  unlockWithPassword: (password: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      encryptedKEK: null,
      salt: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          error: null,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      logout: () => {
        cryptoService.clearKeys();
        apiService.clearAuth();
        set({
          user: null,
          isAuthenticated: false,
          error: null,
          encryptedKEK: null,
          salt: null,
        });
      },

      isAdmin: () => {
        const state = get();
        return state.user?.role === 'admin';
      },

      register: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          // 1. 生成盐值
          const salt = cryptoService.generateSalt();

          // 2. 从密码派生主密钥
          const masterKey = await cryptoService.deriveKeyFromPassword(password, salt);

          // 3. 从主密钥派生 KEK
          const kek = await cryptoService.deriveKEK(masterKey);

          // 4. 加密 KEK 用于存储
          const encryptedKEK = await cryptoService.encryptKEK(kek, masterKey);

          // 5. 生成恢复密钥
          const recoveryKey = cryptoService.generateRecoveryKey();
          const recoveryKeyHash = await cryptoService.hashRecoveryKey(recoveryKey);

          // 6. 调用注册 API
          const result = await apiService.register({
            email,
            encryptedKEK,
            salt,
            recoveryKeyHash,
            deviceName: navigator.userAgent.slice(0, 50),
          });

          if (result.error) {
            throw new Error(result.error);
          }

          // 7. 设置 KEK 到加密服务
          cryptoService.setKEK(kek);

          // 8. 更新状态（包含角色）
          const role = (result.data as any)?.role || 'user';
          set({
            user: { id: result.data?.userId || crypto.randomUUID(), email, role },
            isAuthenticated: true,
            isLoading: false,
            encryptedKEK,
            salt,
          });

          return { recoveryKey };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          // 尝试从后端获取加密的 KEK
          const result = await apiService.login({
            email,
            deviceName: navigator.userAgent.slice(0, 50),
          });

          let encryptedKEK: EncryptedData;
          let salt: string;
          let role: 'admin' | 'user' = 'user';

          if (result.data) {
            // 后端返回了加密的 KEK
            encryptedKEK = result.data.encryptedKEK;
            salt = result.data.salt;
            role = (result.data as any).role || 'user';
          } else {
            // 后端不可用，检查本地存储
            const state = get();
            if (!state.encryptedKEK || !state.salt) {
              throw new Error(result.error || 'No account found. Please register first.');
            }
            encryptedKEK = state.encryptedKEK;
            salt = state.salt;
            role = state.user?.role || 'user';
          }

          // 从密码派生主密钥
          const masterKey = await cryptoService.deriveKeyFromPassword(password, salt);

          // 解密 KEK
          try {
            const kek = await cryptoService.decryptKEK(encryptedKEK, masterKey);
            cryptoService.setKEK(kek);
          } catch {
            throw new Error('Invalid password');
          }

          // 更新状态
          set({
            user: { id: result.data?.userId || crypto.randomUUID(), email, role },
            isAuthenticated: true,
            isLoading: false,
            encryptedKEK,
            salt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      unlockWithPassword: async (password: string) => {
        const state = get();
        if (!state.encryptedKEK || !state.salt) {
          return false;
        }

        try {
          const masterKey = await cryptoService.deriveKeyFromPassword(password, state.salt);
          const kek = await cryptoService.decryptKEK(state.encryptedKEK, masterKey);
          cryptoService.setKEK(kek);
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        encryptedKEK: state.encryptedKEK,
        salt: state.salt,
      }),
    }
  )
);
