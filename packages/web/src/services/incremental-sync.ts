/**
 * 增量同步引擎
 * 支持多种同步目标：服务器、WebDAV
 */

import { openDatabase, promisifyRequest, SyncConfigRecord, LocalNoteRecord, LocalFolderRecord } from '../storage/database';

export type SyncTarget = 'none' | 'server' | 'webdav';
export type SyncInterval = 1 | 2 | 3 | 5 | 10 | 30 | 60;

export interface SyncResult {
  success: boolean;
  error?: string;
  stats: {
    notesUploaded: number;
    notesDownloaded: number;
    foldersUploaded: number;
    foldersDownloaded: number;
    conflicts: number;
  };
}

export interface RemoteNote {
  id: string;
  encryptedTitle: string;
  encryptedContent: string;
  encryptedDEK: string;
  folderId: string | null;
  isPinned: boolean;
  hasPassword: boolean;
  tags: string[];
  syncVersion: number;
  lastModifiedDeviceId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}

export interface RemoteFolder {
  id: string;
  encryptedName: string;
  parentId: string | null;
  order: number;
  hasPassword: boolean;
  syncVersion: number;
  lastModifiedDeviceId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}

// 生成设备唯一标识
function generateDeviceId(): string {
  const stored = localStorage.getItem('device-id');
  if (stored) return stored;
  
  const id = crypto.randomUUID();
  localStorage.setItem('device-id', id);
  return id;
}

export const deviceId = generateDeviceId();

/**
 * 检测后端服务是否可用
 */
export async function detectBackendAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${window.location.origin}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 初始化默认同步配置（首次使用时调用）
 */
export async function initDefaultSyncConfig(): Promise<void> {
  const existing = await getSyncConfig();
  if (existing) return; // 已有配置，不覆盖
  
  // 检测后端是否可用
  const backendAvailable = await detectBackendAvailable();
  
  if (backendAvailable) {
    // 前后端一起部署，默认启用服务器同步
    await saveSyncConfig({
      syncTarget: 'server',
      syncInterval: 5,
      serverUrl: window.location.origin,
      isEnabled: true,
    });
    console.log('[Sync] Backend detected, auto-configured server sync');
  } else {
    // 只有前端，默认不同步
    await saveSyncConfig({
      syncTarget: 'none',
      syncInterval: 5,
      isEnabled: false,
    });
    console.log('[Sync] No backend detected, sync disabled');
  }
}

/**
 * 获取同步配置
 */
export async function getSyncConfig(): Promise<SyncConfigRecord | null> {
  const db = await openDatabase();
  const tx = db.transaction('syncConfig', 'readonly');
  const store = tx.objectStore('syncConfig');
  const result = await promisifyRequest(store.get('default'));
  return result || null;
}

/**
 * 保存同步配置
 */
export async function saveSyncConfig(config: Partial<SyncConfigRecord>): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('syncConfig', 'readwrite');
  const store = tx.objectStore('syncConfig');
  
  const existing = await promisifyRequest(store.get('default'));
  const updated: SyncConfigRecord = {
    id: 'default',
    syncTarget: 'none',
    syncInterval: 5,
    webdavUrl: null,
    webdavUsername: null,
    webdavPassword: null,
    serverUrl: null,
    serverUsername: null,
    serverPassword: null,
    lastSyncAt: null,
    lastSyncVersion: 0,
    isEnabled: false,
    deviceId,
    ...existing,
    ...config,
  };
  
  await promisifyRequest(store.put(updated));
}

/**
 * 获取本地待同步的笔记（isDirty = true 或 syncVersion > lastSyncVersion）
 */
export async function getLocalDirtyNotes(): Promise<LocalNoteRecord[]> {
  const db = await openDatabase();
  const tx = db.transaction('notes', 'readonly');
  const store = tx.objectStore('notes');
  const all = await promisifyRequest(store.getAll());
  return all.filter(note => note.isDirty);
}

/**
 * 获取本地待同步的文件夹
 */
export async function getLocalDirtyFolders(): Promise<LocalFolderRecord[]> {
  const db = await openDatabase();
  const tx = db.transaction('folders', 'readonly');
  const store = tx.objectStore('folders');
  const all = await promisifyRequest(store.getAll());
  return all.filter(folder => folder.isDirty);
}

