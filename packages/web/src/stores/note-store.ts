import { create } from 'zustand';
import { cryptoService, apiService } from '../services';
import type { EncryptedData, WrappedKey } from '../services/crypto-service';

export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  isPinned: boolean;
  isPasswordProtected: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  encryptedTitle?: EncryptedData;
  encryptedContent?: EncryptedData;
  encryptedDEK?: WrappedKey;
}

interface NoteState {
  notes: Note[];
  selectedNoteId: string | null;
  unlockedNoteIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setNotes: (notes: Note[]) => void;
  addNote: (note: Note) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  selectNote: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  createEncryptedNote: (title: string, content: string, folderId?: string | null, tags?: string[]) => Promise<Note>;
  updateEncryptedNote: (id: string, updates: { title?: string; content?: string; tags?: string[] }) => Promise<void>;
  loadNotes: () => Promise<void>;
  reloadNote: (id: string) => Promise<void>;
  setNotePassword: (noteId: string, password: string) => Promise<boolean>;
  removeNotePassword: (noteId: string, password: string) => Promise<boolean>;
  verifyNotePassword: (noteId: string, password: string) => Promise<boolean>;
  unlockNote: (noteId: string) => void;
  lockNote: (noteId: string) => void;
  isNoteUnlocked: (noteId: string) => boolean;
  getSelectedNote: () => Note | undefined;
  getFilteredNotes: () => Note[];
  getNotesByFolder: (folderId: string | null) => Note[];
}

const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

