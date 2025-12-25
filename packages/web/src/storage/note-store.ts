/**
 * 本地笔记存储
 */

import {
  openDatabase,
  withTransaction,
  getStore,
  promisifyRequest,
  type LocalNoteRecord,
  type SyncQueueRecord,
} from './database';

/**
 * 保存笔记到本地存储
 */
export async function saveNote(note: LocalNoteRecord): Promise<LocalNoteRecord> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['notes', 'syncQueue'], 'readwrite');
    const notesStore = transaction.objectStore('notes');
    const syncStore = transaction.objectStore('syncQueue');
    
    // 获取现有笔记以检查版本
    const getRequest = notesStore.get(note.id);
    
    getRequest.onsuccess = () => {
      const existingNote = getRequest.result as LocalNoteRecord | undefined;
      
      // 更新版本号
      const updatedNote: LocalNoteRecord = {
        ...note,
        localVersion: existingNote ? existingNote.localVersion + 1 : 1,
        isDirty: true,
        updatedAt: Date.now(),
      };
      
      // 保存笔记
      const putRequest = notesStore.put(updatedNote);
      
      putRequest.onsuccess = () => {
        // 添加到同步队列
        const syncRecord: SyncQueueRecord = {
          id: `${note.id}-${Date.now()}`,
          entityType: 'note',
          entityId: note.id,
          operation: existingNote ? 'update' : 'create',
          timestamp: Date.now(),
          retryCount: 0,
        };
        
        syncStore.put(syncRecord);
      };
      
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
    
    transaction.oncomplete = () => {
      // 重新获取保存后的笔记
      const readTx = db.transaction('notes', 'readonly');
      const readStore = readTx.objectStore('notes');
      const readRequest = readStore.get(note.id);
      
      readRequest.onsuccess = () => resolve(readRequest.result);
      readRequest.onerror = () => reject(readRequest.error);
    };
    
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取笔记
 */
export async function getNote(id: string): Promise<LocalNoteRecord | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction('notes', 'readonly');
  const store = transaction.objectStore('notes');
  return promisifyRequest(store.get(id));
}

/**
 * 获取所有笔记
 */
export async function getAllNotes(): Promise<LocalNoteRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction('notes', 'readonly');
  const store = transaction.objectStore('notes');
  const notes = await promisifyRequest(store.getAll());
  return notes.filter(n => !n.isDeleted);
}

/**
 * 获取文件夹中的笔记
 */
export async function getNotesByFolder(folderId: string | null): Promise<LocalNoteRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction('notes', 'readonly');
  const store = transaction.objectStore('notes');
  const index = store.index('by-folder');
  const notes = await promisifyRequest(index.getAll(folderId));
  return notes.filter(n => !n.isDeleted);
}

/**
 * 获取置顶笔记
 */
export async function getPinnedNotes(): Promise<LocalNoteRecord[]> {
  const notes = await getAllNotes();
  return notes
    .filter(n => n.isPinned)
    .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
}

/**
 * 删除笔记（软删除）
 */
export async function deleteNote(id: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  
  await saveNote({
    ...note,
    isDeleted: true,
    updatedAt: Date.now(),
  });
}

/**
 * 永久删除笔记
 */
export async function permanentlyDeleteNote(id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(['notes', 'syncQueue'], 'readwrite');
  const notesStore = transaction.objectStore('notes');
  const syncStore = transaction.objectStore('syncQueue');
  
  notesStore.delete(id);
  
  // 添加删除操作到同步队列
  const syncRecord: SyncQueueRecord = {
    id: `${id}-${Date.now()}`,
    entityType: 'note',
    entityId: id,
    operation: 'delete',
    timestamp: Date.now(),
    retryCount: 0,
  };
  
  syncStore.put(syncRecord);
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 置顶笔记
 */
export async function pinNote(id: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  
  await saveNote({
    ...note,
    isPinned: true,
    pinnedAt: Date.now(),
  });
}

/**
 * 取消置顶
 */
export async function unpinNote(id: string): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  
  await saveNote({
    ...note,
    isPinned: false,
    pinnedAt: null,
  });
}

/**
 * 获取脏数据（需要同步的笔记）
 */
export async function getDirtyNotes(): Promise<LocalNoteRecord[]> {
  const notes = await getAllNotes();
  return notes.filter(n => n.isDirty);
}

/**
 * 标记笔记为已同步
 */
export async function markNoteSynced(
  id: string,
  syncVersion: number
): Promise<void> {
  const note = await getNote(id);
  if (!note) return;
  
  const db = await openDatabase();
  const transaction = db.transaction('notes', 'readwrite');
  const store = transaction.objectStore('notes');
  
  const updatedNote: LocalNoteRecord = {
    ...note,
    syncVersion,
    isDirty: false,
  };
  
  store.put(updatedNote);
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 批量保存笔记（用于同步）
 */
export async function bulkSaveNotes(notes: LocalNoteRecord[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('notes', 'readwrite');
  const store = transaction.objectStore('notes');
  
  for (const note of notes) {
    store.put(note);
  }
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取笔记列表（带排序）
 */
export async function getNoteList(
  folderId?: string | null,
  options?: {
    sortBy?: 'updatedAt' | 'createdAt' | 'title';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<LocalNoteRecord[]> {
  let notes: LocalNoteRecord[];
  
  if (folderId !== undefined) {
    notes = await getNotesByFolder(folderId);
  } else {
    notes = await getAllNotes();
  }
  
  const { sortBy = 'updatedAt', sortOrder = 'desc' } = options || {};
  
  // 分离置顶和非置顶笔记
  const pinnedNotes = notes.filter(n => n.isPinned);
  const unpinnedNotes = notes.filter(n => !n.isPinned);
  
  // 排序函数
  const sortFn = (a: LocalNoteRecord, b: LocalNoteRecord) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'createdAt':
        comparison = a.createdAt - b.createdAt;
        break;
      case 'updatedAt':
      default:
        comparison = a.updatedAt - b.updatedAt;
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  };
  
  // 置顶笔记按置顶时间排序
  pinnedNotes.sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
  
  // 非置顶笔记按指定方式排序
  unpinnedNotes.sort(sortFn);
  
  return [...pinnedNotes, ...unpinnedNotes];
}
