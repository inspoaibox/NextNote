/**
 * 同步状态管理
 */

import { create } from 'zustand';
import { syncService, type SyncStatus, type SyncEvent } from '../services/sync-service';
import { useNoteStore } from './note-store';
import { useFolderStore } from './folder-store';
import { cryptoService } from '../services';
import type { EncryptedData, WrappedKey } from '../services/crypto-service';

interface SyncState {
  status: SyncStatus;
  lastSyncTime: number;
  pendingChanges: number;
  isInitialized: boolean;
  error: string | null;
  
  // Actions
  initialize: (token: string) => void;
  disconnect: () => void;
  setStatus: (status: SyncStatus) => void;
  setLastSyncTime: (time: number) => void;
  setPendingChanges: (count: number) => void;
  setError: (error: string | null) => void;
  handleSyncEvent: (event: SyncEvent) => Promise<void>;
}

export const useSyncStore = create<SyncState>()((set, get) => ({
  status: 'disconnected',
  lastSyncTime: 0,
  pendingChanges: 0,
  isInitialized: false,
  error: null,

  initialize: (token: string) => {
    if (get().isInitialized) return;

    // 订阅状态变化
    syncService.onStatusChange((status) => {
      set({ status });
    });

    // 订阅同步事件
    syncService.onSyncEvent(async (event) => {
      await get().handleSyncEvent(event);
    });

    // 连接到服务器
    syncService.connect(token);

    // 从 localStorage 恢复最后同步时间
    const savedTime = localStorage.getItem('lastSyncTime');
    if (savedTime) {
      const time = parseInt(savedTime, 10);
      set({ lastSyncTime: time });
      syncService.setLastSyncTime(time);
    }

    set({ isInitialized: true });
  },

  disconnect: () => {
    syncService.disconnect();
    set({ isInitialized: false, status: 'disconnected' });
  },

  setStatus: (status) => set({ status }),

  setLastSyncTime: (time) => {
    localStorage.setItem('lastSyncTime', time.toString());
    set({ lastSyncTime: time });
  },

  setPendingChanges: (count) => set({ pendingChanges: count }),

  setError: (error) => set({ error }),

  handleSyncEvent: async (event: SyncEvent) => {
    const kek = cryptoService.getKEK();
    if (!kek) return;

    try {
      if (event.type === 'note') {
        await handleNoteEvent(event, kek);
      } else if (event.type === 'folder') {
        await handleFolderEvent(event, kek);
      }

      // 更新最后同步时间
      get().setLastSyncTime(event.timestamp);
    } catch (error) {
      console.error('[Sync] Failed to handle event:', error);
      set({ error: 'Failed to sync data' });
    }
  },
}));

interface SyncNoteData {
  id: string;
  encryptedTitle: EncryptedData;
  encryptedContent: EncryptedData;
  encryptedDEK: WrappedKey;
  folderId: string | null;
  isPinned: boolean;
  hasPassword: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

async function handleNoteEvent(event: SyncEvent, kek: CryptoKey) {
  const noteStore = useNoteStore.getState();
  const data = event.data as SyncNoteData | undefined;

  switch (event.action) {
    case 'create':
    case 'update': {
      if (!data) return;
      
      try {
        // 解密笔记数据
        const dek = await cryptoService.unwrapDEK(data.encryptedDEK, kek);
        const title = await cryptoService.decrypt(data.encryptedTitle, dek);
        const content = await cryptoService.decrypt(data.encryptedContent, dek);

        const existingNote = noteStore.notes.find(n => n.id === event.entityId);
        
        if (existingNote) {
          // 更新现有笔记
          noteStore.updateNote(event.entityId, {
            title,
            content,
            folderId: data.folderId,
            isPinned: data.isPinned,
            isPasswordProtected: data.hasPassword,
            tags: data.tags,
            encryptedTitle: data.encryptedTitle,
            encryptedContent: data.encryptedContent,
            encryptedDEK: data.encryptedDEK,
          });
        } else {
          // 添加新笔记
          noteStore.addNote({
            id: event.entityId,
            title,
            content,
            folderId: data.folderId,
            isPinned: data.isPinned,
            isPasswordProtected: data.hasPassword,
            tags: data.tags,
            createdAt: new Date(data.createdAt).getTime(),
            updatedAt: new Date(data.updatedAt).getTime(),
            encryptedTitle: data.encryptedTitle,
            encryptedContent: data.encryptedContent,
            encryptedDEK: data.encryptedDEK,
          });
        }
      } catch (error) {
        console.error('[Sync] Failed to decrypt note:', error);
      }
      break;
    }
    case 'delete': {
      noteStore.deleteNote(event.entityId);
      break;
    }
  }
}

interface SyncFolderData {
  id: string;
  encryptedName: EncryptedData & { wrappedDEK?: string };
  parentId: string | null;
  order: number;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  deletedFolderIds?: string[];
}

async function handleFolderEvent(event: SyncEvent, kek: CryptoKey) {
  const folderStore = useFolderStore.getState();
  const data = event.data as SyncFolderData | undefined;

  switch (event.action) {
    case 'create':
    case 'update': {
      if (!data) return;
      
      try {
        // 解密文件夹名称
        let name: string;
        if (data.encryptedName.wrappedDEK) {
          // 新格式：使用 DEK 加密
          const wrappedDEK: WrappedKey = {
            wrappedKey: data.encryptedName.wrappedDEK,
            algorithm: 'AES-KW',
          };
          const dek = await cryptoService.unwrapDEK(wrappedDEK, kek);
          name = await cryptoService.decrypt({
            ciphertext: data.encryptedName.ciphertext,
            iv: data.encryptedName.iv,
            tag: data.encryptedName.tag,
            algorithm: 'AES-256-GCM',
          }, dek);
        } else {
          // 旧格式：直接使用 KEK 解密（需要转换为 GCM 密钥）
          // 这种情况不应该发生，因为 KEK 是 AES-KW 密钥
          // 如果遇到这种情况，跳过
          console.warn('[Sync] Folder encrypted with old format, skipping');
          return;
        }

        const existingFolder = folderStore.folders.find(f => f.id === event.entityId);
        
        if (existingFolder) {
          // 更新现有文件夹
          folderStore.updateFolder(event.entityId, {
            name,
            parentId: data.parentId,
            order: data.order,
            isPasswordProtected: data.hasPassword,
          });
        } else {
          // 添加新文件夹
          folderStore.addFolder({
            id: event.entityId,
            name,
            parentId: data.parentId,
            order: data.order,
            isPasswordProtected: data.hasPassword,
            createdAt: new Date(data.createdAt).getTime(),
            updatedAt: new Date(data.updatedAt).getTime(),
          });
        }
      } catch (error) {
        console.error('[Sync] Failed to decrypt folder:', error);
      }
      break;
    }
    case 'delete': {
      if (data?.deletedFolderIds) {
        // 删除所有相关文件夹
        data.deletedFolderIds.forEach(id => {
          folderStore.deleteFolder(id);
        });
      } else {
        folderStore.deleteFolder(event.entityId);
      }
      break;
    }
  }
}
