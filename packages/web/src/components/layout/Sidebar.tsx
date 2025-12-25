import { useState } from 'react';
import { useFolderStore, useAuthStore } from '../../stores';
import { useI18n } from '../../i18n';
import { apiService } from '../../services';
import { PasswordDialog } from '../password';
import { SyncIndicator } from '../sync/SyncIndicator';
import styles from './Sidebar.module.css';

interface SidebarProps {
  onOpenSettings?: () => void;
  onOpenAdmin?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ onOpenSettings, onOpenAdmin, isOpen = true, onClose }: SidebarProps) {
  const { t } = useI18n();
  const {
    getFolderTree,
    selectedFolderId,
    selectFolder,
    expandedFolderIds,
    toggleFolderExpanded,
    createEncryptedFolder,
    updateFolder,
    deleteFolder,
    setFolderPassword,
    removeFolderPassword,
    verifyFolderPassword,
    unlockedFolderIds,
  } = useFolderStore();
  const { logout } = useAuthStore();
  const folderTree = getFolderTree();
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [passwordDialogFolder, setPasswordDialogFolder] = useState<{ id: string; isProtected: boolean } | null>(null);
  const [unlockDialogFolder, setUnlockDialogFolder] = useState<string | null>(null);

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      try {
        console.log('Creating folder:', newFolderName.trim());
        await createEncryptedFolder(newFolderName.trim(), null);
        console.log('Folder created successfully');
        setNewFolderName('');
        setIsCreatingFolder(false);
      } catch (error) {
        console.error('Failed to create folder:', error);
        alert(error instanceof Error ? error.message : 'Failed to create folder');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setIsCreatingFolder(false);
      setNewFolderName('');
    }
  };

  const handleEditFolder = (folderId: string, currentName: string) => {
    setEditingFolderId(folderId);
    setEditingFolderName(currentName);
  };

  const handleSaveEdit = async () => {
    if (editingFolderId && editingFolderName.trim()) {
      try {
        updateFolder(editingFolderId, { name: editingFolderName.trim() });
        // 尝试同步到服务器
        await apiService.updateFolder(editingFolderId, {});
      } catch (error) {
        console.error('Failed to update folder:', error);
      }
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm(t('folders.deleteConfirm'))) return;
    try {
      deleteFolder(folderId);
      // 尝试同步到服务器
      await apiService.deleteFolder(folderId);
      // 如果删除的是当前选中的文件夹，切换到所有笔记
      if (selectedFolderId === folderId) {
        selectFolder(null);
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const handleLockClick = (folderId: string, isProtected: boolean) => {
    if (isProtected) {
      // 已加密，显示移除密码对话框
      setPasswordDialogFolder({ id: folderId, isProtected: true });
    } else {
      // 未加密，显示设置密码对话框
      setPasswordDialogFolder({ id: folderId, isProtected: false });
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!passwordDialogFolder) return false;

    if (passwordDialogFolder.isProtected) {
      // 验证密码后移除
      const success = await removeFolderPassword(passwordDialogFolder.id, password);
      return success;
    } else {
      // 设置新密码
      const success = await setFolderPassword(passwordDialogFolder.id, password);
      return success;
    }
  };

  const handleFolderSelect = (folderId: string, isProtected: boolean) => {
    if (isProtected && !unlockedFolderIds.has(folderId)) {
      // 需要解锁
      setUnlockDialogFolder(folderId);
    } else {
      selectFolder(folderId);
      onClose?.();
    }
  };

  const handleUnlockSubmit = async (password: string) => {
    if (!unlockDialogFolder) return false;
    const valid = await verifyFolderPassword(unlockDialogFolder, password);
    if (valid) {
      selectFolder(unlockDialogFolder);
      onClose?.();
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    if (confirm(t('common.logout') + '?')) {
      logout();
    }
  };

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <h1 className={styles.logo}>Secure Notebook</h1>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close sidebar">
          ✕
        </button>
      </div>

      <nav className={styles.nav}>
        <button
          className={`${styles.navItem} ${selectedFolderId === null ? styles.active : ''}`}
          onClick={() => {
            selectFolder(null);
            onClose?.();
          }}
        >
          <span className={styles.icon}>📝</span>
          {t('folders.allNotes')}
        </button>

        <div className={styles.folderSection}>
          <div className={styles.sectionHeader}>
            <span>{t('folders.title')}</span>
            <button
              className={styles.addButton}
              aria-label="Add folder"
              onClick={() => setIsCreatingFolder(true)}
            >
              +
            </button>
          </div>

          {isCreatingFolder && (
            <div className={styles.newFolderInput}>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('folders.folderName')}
                autoFocus
              />
              <button
                onClick={handleCreateFolder}
                className={styles.confirmButton}
                onMouseDown={(e) => e.preventDefault()}
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName('');
                }}
                className={styles.cancelButton}
                onMouseDown={(e) => e.preventDefault()}
              >
                ✕
              </button>
            </div>
          )}

          <div className={styles.folderList}>
            {folderTree.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                level={0}
                selectedId={selectedFolderId}
                expandedIds={expandedFolderIds}
                unlockedIds={unlockedFolderIds}
                onSelect={handleFolderSelect}
                onToggle={toggleFolderExpanded}
                editingId={editingFolderId}
                editingName={editingFolderName}
                onEdit={handleEditFolder}
                onEditChange={setEditingFolderName}
                onEditSave={handleSaveEdit}
                onEditKeyDown={handleEditKeyDown}
                onEditCancel={() => {
                  setEditingFolderId(null);
                  setEditingFolderName('');
                }}
                onDelete={handleDeleteFolder}
                onLock={handleLockClick}
              />
            ))}
          </div>
        </div>
      </nav>

      <div className={styles.footer}>
        <SyncIndicator />
        {onOpenAdmin && (
          <button className={styles.settingsButton} onClick={onOpenAdmin}>
            <span className={styles.icon}>👑</span>
            {t('admin.title')}
          </button>
        )}
        <button className={styles.settingsButton} onClick={onOpenSettings}>
          <span className={styles.icon}>⚙️</span>
          {t('common.settings')}
        </button>
        <button className={styles.logoutButton} onClick={handleLogout}>
          <span className={styles.icon}>🚪</span>
          {t('common.logout')}
        </button>
      </div>

      {/* 密码设置/移除对话框 */}
      <PasswordDialog
        isOpen={!!passwordDialogFolder}
        onClose={() => setPasswordDialogFolder(null)}
        mode={passwordDialogFolder?.isProtected ? 'remove' : 'set'}
        onSubmit={handlePasswordSubmit}
      />

      {/* 解锁对话框 */}
      <PasswordDialog
        isOpen={!!unlockDialogFolder}
        onClose={() => setUnlockDialogFolder(null)}
        mode="verify"
        title={t('folders.unlockFolder')}
        onSubmit={handleUnlockSubmit}
      />
    </aside>
  );
}

