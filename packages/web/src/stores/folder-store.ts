import { create } from 'zustand';
import { cryptoService, apiService } from '../services';
import type { EncryptedData } from '../services/crypto-service';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  isPasswordProtected: boolean;
  createdAt: number;
  updatedAt: number;
  encryptedName?: EncryptedData;
}

export interface FolderNode extends Folder {
  children: FolderNode[];
  noteCount: number;
}

interface FolderState {
  folders: Folder[];
  selectedFolderId: string | null;
  expandedFolderIds: Set<string>;
  unlockedFolderIds: Set<string>;
  isLoading: boolean;
  error: string | null;

  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  selectFolder: (id: string | null) => void;
  toggleFolderExpanded: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  createEncryptedFolder: (name: string, parentId?: string | null) => Promise<Folder>;
  loadFolders: () => Promise<void>;

  setFolderPassword: (folderId: string, password: string) => Promise<boolean>;
  removeFolderPassword: (folderId: string, password: string) => Promise<boolean>;
  verifyFolderPassword: (folderId: string, password: string) => Promise<boolean>;
  unlockFolder: (folderId: string) => void;
  lockFolder: (folderId: string) => void;

  getFolderTree: () => FolderNode[];
}

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};


export const useFolderStore = create<FolderState>()((set, get) => ({
  folders: [],
  selectedFolderId: null,
  expandedFolderIds: new Set(),
  unlockedFolderIds: new Set(),
  isLoading: false,
  error: null,

  setFolders: (folders) => set({ folders }),
  addFolder: (folder) => set((state) => ({ folders: [...state.folders, folder] })),
  updateFolder: (id, updates) => set((state) => ({
    folders: state.folders.map((f) => f.id === id ? { ...f, ...updates, updatedAt: Date.now() } : f),
  })),
  deleteFolder: (id) => set((state) => ({
    folders: state.folders.filter((f) => f.id !== id),
    selectedFolderId: state.selectedFolderId === id ? null : state.selectedFolderId,
  })),
  selectFolder: (id) => set({ selectedFolderId: id }),
  toggleFolderExpanded: (id) => set((state) => {
    const newExpanded = new Set(state.expandedFolderIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    return { expandedFolderIds: newExpanded };
  }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  createEncryptedFolder: async (name, parentId = null) => {
    const kek = cryptoService.getKEK();
    if (!kek) throw new Error('Not authenticated');

    // Generate a DEK for folder name encryption
    const dek = await cryptoService.generateDEK();
    const encryptedName = await cryptoService.encrypt(name, dek);
    // Wrap the DEK with KEK for storage
    const encryptedDEK = await cryptoService.wrapDEK(dek, kek);
    const now = Date.now();

    // Store both encryptedName and encryptedDEK
    const result = await apiService.createFolder({ 
      encryptedName: { ...encryptedName, dek: encryptedDEK } as any, 
      parentId 
    });
    const folder: Folder = {
      id: result.data?.id || crypto.randomUUID(),
      name, parentId, order: get().folders.filter((f) => f.parentId === parentId).length,
      isPasswordProtected: false, createdAt: now, updatedAt: now, 
      encryptedName: { ...encryptedName, dek: encryptedDEK } as any,
    };

    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  loadFolders: async () => {
    const kek = cryptoService.getKEK();
    if (!kek) return;

    set({ isLoading: true });
    try {
      const result = await apiService.getFolders();
      if (result.data && result.data.length > 0) {
        const decryptedFolders: Folder[] = [];
        for (const encFolder of result.data) {
          try {
            let name = 'Folder';
            try {
              // Check if encryptedName has embedded DEK
              const encData = encFolder.encryptedName as any;
              if (encData.dek) {
                // Unwrap DEK and decrypt
                const dek = await cryptoService.unwrapDEK(encData.dek, kek);
                name = await cryptoService.decrypt(encData, dek);
              } else {
                // Fallback for old data without DEK
                name = `Folder ${encFolder.id.slice(0, 4)}`;
              }
            } catch {
              name = `Folder ${encFolder.id.slice(0, 4)}`;
            }
            decryptedFolders.push({
              id: encFolder.id, name, parentId: encFolder.parentId, order: encFolder.order,
              isPasswordProtected: encFolder.hasPassword,
              createdAt: new Date(encFolder.createdAt).getTime(), updatedAt: new Date(encFolder.updatedAt).getTime(),
              encryptedName: encFolder.encryptedName,
            });
          } catch (error) {
            console.error('Failed to process folder:', encFolder.id, error);
          }
        }
        set({ folders: decryptedFolders, isLoading: false });
      } else {
        set({ folders: [], isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
      set({ isLoading: false });
    }
  },


  // 密码保护 - 同步到服务器
  setFolderPassword: async (folderId, password) => {
    try {
      const hash = await hashPassword(password);
      const result = await apiService.setFolderPassword(folderId, hash);
      console.log('setFolderPassword result:', result);
      if (result.data?.success) {
        set((state) => ({
          folders: state.folders.map((f) => f.id === folderId ? { ...f, isPasswordProtected: true } : f),
        }));
        return true;
      }
      if (result.error) {
        console.error('setFolderPassword error:', result.error);
      }
      return false;
    } catch (error) {
      console.error('setFolderPassword exception:', error);
      return false;
    }
  },

  removeFolderPassword: async (folderId, password) => {
    const hash = await hashPassword(password);
    const verifyResult = await apiService.verifyFolderPassword(folderId, hash);
    if (!verifyResult.data?.valid) return false;
    const result = await apiService.removeFolderPassword(folderId);
    if (result.data?.success) {
      set((state) => ({
        folders: state.folders.map((f) => f.id === folderId ? { ...f, isPasswordProtected: false } : f),
        unlockedFolderIds: (() => { const s = new Set(state.unlockedFolderIds); s.delete(folderId); return s; })(),
      }));
      return true;
    }
    return false;
  },

  verifyFolderPassword: async (folderId, password) => {
    const hash = await hashPassword(password);
    const result = await apiService.verifyFolderPassword(folderId, hash);
    if (result.data?.valid) {
      set((state) => ({ unlockedFolderIds: new Set([...state.unlockedFolderIds, folderId]) }));
      return true;
    }
    return false;
  },

  unlockFolder: (folderId) => set((state) => ({ unlockedFolderIds: new Set([...state.unlockedFolderIds, folderId]) })),
  lockFolder: (folderId) => set((state) => { const s = new Set(state.unlockedFolderIds); s.delete(folderId); return { unlockedFolderIds: s }; }),

  getFolderTree: () => {
    const { folders } = get();
    const buildTree = (parentId: string | null): FolderNode[] => {
      return folders
        .filter((f) => f.parentId === parentId)
        .sort((a, b) => a.order - b.order)
        .map((folder) => ({ ...folder, children: buildTree(folder.id), noteCount: 0 }));
    };
    return buildTree(null);
  },
}));