/**
 * 合并远程笔记到本地
 */
export async function mergeRemoteNotes(remoteNotes: RemoteNote[]): Promise<{ merged: number; conflicts: number }> {
  const db = await openDatabase();
  const tx = db.transaction('notes', 'readwrite');
  const store = tx.objectStore('notes');
  
  let merged = 0;
  let conflicts = 0;
  
  for (const remote of remoteNotes) {
    const local = await promisifyRequest(store.get(remote.id));
    
    if (!local) {
      // 本地不存在，直接创建
      const newLocal: LocalNoteRecord = {
        id: remote.id,
        title: '', // 需要解密
        content: '', // 需要解密
        folderId: remote.folderId,
        isPinned: remote.isPinned,
        pinnedAt: remote.isPinned ? Date.now() : null,
        hasPassword: remote.hasPassword,
        tags: remote.tags,
        syncVersion: remote.syncVersion,
        localVersion: remote.syncVersion,
        isDirty: false,
        lastModifiedDeviceId: remote.lastModifiedDeviceId,
        createdAt: new Date(remote.createdAt).getTime(),
        updatedAt: new Date(remote.updatedAt).getTime(),
        isDeleted: remote.isDeleted,
        deletedAt: remote.deletedAt ? new Date(remote.deletedAt).getTime() : null,
        encryptedTitle: remote.encryptedTitle,
        encryptedContent: remote.encryptedContent,
        encryptedDEK: remote.encryptedDEK,
      };
      await promisifyRequest(store.put(newLocal));
      merged++;
    } else if (remote.syncVersion > local.syncVersion) {
      // 远程版本更新
      if (local.isDirty) {
        // 冲突：本地有未同步的修改
        // 策略：比较 updatedAt，保留最新的
        const remoteTime = new Date(remote.updatedAt).getTime();
        if (remoteTime > local.updatedAt) {
          // 远程更新，覆盖本地（本地修改丢失，可以考虑保存到历史版本）
          const updated: LocalNoteRecord = {
            ...local,
            folderId: remote.folderId,
            isPinned: remote.isPinned,
            pinnedAt: remote.isPinned ? Date.now() : null,
            hasPassword: remote.hasPassword,
            tags: remote.tags,
            syncVersion: remote.syncVersion,
            localVersion: remote.syncVersion,
            isDirty: false,
            lastModifiedDeviceId: remote.lastModifiedDeviceId,
            updatedAt: remoteTime,
            isDeleted: remote.isDeleted,
            deletedAt: remote.deletedAt ? new Date(remote.deletedAt).getTime() : null,
            encryptedTitle: remote.encryptedTitle,
            encryptedContent: remote.encryptedContent,
            encryptedDEK: remote.encryptedDEK,
          };
          await promisifyRequest(store.put(updated));
          conflicts++;
        }
        // 否则保留本地版本，等待下次同步上传
      } else {
        // 无冲突，直接更新
        const updated: LocalNoteRecord = {
          ...local,
          folderId: remote.folderId,
          isPinned: remote.isPinned,
          pinnedAt: remote.isPinned ? Date.now() : null,
          hasPassword: remote.hasPassword,
          tags: remote.tags,
          syncVersion: remote.syncVersion,
          localVersion: remote.syncVersion,
          lastModifiedDeviceId: remote.lastModifiedDeviceId,
          updatedAt: new Date(remote.updatedAt).getTime(),
          isDeleted: remote.isDeleted,
          deletedAt: remote.deletedAt ? new Date(remote.deletedAt).getTime() : null,
          encryptedTitle: remote.encryptedTitle,
          encryptedContent: remote.encryptedContent,
          encryptedDEK: remote.encryptedDEK,
        };
        await promisifyRequest(store.put(updated));
        merged++;
      }
    }
  }
  
  return { merged, conflicts };
}

/**
 * 合并远程文件夹到本地
 */
