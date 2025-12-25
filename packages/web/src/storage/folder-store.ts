/**
 * 本地文件夹存储
 */

import {
  openDatabase,
  promisifyRequest,
  type LocalFolderRecord,
  type SyncQueueRecord,
} from './database';

/**
 * 保存文件夹
 */
export async function saveFolder(folder: LocalFolderRecord): Promise<LocalFolderRecord> {
  const db = await openDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['folders', 'syncQueue'], 'readwrite');
    const foldersStore = transaction.objectStore('folders');
    const syncStore = transaction.objectStore('syncQueue');
    
    const getRequest = foldersStore.get(folder.id);
    
    getRequest.onsuccess = () => {
      const existingFolder = getRequest.result as LocalFolderRecord | undefined;
      
      const updatedFolder: LocalFolderRecord = {
        ...folder,
        isDirty: true,
        updatedAt: Date.now(),
      };
      
      foldersStore.put(updatedFolder);
      
      const syncRecord: SyncQueueRecord = {
        id: `${folder.id}-${Date.now()}`,
        entityType: 'folder',
        entityId: folder.id,
        operation: existingFolder ? 'update' : 'create',
        timestamp: Date.now(),
        retryCount: 0,
      };
      
      syncStore.put(syncRecord);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
    
    transaction.oncomplete = () => {
      const readTx = db.transaction('folders', 'readonly');
      const readStore = readTx.objectStore('folders');
      const readRequest = readStore.get(folder.id);
      
      readRequest.onsuccess = () => resolve(readRequest.result);
      readRequest.onerror = () => reject(readRequest.error);
    };
    
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 获取文件夹
 */
export async function getFolder(id: string): Promise<LocalFolderRecord | undefined> {
  const db = await openDatabase();
  const transaction = db.transaction('folders', 'readonly');
  const store = transaction.objectStore('folders');
  return promisifyRequest(store.get(id));
}

/**
 * 获取所有文件夹
 */
export async function getAllFolders(): Promise<LocalFolderRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction('folders', 'readonly');
  const store = transaction.objectStore('folders');
  const folders = await promisifyRequest(store.getAll());
  return folders.filter(f => !f.isDeleted);
}

/**
 * 获取子文件夹
 */
export async function getChildFolders(parentId: string | null): Promise<LocalFolderRecord[]> {
  const db = await openDatabase();
  const transaction = db.transaction('folders', 'readonly');
  const store = transaction.objectStore('folders');
  const index = store.index('by-parent');
  const folders = await promisifyRequest(index.getAll(parentId));
  return folders.filter(f => !f.isDeleted).sort((a, b) => a.order - b.order);
}

/**
 * 删除文件夹（软删除，级联）
 */
export async function deleteFolder(id: string): Promise<void> {
  const folder = await getFolder(id);
  if (!folder) return;
  
  // 获取所有子文件夹
  const childFolders = await getChildFolders(id);
  
  // 递归删除子文件夹
  for (const child of childFolders) {
    await deleteFolder(child.id);
  }
  
  // 标记当前文件夹为已删除
  await saveFolder({
    ...folder,
    isDeleted: true,
    updatedAt: Date.now(),
  });
}

/**
 * 获取文件夹深度
 */
export async function getFolderDepth(folderId: string): Promise<number> {
  let depth = 0;
  let currentId: string | null = folderId;
  
  while (currentId) {
    const folder = await getFolder(currentId);
    if (!folder) break;
    depth++;
    currentId = folder.parentId;
  }
  
  return depth;
}

/**
 * 构建文件夹树
 */
export interface FolderTreeNode extends LocalFolderRecord {
  children: FolderTreeNode[];
  depth: number;
}

export async function buildFolderTree(): Promise<FolderTreeNode[]> {
  const allFolders = await getAllFolders();
  
  const buildTree = (parentId: string | null, depth: number): FolderTreeNode[] => {
    return allFolders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map(folder => ({
        ...folder,
        depth,
        children: buildTree(folder.id, depth + 1),
      }));
  };
  
  return buildTree(null, 0);
}

/**
 * 移动文件夹
 */
export async function moveFolder(
  folderId: string,
  newParentId: string | null
): Promise<void> {
  const folder = await getFolder(folderId);
  if (!folder) return;
  
  // 检查深度限制
  const parentDepth = newParentId ? await getFolderDepth(newParentId) : 0;
  if (parentDepth >= 10) {
    throw new Error('Maximum folder depth exceeded');
  }
  
  // 检查是否移动到自己的子文件夹
  if (newParentId) {
    let checkId: string | null = newParentId;
    while (checkId) {
      if (checkId === folderId) {
        throw new Error('Cannot move folder into its own subfolder');
      }
      const checkFolder = await getFolder(checkId);
      checkId = checkFolder?.parentId || null;
    }
  }
  
  await saveFolder({
    ...folder,
    parentId: newParentId,
  });
}