export const useNoteStore = create<NoteState>()((set, get) => ({
  notes: [],
  selectedNoteId: null,
  unlockedNoteIds: new Set(),
  isLoading: false,
  error: null,
  searchQuery: '',
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
  updateNote: (id, updates) => set((state) => ({
    notes: state.notes.map((note) => (note.id === id ? { ...note, ...updates, updatedAt: Date.now() } : note)),
  })),
  deleteNote: (id) => set((state) => ({
    notes: state.notes.filter((note) => note.id !== id),
    selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
  })),
  selectNote: (id) => set({ selectedNoteId: id }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  createEncryptedNote: async (title, content, folderId = null, tags = []) => {
    const kek = cryptoService.getKEK();
    if (!kek) throw new Error('Not authenticated');
    const dek = await cryptoService.generateDEK();
    const encryptedTitle = await cryptoService.encrypt(title || 'Untitled', dek);
    const encryptedContent = await cryptoService.encrypt(content || '', dek);
    const encryptedDEK = await cryptoService.wrapDEK(dek, kek);
    const now = Date.now();
    const result = await apiService.createNote({ encryptedTitle, encryptedContent, encryptedDEK, folderId, tags });
    const note: Note = {
      id: result.data?.id || crypto.randomUUID(),
      title, content, folderId, isPinned: false, isPasswordProtected: false, tags,
      createdAt: now, updatedAt: now, encryptedTitle, encryptedContent, encryptedDEK,
    };
    set((state) => ({ notes: [note, ...state.notes], selectedNoteId: note.id }));
    return note;
  },
  updateEncryptedNote: async (id, updates) => {
    const kek = cryptoService.getKEK();
    if (!kek) throw new Error('Not authenticated');
    const note = get().notes.find((n) => n.id === id);
    if (!note) throw new Error('Note not found');
    let dek: CryptoKey;
    if (note.encryptedDEK) {
      dek = await cryptoService.unwrapDEK(note.encryptedDEK, kek);
    } else {
      dek = await cryptoService.generateDEK();
    }
    const updateData: { encryptedTitle?: EncryptedData; encryptedContent?: EncryptedData; encryptedDEK?: WrappedKey; tags?: string[] } = {};
    if (updates.title !== undefined) updateData.encryptedTitle = await cryptoService.encrypt(updates.title || 'Untitled', dek);
    if (updates.content !== undefined) updateData.encryptedContent = await cryptoService.encrypt(updates.content || '', dek);
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (!note.encryptedDEK) updateData.encryptedDEK = await cryptoService.wrapDEK(dek, kek);
    await apiService.updateNote(id, updateData);
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...updates, ...updateData, updatedAt: Date.now() } : n)),
    }));
  },
  loadNotes: async () => {
    const kek = cryptoService.getKEK();
    if (!kek) return;
    set({ isLoading: true });
    try {
      const result = await apiService.getNotes();
      if (result.data && result.data.length > 0) {
        const decryptedNotes: Note[] = [];
        for (const encNote of result.data) {
          try {
            const fullNote = await apiService.getNote(encNote.id);
            if (!fullNote.data) continue;
            const dek = await cryptoService.unwrapDEK(fullNote.data.encryptedDEK, kek);
            const title = await cryptoService.decrypt(fullNote.data.encryptedTitle, dek);
            const content = await cryptoService.decrypt(fullNote.data.encryptedContent, dek);
            decryptedNotes.push({
              id: encNote.id, title, content, folderId: encNote.folderId, isPinned: encNote.isPinned,
              isPasswordProtected: encNote.hasPassword, tags: encNote.tags,
              createdAt: new Date(encNote.createdAt).getTime(), updatedAt: new Date(encNote.updatedAt).getTime(),
              encryptedTitle: fullNote.data.encryptedTitle, encryptedContent: fullNote.data.encryptedContent, encryptedDEK: fullNote.data.encryptedDEK,
            });
          } catch (error) {
            console.error('Failed to decrypt note:', encNote.id, error);
          }
        }
        set({ notes: decryptedNotes, isLoading: false });
      } else {
        set({ notes: [], isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
      set({ isLoading: false });
    }
  },
  reloadNote: async (id) => {
    const kek = cryptoService.getKEK();
    if (!kek) throw new Error('Not authenticated');
    const fullNote = await apiService.getNote(id);
    if (!fullNote.data) throw new Error('Note not found');
    const dek = await cryptoService.unwrapDEK(fullNote.data.encryptedDEK, kek);
    const title = await cryptoService.decrypt(fullNote.data.encryptedTitle, dek);
    const content = await cryptoService.decrypt(fullNote.data.encryptedContent, dek);
    set((state) => ({
      notes: state.notes.map((n) => n.id === id ? {
        ...n, title, content, folderId: fullNote.data!.folderId, isPinned: fullNote.data!.isPinned,
        isPasswordProtected: fullNote.data!.hasPassword, tags: fullNote.data!.tags,
        updatedAt: new Date(fullNote.data!.updatedAt).getTime(),
        encryptedTitle: fullNote.data!.encryptedTitle, encryptedContent: fullNote.data!.encryptedContent, encryptedDEK: fullNote.data!.encryptedDEK,
      } : n),
    }));
  },
  setNotePassword: async (noteId: string, password: string): Promise<boolean> => {
    const hash = await hashPassword(password);
    const result = await apiService.setNotePassword(noteId, hash);
    if (result.data?.success) {
      set((state) => ({
        notes: state.notes.map((note) => (note.id === noteId ? { ...note, isPasswordProtected: true } : note)),
      }));
      return true;
    }
    return false;
  },
  removeNotePassword: async (noteId: string, password: string): Promise<boolean> => {
    const hash = await hashPassword(password);
    const verifyResult = await apiService.verifyNotePassword(noteId, hash);
    if (!verifyResult.data?.valid) return false;
    const result = await apiService.removeNotePassword(noteId);
    if (result.data?.success) {
      set((state) => ({
        notes: state.notes.map((note) => (note.id === noteId ? { ...note, isPasswordProtected: false } : note)),
        unlockedNoteIds: (() => { const s = new Set(state.unlockedNoteIds); s.delete(noteId); return s; })(),
      }));
      return true;
    }
    return false;
  },
  verifyNotePassword: async (noteId: string, password: string): Promise<boolean> => {
    const hash = await hashPassword(password);
    const result = await apiService.verifyNotePassword(noteId, hash);
    if (result.data?.valid) {
      set((state) => ({ unlockedNoteIds: new Set([...state.unlockedNoteIds, noteId]) }));
      return true;
    }
    return false;
  },
  unlockNote: (noteId) => set((state) => ({ unlockedNoteIds: new Set([...state.unlockedNoteIds, noteId]) })),
  lockNote: (noteId) => set((state) => { const s = new Set(state.unlockedNoteIds); s.delete(noteId); return { unlockedNoteIds: s }; }),
  isNoteUnlocked: (noteId) => get().unlockedNoteIds.has(noteId),
  getSelectedNote: () => get().notes.find((note) => note.id === get().selectedNoteId),
  getFilteredNotes: () => {
    const { notes, searchQuery } = get();
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)));
  },
  getNotesByFolder: (folderId) => {
    const { notes, searchQuery } = get();
    let filtered = folderId !== null ? notes.filter((n) => n.folderId === folderId) : notes;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return filtered;
  },
}));