import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type EditorMode = 'edit' | 'preview' | 'split';

interface SettingsState {
  editorFontSize: number;
  editorMode: EditorMode;
  setEditorFontSize: (size: number) => void;
  setEditorMode: (mode: EditorMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      editorFontSize: 16,
      editorMode: 'edit',
      
      setEditorFontSize: (editorFontSize) => {
        set({ editorFontSize });
        document.documentElement.style.setProperty('--editor-font-size', `${editorFontSize}px`);
      },
      
      setEditorMode: (editorMode) => {
        set({ editorMode });
      },
    }),
    {
      name: 'settings-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.style.setProperty('--editor-font-size', `${state.editorFontSize}px`);
        }
      },
    }
  )
);