export async function mergeRemoteFolders(remoteFolders: RemoteFolder[]): Promise<{ merged: number; conflicts: number }> {
  const db = await openDatabase();
  const tx = db.transaction('folders', 'readwrite');
  const store = tx.objectStore('folders');
  
  let merged = 0;
  let conflicts = 0;
  
  for (const remote of remoteFolders) {
    const local = await promisifyRequest(store.get(remote.id));
    
    if (!local) {
      const newLocal: LocalFolderRecord = {
        id: remote.id,
        name: '', // 需要解密
        parentId: remote.parentId,
        order: remote.order,
        hasPassword: remote.hasPassword,
        syncVersion: remote.syncVersion,
        localVersion: remote.syncVersion,
        isDirty: false,
        lastModifiedDeviceId: remote.lastModifiedDeviceId,
        createdAt: new Date(remote.createdAt).getTime(),
        updatedAt: new Date(remote.updatedAt).getTime(),
        isDeleted: remote.isDeleted,
        deletedAt: remote.deletedAt ? new Date(remote.deletedAt).getTime() : null,
        encryptedName: remote.encryptedName,
      };
      await promisifyRequest(store.put(newLocal));
      merged++;
    } else if (remote.syncVersion > local.syncVersion) {
      if (local.isDirty) {
        const remoteTime = new Date(remote.updatedAt).getTime();
        if (remoteTime > local.updatedAt) {
          const updated: LocalFolderRecord = {
            ...local,
            parentId: remote.parentId,
            order: remote.order,
            hasPassword: remote.hasPassword,
            syncVersion: remote.syncVersion,
            localVersion: remote.syncVersion,
            isDirty: false,
            lastModifiedDeviceId: remote.lastModifiedDeviceId,
            updatedAt: remoteTime,
            isDeleted: remote.isDeleted,
            deletedAt: remote.deletedAt ? new Date(remote.deletedAt).getTime() : null,
            encryptedName: remote.encryptedName,
          };
          await promisifyRequest(store.put(updated));
          conflicts++;
        }
      } else {
        const updated: LocalFolderRecord = {
          ...local,
          parentId: remote.parentId,
          order: remote.order,
          hasPassword: remote.hasPassword,
          syncVersion: remote.syncVersion,
          localVersion: remote.syncVersion,
          lastModifiedDeviceId: remote.lastModifiedDeviceId,
          updatedAt: new Date(remote.updatedAt).getTime(),
          isDeleted: remote.isDeleted,
          deletedAt: remote.deletedAt ? new Date(remote.deletedAt).getTime() : null,
          encryptedName: remote.encryptedName,
        };
        await promisifyRequest(store.put(updated));
        merged++;
      }
    }
  }
  
  return { merged, conflicts };
}

/**
 * 标记笔记为已同步
 */
export async function markNotesSynced(noteIds: string[], newSyncVersion: number): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('notes', 'readwrite');
  const store = tx.objectStore('notes');
  
  for (const id of noteIds) {
    const note = await promisifyRequest(store.get(id));
    if (note) {
      note.isDirty = false;
      note.syncVersion = newSyncVersion;
      note.localVersion = newSyncVersion;
      await promisifyRequest(store.put(note));
    }
  }
}

/**
 * 标记文件夹为已同步
 */
export async function markFoldersSynced(folderIds: string[], newSyncVersion: number): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('folders', 'readwrite');
  const store = tx.objectStore('folders');
  
  for (const id of folderIds) {
    const folder = await promisifyRequest(store.get(id));
    if (folder) {
      folder.isDirty = false;
      folder.syncVersion = newSyncVersion;
      folder.localVersion = newSyncVersion;
      await promisifyRequest(store.put(folder));
    }
  }
}


// ============ 同步适配器接口 ============

export interface SyncAdapter {
  name: string;
  testConnection(): Promise<boolean>;
  pullChanges(sinceSyncVersion: number): Promise<{ notes: RemoteNote[]; folders: RemoteFolder[]; currentSyncVersion: number }>;
  pushChanges(notes: LocalNoteRecord[], folders: LocalFolderRecord[]): Promise<{ success: boolean; results: any }>;
}

// ============ 服务器同步适配器 ============

