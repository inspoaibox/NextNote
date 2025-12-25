import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 获取应用数据路径
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // 监听菜单事件
  onMenuNewNote: (callback: () => void) => {
    ipcRenderer.on('menu-new-note', callback);
    return () => ipcRenderer.removeListener('menu-new-note', callback);
  },
  
  onMenuExport: (callback: () => void) => {
    ipcRenderer.on('menu-export', callback);
    return () => ipcRenderer.removeListener('menu-export', callback);
  },
  
  onMenuImport: (callback: () => void) => {
    ipcRenderer.on('menu-import', callback);
    return () => ipcRenderer.removeListener('menu-import', callback);
  },
  
  // 平台信息
  platform: process.platform,
  isElectron: true,

  // === 本地存储 API ===
  storage: {
    // 笔记
    getNote: (id: string) => ipcRenderer.invoke('storage:note:get', id),
    getAllNotes: () => ipcRenderer.invoke('storage:note:getAll'),
    saveNote: (note: unknown) => ipcRenderer.invoke('storage:note:save', note),
    deleteNote: (id: string) => ipcRenderer.invoke('storage:note:delete', id),
    
    // 文件夹
    getFolder: (id: string) => ipcRenderer.invoke('storage:folder:get', id),
    getAllFolders: () => ipcRenderer.invoke('storage:folder:getAll'),
    saveFolder: (folder: unknown) => ipcRenderer.invoke('storage:folder:save', folder),
    deleteFolder: (id: string) => ipcRenderer.invoke('storage:folder:delete', id),
    
    // 密钥
    getKey: (key: string) => ipcRenderer.invoke('storage:key:get', key),
    saveKey: (key: string, value: unknown) => ipcRenderer.invoke('storage:key:save', key, value),
    deleteKey: (key: string) => ipcRenderer.invoke('storage:key:delete', key),
    
    // 图片
    getImage: (id: string) => ipcRenderer.invoke('storage:image:get', id),
    saveImage: (id: string, data: ArrayBuffer, mimeType: string) => 
      ipcRenderer.invoke('storage:image:save', id, Buffer.from(data), mimeType),
    deleteImage: (id: string) => ipcRenderer.invoke('storage:image:delete', id),
    
    // 配置
    getConfig: () => ipcRenderer.invoke('storage:config:get'),
    saveConfig: (config: unknown) => ipcRenderer.invoke('storage:config:save', config),
    
    // 导出/导入
    exportData: () => ipcRenderer.invoke('storage:export'),
    importData: (data: unknown) => ipcRenderer.invoke('storage:import', data),
    
    // 数据路径
    getDataPath: () => ipcRenderer.invoke('storage:getDataPath'),
  },
});

// TypeScript 类型声明
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      getAppPath: () => Promise<string>;
      onMenuNewNote: (callback: () => void) => () => void;
      onMenuExport: (callback: () => void) => () => void;
      onMenuImport: (callback: () => void) => () => void;
      platform: string;
      isElectron: boolean;
      storage: {
        getNote: (id: string) => Promise<unknown>;
        getAllNotes: () => Promise<unknown[]>;
        saveNote: (note: unknown) => Promise<boolean>;
        deleteNote: (id: string) => Promise<boolean>;
        getFolder: (id: string) => Promise<unknown>;
        getAllFolders: () => Promise<unknown[]>;
        saveFolder: (folder: unknown) => Promise<boolean>;
        deleteFolder: (id: string) => Promise<boolean>;
        getKey: (key: string) => Promise<unknown>;
        saveKey: (key: string, value: unknown) => Promise<boolean>;
        deleteKey: (key: string) => Promise<boolean>;
        getImage: (id: string) => Promise<ArrayBuffer | null>;
        saveImage: (id: string, data: ArrayBuffer, mimeType: string) => Promise<boolean>;
        deleteImage: (id: string) => Promise<boolean>;
        getConfig: () => Promise<unknown>;
        saveConfig: (config: unknown) => Promise<boolean>;
        exportData: () => Promise<unknown>;
        importData: (data: unknown) => Promise<boolean>;
        getDataPath: () => Promise<string>;
      };
    };
  }
}
