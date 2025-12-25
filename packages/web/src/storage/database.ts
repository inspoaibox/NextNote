/**
 * IndexedDB 数据库管理
 */

const DB_NAME = 'secure-notebook';
const DB_VERSION = 1;

export interface DBSchema {
  notes: {
    key: string;
    value: LocalNoteRecord;
    indexes: {
      'by-folder': string;
      'by-updated': number;
      'by-pinned': number;
    };
  };
  folders: {
    key: string;
    value: LocalFolderRecord;
    indexes: {
      'by-parent': string;
      'by-order': number;
    };
  };
  keystore: {
    key: string;
    value: KeyStoreRecord;
  };
  searchIndex: {
    key: string;
    value: SearchIndexRecord;
    indexes: {
      'by-note': string;
    };
  };
  images: {
    key: string;
    value: LocalImageRecord;
    indexes: {
      'by-note': string;
    };
  };
  syncQueue: {
    key: string;
    value: SyncQueueRecord;
    indexes: {
      'by-timestamp': number;
    };
  };
}

export interface LocalNoteRecord {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  isPinned: boolean;
  pinnedAt: number | null;
  hasPassword: boolean;
  tags: string[];
  syncVersion: number;
  localVersion: number;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

export interface LocalFolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  hasPassword: boolean;
  syncVersion: number;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}

export interface KeyStoreRecord {
  key: string;
  value: string;
  updatedAt: number;
}

export interface SearchIndexRecord {
  id: string;
  noteId: string;
  titleTokens: string[];
  contentTokens: string[];
  tags: string[];
  updatedAt: number;
}

export interface LocalImageRecord {
  id: string;
  noteId: string;
  data: ArrayBuffer;
  mimeType: string;
  size: number;
  createdAt: number;
}

export interface SyncQueueRecord {
  id: string;
  entityType: 'note' | 'folder' | 'image';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  timestamp: number;
  retryCount: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * 打开数据库连接
 */
export function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Notes store
      if (!db.objectStoreNames.contains('notes')) {
        const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
        notesStore.createIndex('by-folder', 'folderId', { unique: false });
        notesStore.createIndex('by-updated', 'updatedAt', { unique: false });
        notesStore.createIndex('by-pinned', 'pinnedAt', { unique: false });
      }

      // Folders store
      if (!db.objectStoreNames.contains('folders')) {
        const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
        foldersStore.createIndex('by-parent', 'parentId', { unique: false });
        foldersStore.createIndex('by-order', 'order', { unique: false });
      }

      // Keystore
      if (!db.objectStoreNames.contains('keystore')) {
        db.createObjectStore('keystore', { keyPath: 'key' });
      }

      // Search index
      if (!db.objectStoreNames.contains('searchIndex')) {
        const searchStore = db.createObjectStore('searchIndex', { keyPath: 'id' });
        searchStore.createIndex('by-note', 'noteId', { unique: false });
      }

      // Images store
      if (!db.objectStoreNames.contains('images')) {
        const imagesStore = db.createObjectStore('images', { keyPath: 'id' });
        imagesStore.createIndex('by-note', 'noteId', { unique: false });
      }

      // Sync queue
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('by-timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 删除数据库
 */
export function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    closeDatabase();
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to delete database'));
  });
}

/**
 * 通用事务执行器
 */
export async function withTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  callback: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
  const db = await openDatabase();
  const transaction = db.transaction(storeNames, mode);
  
  return new Promise((resolve, reject) => {
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error('Transaction aborted'));
    
    callback(transaction)
      .then(resolve)
      .catch(reject);
  });
}

/**
 * 获取对象存储
 */
export function getStore(
  transaction: IDBTransaction,
  storeName: string
): IDBObjectStore {
  return transaction.objectStore(storeName);
}

/**
 * 包装IDBRequest为Promise
 */
export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