export class ServerSyncAdapter implements SyncAdapter {
  name = 'server';
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async pullChanges(sinceSyncVersion: number): Promise<{ notes: RemoteNote[]; folders: RemoteFolder[]; currentSyncVersion: number }> {
    const response = await fetch(`${this.baseUrl}/api/sync/changes?since=${sinceSyncVersion}`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to pull changes: ${response.status}`);
    }

    const data = await response.json();
    return {
      notes: data.notes || [],
      folders: data.folders || [],
      currentSyncVersion: data.currentSyncVersion || sinceSyncVersion,
    };
  }

  async pushChanges(notes: LocalNoteRecord[], folders: LocalFolderRecord[]): Promise<{ success: boolean; results: any }> {
    const response = await fetch(`${this.baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId,
        notes: notes.map(n => ({
          id: n.id,
          encryptedTitle: n.encryptedTitle,
          encryptedContent: n.encryptedContent,
          encryptedDEK: n.encryptedDEK,
          folderId: n.folderId,
          isPinned: n.isPinned,
          hasPassword: n.hasPassword,
          tags: n.tags,
          syncVersion: n.syncVersion,
          updatedAt: new Date(n.updatedAt).toISOString(),
          isDeleted: n.isDeleted,
        })),
        folders: folders.map(f => ({
          id: f.id,
          encryptedName: f.encryptedName,
          parentId: f.parentId,
          order: f.order,
          hasPassword: f.hasPassword,
          syncVersion: f.syncVersion,
          updatedAt: new Date(f.updatedAt).toISOString(),
          isDeleted: f.isDeleted,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to push changes: ${response.status}`);
    }

    const data = await response.json();
    return { success: data.success, results: data.results };
  }
}

// ============ WebDAV 同步适配器 ============

export class WebDAVSyncAdapter implements SyncAdapter {
  name = 'webdav';
  private baseUrl: string;
  private username: string;
  private password: string;
  private syncPath = '/secure-notebook-sync';

  constructor(baseUrl: string, username: string, password: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.username = username;
    this.password = password;
  }

  private getAuthHeader(): string {
    return 'Basic ' + btoa(`${this.username}:${this.password}`);
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}${this.syncPath}/`, {
        method: 'PROPFIND',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Depth': '0',
        },
      });
      
      if (response.status === 404) {
        // 目录不存在，尝试创建
        const mkcolResponse = await fetch(`${this.baseUrl}${this.syncPath}/`, {
          method: 'MKCOL',
          headers: {
            'Authorization': this.getAuthHeader(),
          },
        });
        return mkcolResponse.ok || mkcolResponse.status === 405; // 405 表示已存在
      }
      
      return response.ok || response.status === 207;
    } catch {
      return false;
    }
  }

  async pullChanges(sinceSyncVersion: number): Promise<{ notes: RemoteNote[]; folders: RemoteFolder[]; currentSyncVersion: number }> {
    try {
      // 读取同步状态文件
      const stateResponse = await fetch(`${this.baseUrl}${this.syncPath}/sync-state.json`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });

      if (!stateResponse.ok) {
        // 文件不存在，返回空
        return { notes: [], folders: [], currentSyncVersion: 0 };
      }

      const state = await stateResponse.json();
      
      // 过滤出 syncVersion 大于指定值的数据
      const notes = (state.notes || []).filter((n: RemoteNote) => n.syncVersion > sinceSyncVersion);
      const folders = (state.folders || []).filter((f: RemoteFolder) => f.syncVersion > sinceSyncVersion);
      
      return {
        notes,
        folders,
        currentSyncVersion: state.currentSyncVersion || 0,
      };
    } catch (error) {
      console.error('WebDAV pull error:', error);
      return { notes: [], folders: [], currentSyncVersion: sinceSyncVersion };
    }
  }

  async pushChanges(notes: LocalNoteRecord[], folders: LocalFolderRecord[]): Promise<{ success: boolean; results: any }> {
    try {
      // 先拉取现有数据
      const existing = await this.pullChanges(0);
      
      // 合并数据
      const noteMap = new Map<string, any>();
      const folderMap = new Map<string, any>();
      
      // 添加现有数据
      for (const n of existing.notes) {
        noteMap.set(n.id, n);
      }
      for (const f of existing.folders) {
        folderMap.set(f.id, f);
      }
      
      // 更新/添加新数据
      let maxSyncVersion = existing.currentSyncVersion;
      for (const n of notes) {
        const newVersion = (noteMap.get(n.id)?.syncVersion || 0) + 1;
        maxSyncVersion = Math.max(maxSyncVersion, newVersion);
        noteMap.set(n.id, {
          id: n.id,
          encryptedTitle: n.encryptedTitle,
          encryptedContent: n.encryptedContent,
          encryptedDEK: n.encryptedDEK,
          folderId: n.folderId,
          isPinned: n.isPinned,
          hasPassword: n.hasPassword,
          tags: n.tags,
          syncVersion: newVersion,
          lastModifiedDeviceId: deviceId,
          createdAt: new Date(n.createdAt).toISOString(),
          updatedAt: new Date(n.updatedAt).toISOString(),
          isDeleted: n.isDeleted,
          deletedAt: n.deletedAt ? new Date(n.deletedAt).toISOString() : null,
        });
      }
      
      for (const f of folders) {
        const newVersion = (folderMap.get(f.id)?.syncVersion || 0) + 1;
        maxSyncVersion = Math.max(maxSyncVersion, newVersion);
        folderMap.set(f.id, {
          id: f.id,
          encryptedName: f.encryptedName,
          parentId: f.parentId,
          order: f.order,
          hasPassword: f.hasPassword,
          syncVersion: newVersion,
          lastModifiedDeviceId: deviceId,
          createdAt: new Date(f.createdAt).toISOString(),
          updatedAt: new Date(f.updatedAt).toISOString(),
          isDeleted: f.isDeleted,
          deletedAt: f.deletedAt ? new Date(f.deletedAt).toISOString() : null,
        });
      }
      
      // 保存到 WebDAV
      const state = {
        notes: Array.from(noteMap.values()),
        folders: Array.from(folderMap.values()),
        currentSyncVersion: maxSyncVersion,
        lastUpdated: new Date().toISOString(),
      };
      
      const response = await fetch(`${this.baseUrl}${this.syncPath}/sync-state.json`, {
        method: 'PUT',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(state),
      });
      
      return {
        success: response.ok,
        results: { notes: { updated: notes.length }, folders: { updated: folders.length } },
      };
    } catch (error) {
      console.error('WebDAV push error:', error);
      return { success: false, results: { error: String(error) } };
    }
  }
}

// ============ 同步管理器 ============

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let syncListeners: Array<(result: SyncResult) => void> = [];

export function addSyncListener(listener: (result: SyncResult) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifySyncListeners(result: SyncResult) {
  for (const listener of syncListeners) {
    try {
      listener(result);
    } catch (e) {
      console.error('Sync listener error:', e);
    }
  }
}

/**
 * 使用用户名密码登录服务器获取 token
 */
async function loginToServer(serverUrl: string, email: string, password: string): Promise<string | null> {
  try {
    const response = await fetch(`${serverUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    if (!response.ok) {
      console.error('Server login failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data.token || null;
  } catch (error) {
    console.error('Server login error:', error);
    return null;
  }
}

/**
 * 创建同步适配器
 */
export async function createSyncAdapter(): Promise<SyncAdapter | null> {
  const config = await getSyncConfig();
  if (!config || config.syncTarget === 'none') {
    return null;
  }

  if (config.syncTarget === 'server') {
    const serverUrl = config.serverUrl || window.location.origin;
    
    // 如果配置了独立的用户名密码，使用它们登录
    if (config.serverUsername && config.serverPassword) {
      const token = await loginToServer(serverUrl, config.serverUsername, config.serverPassword);
      if (!token) {
        console.error('[Sync] Failed to login to server with provided credentials');
        return null;
      }
      return new ServerSyncAdapter(serverUrl, token);
    }
    
    // 否则使用当前登录的 token
    const authData = localStorage.getItem('auth-data');
    if (!authData) return null;
    
    try {
      const { token } = JSON.parse(authData);
      return new ServerSyncAdapter(serverUrl, token);
    } catch {
      return null;
    }
  }

  if (config.syncTarget === 'webdav') {
    if (!config.webdavUrl || !config.webdavUsername || !config.webdavPassword) {
      return null;
    }
    return new WebDAVSyncAdapter(config.webdavUrl, config.webdavUsername, config.webdavPassword);
  }

  return null;
}

/**
 * 执行一次同步
 */
export async function performSync(): Promise<SyncResult> {
  if (isSyncing) {
    return {
      success: false,
      error: 'Sync already in progress',
      stats: { notesUploaded: 0, notesDownloaded: 0, foldersUploaded: 0, foldersDownloaded: 0, conflicts: 0 },
    };
  }

  isSyncing = true;
  const stats = {
    notesUploaded: 0,
    notesDownloaded: 0,
    foldersUploaded: 0,
    foldersDownloaded: 0,
    conflicts: 0,
  };

  try {
    const adapter = await createSyncAdapter();
    if (!adapter) {
      return { success: false, error: 'No sync adapter configured', stats };
    }

    const config = await getSyncConfig();
    const lastSyncVersion = config?.lastSyncVersion || 0;

    // 1. 拉取远程变更
    console.log('[Sync] Pulling changes since version:', lastSyncVersion);
    const { notes: remoteNotes, folders: remoteFolders, currentSyncVersion } = await adapter.pullChanges(lastSyncVersion);
    
    // 2. 合并远程数据到本地
    if (remoteNotes.length > 0) {
      const noteResult = await mergeRemoteNotes(remoteNotes);
      stats.notesDownloaded = noteResult.merged;
      stats.conflicts += noteResult.conflicts;
    }
    
    if (remoteFolders.length > 0) {
      const folderResult = await mergeRemoteFolders(remoteFolders);
      stats.foldersDownloaded = folderResult.merged;
      stats.conflicts += folderResult.conflicts;
    }

    // 3. 获取本地脏数据
    const dirtyNotes = await getLocalDirtyNotes();
    const dirtyFolders = await getLocalDirtyFolders();

    // 4. 推送本地变更
    if (dirtyNotes.length > 0 || dirtyFolders.length > 0) {
      console.log('[Sync] Pushing changes:', dirtyNotes.length, 'notes,', dirtyFolders.length, 'folders');
      const pushResult = await adapter.pushChanges(dirtyNotes, dirtyFolders);
      
      if (pushResult.success) {
        // 标记为已同步
        if (dirtyNotes.length > 0) {
          await markNotesSynced(dirtyNotes.map(n => n.id), currentSyncVersion + 1);
          stats.notesUploaded = dirtyNotes.length;
        }
        if (dirtyFolders.length > 0) {
          await markFoldersSynced(dirtyFolders.map(f => f.id), currentSyncVersion + 1);
          stats.foldersUploaded = dirtyFolders.length;
        }
      }
    }

    // 5. 更新同步配置
    await saveSyncConfig({
      lastSyncAt: Date.now(),
      lastSyncVersion: currentSyncVersion,
    });

    console.log('[Sync] Completed:', stats);
    const result: SyncResult = { success: true, stats };
    notifySyncListeners(result);
    return result;
  } catch (error) {
    console.error('[Sync] Error:', error);
    const result: SyncResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stats,
    };
    notifySyncListeners(result);
    return result;
  } finally {
    isSyncing = false;
  }
}

/**
 * 启动自动同步
 */
export async function startAutoSync(): Promise<void> {
  stopAutoSync();
  
  const config = await getSyncConfig();
  if (!config || !config.isEnabled || config.syncTarget === 'none') {
    console.log('[Sync] Auto sync disabled');
    return;
  }

  const intervalMs = config.syncInterval * 60 * 1000;
  console.log('[Sync] Starting auto sync, interval:', config.syncInterval, 'minutes');
  
  // 立即执行一次
  performSync();
  
  // 设置定时器
  syncTimer = setInterval(() => {
    performSync();
  }, intervalMs);
}

/**
 * 停止自动同步
 */
export function stopAutoSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[Sync] Auto sync stopped');
  }
}

/**
 * 检查是否正在同步
 */
export function isSyncInProgress(): boolean {
  return isSyncing;
}
