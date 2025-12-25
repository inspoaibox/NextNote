import { useState, useEffect, useCallback } from 'react';
import { useFolderStore, useAuthStore } from '../../stores';
import { useI18n } from '../../i18n';
import { apiService } from '../../services';
import { PasswordDialog } from '../password';
import { SyncIndicator } from '../sync/SyncIndicator';
import styles from './Sidebar.module.css';

// 右键菜单状态
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  folderId: string;
  folderName: string;
  isProtected: boolean;
  level: number;
}

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
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [passwordDialogFolder, setPasswordDialogFolder] = useState<{ id: string; isProtected: boolean } | null>(null);
  const [unlockDialogFolder, setUnlockDialogFolder] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 关闭右键菜单
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 点击其他地方关闭菜单
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  // 处理右键菜单
  const handleContextMenu = (
    e: React.MouseEvent,
    folderId: string,
    folderName: string,
    isProtected: boolean,
    level: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      folderId,
      folderName,
      isProtected,
      level,
    });
  };

  const isCreatingFolder = creatingFolderParentId !== undefined;

  const handleStartCreateFolder = (parentId: string | null = null) => {
    setCreatingFolderParentId(parentId);
    setNewFolderName('');
    // 如果是创建子文件夹，自动展开父文件夹
    if (parentId) {
      const { expandedFolderIds, toggleFolderExpanded } = useFolderStore.getState();
      if (!expandedFolderIds.has(parentId)) {
        toggleFolderExpanded(parentId);
      }
    }
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      try {
        console.log('Creating folder:', newFolderName.trim(), 'parent:', creatingFolderParentId);
        await createEncryptedFolder(newFolderName.trim(), creatingFolderParentId ?? null);
        console.log('Folder created successfully');
        setNewFolderName('');
        setCreatingFolderParentId(undefined);
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
      setCreatingFolderParentId(undefined);
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
      await apiService.deleteFolder(folderId);
      if (selectedFolderId === folderId) {
        selectFolder(null);
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const handleLockClick = (folderId: string, isProtected: boolean) => {
    if (isProtected) {
      setPasswordDialogFolder({ id: folderId, isProtected: true });
    } else {
      setPasswordDialogFolder({ id: folderId, isProtected: false });
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!passwordDialogFolder) return false;

    if (passwordDialogFolder.isProtected) {
      const success = await removeFolderPassword(passwordDialogFolder.id, password);
      return success;
    } else {
      const success = await setFolderPassword(passwordDialogFolder.id, password);
      return success;
    }
  };

  const handleFolderSelect = (folderId: string, isProtected: boolean) => {
    if (isProtected && !unlockedFolderIds.has(folderId)) {
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

  // 渲染新建文件夹输入框
  const renderNewFolderInput = (parentId: string | null, level: number = 0) => {
    if (creatingFolderParentId !== parentId) return null;
    
    return (
      <div className={styles.newFolderInput} style={{ marginLeft: `${level * 16}px` }}>
        <span className={styles.newFolderIcon}>📁</span>
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
            setCreatingFolderParentId(undefined);
            setNewFolderName('');
          }}
          className={styles.cancelButton}
          onMouseDown={(e) => e.preventDefault()}
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoIcon}>🔐</div>
          <h1 className={styles.logo}>Secure Notebook</h1>
        </div>
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
            <span className={styles.sectionTitle}>{t('folders.title')}</span>
            <button
              className={styles.addButton}
              aria-label="Add folder"
              onClick={() => handleStartCreateFolder(null)}
            >
              +
            </button>
          </div>

          {renderNewFolderInput(null, 0)}

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
                onEditChange={setEditingFolderName}
                onEditKeyDown={handleEditKeyDown}
                onEditCancel={() => {
                  setEditingFolderId(null);
                  setEditingFolderName('');
                }}
                onContextMenu={handleContextMenu}
                creatingFolderParentId={creatingFolderParentId}
                newFolderName={newFolderName}
                onNewFolderNameChange={setNewFolderName}
                onNewFolderKeyDown={handleKeyDown}
                onNewFolderConfirm={handleCreateFolder}
                onNewFolderCancel={() => {
                  setCreatingFolderParentId(undefined);
                  setNewFolderName('');
                }}
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

      <PasswordDialog
        isOpen={!!passwordDialogFolder}
        onClose={() => setPasswordDialogFolder(null)}
        mode={passwordDialogFolder?.isProtected ? 'remove' : 'set'}
        onSubmit={handlePasswordSubmit}
      />

      <PasswordDialog
        isOpen={!!unlockDialogFolder}
        onClose={() => setUnlockDialogFolder(null)}
        mode="verify"
        title={t('folders.unlockFolder')}
        onSubmit={handleUnlockSubmit}
      />

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.level < 2 && (
            <button
              className={styles.contextMenuItem}
              onClick={() => {
                handleStartCreateFolder(contextMenu.folderId);
                closeContextMenu();
              }}
            >
              <span>➕</span>
              {t('folders.addSubfolder')}
            </button>
          )}
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              handleLockClick(contextMenu.folderId, contextMenu.isProtected);
              closeContextMenu();
            }}
          >
            <span>{contextMenu.isProtected ? '🔓' : '🔐'}</span>
            {contextMenu.isProtected ? t('folders.removePassword') : t('folders.setPassword')}
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              handleEditFolder(contextMenu.folderId, contextMenu.folderName);
              closeContextMenu();
            }}
          >
            <span>✏️</span>
            {t('common.edit')}
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.danger}`}
            onClick={() => {
              handleDeleteFolder(contextMenu.folderId);
              closeContextMenu();
            }}
          >
            <span>🗑️</span>
            {t('common.delete')}
          </button>
        </div>
      )}
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
  onEditChange: (name: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onEditCancel: () => void;
  onContextMenu: (e: React.MouseEvent, folderId: string, folderName: string, isProtected: boolean, level: number) => void;
  creatingFolderParentId: string | null | undefined;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onNewFolderKeyDown: (e: React.KeyboardEvent) => void;
  onNewFolderConfirm: () => void;
  onNewFolderCancel: () => void;
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
  onEditChange,
  onEditKeyDown,
  onEditCancel,
  onContextMenu,
  creatingFolderParentId,
  newFolderName,
  onNewFolderNameChange,
  onNewFolderKeyDown,
  onNewFolderConfirm,
  onNewFolderCancel,
}: FolderItemProps) {
  const isExpanded = expandedIds.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const isEditing = editingId === folder.id;
  const isProtected = folder.isPasswordProtected;
  const isUnlocked = unlockedIds.has(folder.id);
  const isCreatingSubfolder = creatingFolderParentId === folder.id;

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(folder.id);
  };

  const handleRightClick = (e: React.MouseEvent) => {
    onContextMenu(e, folder.id, folder.name, isProtected, level);
  };

  return (
    <div className={styles.folderItem}>
      <div
        className={`${styles.folderButton} ${selectedId === folder.id ? styles.active : ''}`}
        onContextMenu={handleRightClick}
        onClick={() => !isEditing && onSelect(folder.id, isProtected)}
      >
        {/* 展开/折叠图标 */}
        <span
          className={`${styles.expandIcon} ${hasChildren || isCreatingSubfolder ? '' : styles.placeholder} ${isExpanded ? styles.expanded : ''}`}
          onClick={hasChildren || isCreatingSubfolder ? handleToggleClick : undefined}
        >
          {(hasChildren || isCreatingSubfolder) ? '▶' : ''}
        </span>
        <span className={styles.folderIcon}>
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
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className={styles.folderName}>{folder.name}</span>
        )}
        {folder.noteCount > 0 && !isEditing && <span className={styles.noteCount}>{folder.noteCount}</span>}
      </div>

      {/* 子文件夹 */}
      {(hasChildren || isCreatingSubfolder) && isExpanded && (
        <div className={styles.children}>
          {isCreatingSubfolder && (
            <div className={styles.newFolderInput}>
              <span className={styles.newFolderIcon}>📁</span>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => onNewFolderNameChange(e.target.value)}
                onKeyDown={onNewFolderKeyDown}
                placeholder="文件夹名称"
                autoFocus
              />
              <button onClick={onNewFolderConfirm} className={styles.confirmButton} onMouseDown={(e) => e.preventDefault()}>✓</button>
              <button onClick={onNewFolderCancel} className={styles.cancelButton} onMouseDown={(e) => e.preventDefault()}>✕</button>
            </div>
          )}
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
              onEditChange={onEditChange}
              onEditKeyDown={onEditKeyDown}
              onEditCancel={onEditCancel}
              onContextMenu={onContextMenu}
              creatingFolderParentId={creatingFolderParentId}
              newFolderName={newFolderName}
              onNewFolderNameChange={onNewFolderNameChange}
              onNewFolderKeyDown={onNewFolderKeyDown}
              onNewFolderConfirm={onNewFolderConfirm}
              onNewFolderCancel={onNewFolderCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