interface FolderItemProps {
  folder: ReturnType<typeof useFolderStore.getState>['getFolderTree'] extends () => (infer T)[] ? T : never;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  unlockedIds: Set<string>;
  onSelect: (id: string, isProtected: boolean) => void;
  onToggle: (id: string) => void;
  editingId: string | null;
  editingName: string;
  onEdit: (id: string, name: string) => void;
  onEditChange: (name: string) => void;
  onEditSave: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditCancel: () => void;
  onDelete: (id: string) => void;
  onLock: (id: string, isProtected: boolean) => void;
}

function FolderItem({
  folder,
  level,
  selectedId,
  expandedIds,
  unlockedIds,
  onSelect,
  onToggle,
  editingId,
  editingName,
  onEdit,
  onEditChange,
  onEditSave,
  onEditKeyDown,
  onEditCancel,
  onDelete,
  onLock,
}: FolderItemProps) {
  const { t } = useI18n();
  const isExpanded = expandedIds.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const isEditing = editingId === folder.id;
  const isProtected = folder.isPasswordProtected;
  const isUnlocked = unlockedIds.has(folder.id);

  return (
    <div className={styles.folderItem}>
      <div
        className={`${styles.folderButton} ${selectedId === folder.id ? styles.active : ''}`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {hasChildren && (
          <span
            className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(folder.id);
            }}
          >
            ▶
          </span>
        )}
        <span className={styles.folderIcon} onClick={() => onSelect(folder.id, isProtected)}>
          {isProtected ? (isUnlocked ? '🔓' : '🔒') : '📁'}
        </span>
        {isEditing ? (
          <input
            type="text"
            className={styles.editInput}
            value={editingName}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={onEditKeyDown}
            onBlur={onEditCancel}
            autoFocus
          />
        ) : (
          <span className={styles.folderName} onClick={() => onSelect(folder.id, isProtected)}>
            {folder.name}
          </span>
        )}
        {folder.noteCount > 0 && !isEditing && <span className={styles.noteCount}>{folder.noteCount}</span>}
        {!isEditing && (
          <div className={styles.folderActions}>
            <button
              className={styles.folderActionButton}
              onClick={(e) => {
                e.stopPropagation();
                onLock(folder.id, isProtected);
              }}
              title={isProtected ? t('folders.removePassword') : t('folders.setPassword')}
            >
              {isProtected ? '🔓' : '🔐'}
            </button>
            <button
              className={styles.folderActionButton}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(folder.id, folder.name);
              }}
              title={t('common.edit')}
            >
              ✏️
            </button>
            <button
              className={styles.folderActionButton}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(folder.id);
              }}
              title={t('common.delete')}
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className={styles.children}>
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              unlockedIds={unlockedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              editingId={editingId}
              editingName={editingName}
              onEdit={onEdit}
              onEditChange={onEditChange}
              onEditSave={onEditSave}
              onEditKeyDown={onEditKeyDown}
              onEditCancel={onEditCancel}
              onDelete={onDelete}
              onLock={onLock}
            />
          ))}
        </div>
      )}
    </div>
  );
}
