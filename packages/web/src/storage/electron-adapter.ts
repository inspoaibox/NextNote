/**
 * Electron 本地存储适配器
 * 当运行在 Electron 环境时，使用本地文件系统存储
 * 否则使用 IndexedDB
 */

import type { LocalNoteRecord, LocalFolderRecord, KeyStoreRecord } from './database';

// Electron API 类型声明
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      getAppVersion: () => Promise<string>;
      getAppPath: () => Promise<string>;
      storage?: {
        getNote: (id: string) => Promise<LocalNoteRecord | null>;
        getAllNotes: () => Promise<LocalNoteRecord[]>;
        saveNote: (note: LocalNoteRecord) => Promise<boolean>;
        deleteNote: (id: string) => Promise<boolean>;
        getFolder: (id: string) => Promise<LocalFolderRecord | null>;
        getAllFolders: () => Promise<LocalFolderRecord[]>;
        saveFolder: (folder: LocalFolderRecord) => Promise<boolean>;
        deleteFolder: (id: string) => Promise<boolean>;
        getKey: (key: string) => Promise<KeyStoreRecord | null>;
        saveKey: (key: string, value: string) => Promise<boolean>;
        deleteKey: (key: string) => Promise<boolean>;
        getImage: (id: string) => Promise<ArrayBuffer | null>;
        saveImage: (id: string, data: ArrayBuffer, mimeType: string) => Promise<boolean>;
        deleteImage: (id: string) => Promise<boolean>;
        getConfig: () => Promise<Record<string, unknown>>;
        saveConfig: (config: Record<string, unknown>) => Promise<boolean>;
        exportData: () => Promise<{
          version: number;
          exportedAt: number;
          notes: LocalNoteRecord[];
          folders: LocalFolderRecord[];
          config: Record<string, unknown>;
        }>;
        importData: (data: {
          notes?: LocalNoteRecord[];
          folders?: LocalFolderRecord[];
          config?: Record<string, unknown>;
        }) => Promise<boolean>;
        getDataPath: () => Promise<string>;
      };
    };
  }
}

// 检测是否在 Electron 环境
export const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

// Electron 存储 API
const electronStorage = () => window.electronAPI?.storage;

/**
 * 笔记存储适配器
 */
export const noteStorageAdapter = {
  async get(id: string): Promise<LocalNoteRecord | null> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getNote(id);
    }
    return null;
  },

  async getAll(): Promise<LocalNoteRecord[]> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getAllNotes();
    }
    return [];
  },

  async save(note: LocalNoteRecord): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.saveNote(note);
    }
    return false;
  },

  async delete(id: string): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.deleteNote(id);
    }
    return false;
  },
};

/**
 * 文件夹存储适配器
 */
export const folderStorageAdapter = {
  async get(id: string): Promise<LocalFolderRecord | null> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getFolder(id);
    }
    return null;
  },

  async getAll(): Promise<LocalFolderRecord[]> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getAllFolders();
    }
    return [];
  },

  async save(folder: LocalFolderRecord): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.saveFolder(folder);
    }
    return false;
  },

  async delete(id: string): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.deleteFolder(id);
    }
    return false;
  },
};

/**
 * 密钥存储适配器
 */
export const keyStorageAdapter = {
  async get(key: string): Promise<KeyStoreRecord | null> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getKey(key);
    }
    return null;
  },

  async save(key: string, value: string): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.saveKey(key, value);
    }
    return false;
  },

  async delete(key: string): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.deleteKey(key);
    }
    return false;
  },
};

/**
 * 图片存储适配器
 */
export const imageStorageAdapter = {
  async get(id: string): Promise<ArrayBuffer | null> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getImage(id);
    }
    return null;
  },

  async save(id: string, data: ArrayBuffer, mimeType: string): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.saveImage(id, data, mimeType);
    }
    return false;
  },

  async delete(id: string): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.deleteImage(id);
    }
    return false;
  },
};

/**
 * 配置存储适配器
 */
export const configStorageAdapter = {
  async get<T extends Record<string, unknown>>(): Promise<T | null> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getConfig() as Promise<T>;
    }
    return null;
  },

  async save(config: Record<string, unknown>): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.saveConfig(config);
    }
    return false;
  },
};

/**
 * 导出/导入适配器
 */
export const backupAdapter = {
  async exportData() {
    if (isElectron && electronStorage()) {
      return electronStorage()!.exportData();
    }
    return null;
  },

  async importData(data: {
    notes?: LocalNoteRecord[];
    folders?: LocalFolderRecord[];
    config?: Record<string, unknown>;
  }): Promise<boolean> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.importData(data);
    }
    return false;
  },

  async getDataPath(): Promise<string | null> {
    if (isElectron && electronStorage()) {
      return electronStorage()!.getDataPath();
    }
    return null;
  },
};
