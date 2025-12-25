/**
 * 桌面版本地文件存储服务
 * 使用 Electron 的 fs 模块将数据存储在本地文件系统
 */

import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 数据存储目录
const getDataPath = () => path.join(app.getPath('userData'), 'data');
const getNotesPath = () => path.join(getDataPath(), 'notes');
const getFoldersPath = () => path.join(getDataPath(), 'folders');
const getKeysPath = () => path.join(getDataPath(), 'keys');
const getImagesPath = () => path.join(getDataPath(), 'images');
const getConfigPath = () => path.join(getDataPath(), 'config.json');

// 确保目录存在
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 初始化存储目录
export function initStorage(): void {
  ensureDir(getDataPath());
  ensureDir(getNotesPath());
  ensureDir(getFoldersPath());
  ensureDir(getKeysPath());
  ensureDir(getImagesPath());
}

// 读取 JSON 文件
function readJsonFile<T>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading file:', filePath, error);
  }
  return null;
}

// 写入 JSON 文件
function writeJsonFile(filePath: string, data: unknown): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing file:', filePath, error);
    throw error;
  }
}

// 删除文件
function deleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting file:', filePath, error);
  }
}

// 列出目录中的所有 JSON 文件
function listJsonFiles(dirPath: string): string[] {
  try {
    if (fs.existsSync(dirPath)) {
      return fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    }
  } catch (error) {
    console.error('Error listing directory:', dirPath, error);
  }
  return [];
}

// 注册 IPC 处理器
export function registerStorageHandlers(): void {
  initStorage();

  // === 笔记操作 ===
  ipcMain.handle('storage:note:get', (_event, id: string) => {
    return readJsonFile(path.join(getNotesPath(), `${id}.json`));
  });

  ipcMain.handle('storage:note:getAll', () => {
    const files = listJsonFiles(getNotesPath());
    return files.map(f => readJsonFile(path.join(getNotesPath(), f))).filter(Boolean);
  });

  ipcMain.handle('storage:note:save', (_event, note: unknown) => {
    const noteData = note as { id: string };
    writeJsonFile(path.join(getNotesPath(), `${noteData.id}.json`), note);
    return true;
  });

  ipcMain.handle('storage:note:delete', (_event, id: string) => {
    deleteFile(path.join(getNotesPath(), `${id}.json`));
    return true;
  });

  // === 文件夹操作 ===
  ipcMain.handle('storage:folder:get', (_event, id: string) => {
    return readJsonFile(path.join(getFoldersPath(), `${id}.json`));
  });

  ipcMain.handle('storage:folder:getAll', () => {
    const files = listJsonFiles(getFoldersPath());
    return files.map(f => readJsonFile(path.join(getFoldersPath(), f))).filter(Boolean);
  });

  ipcMain.handle('storage:folder:save', (_event, folder: unknown) => {
    const folderData = folder as { id: string };
    writeJsonFile(path.join(getFoldersPath(), `${folderData.id}.json`), folder);
    return true;
  });

  ipcMain.handle('storage:folder:delete', (_event, id: string) => {
    deleteFile(path.join(getFoldersPath(), `${id}.json`));
    return true;
  });

  // === 密钥存储 ===
  ipcMain.handle('storage:key:get', (_event, key: string) => {
    return readJsonFile(path.join(getKeysPath(), `${key}.json`));
  });

  ipcMain.handle('storage:key:save', (_event, key: string, value: unknown) => {
    writeJsonFile(path.join(getKeysPath(), `${key}.json`), { key, value, updatedAt: Date.now() });
    return true;
  });

  ipcMain.handle('storage:key:delete', (_event, key: string) => {
    deleteFile(path.join(getKeysPath(), `${key}.json`));
    return true;
  });

  // === 图片存储 ===
  ipcMain.handle('storage:image:get', (_event, id: string) => {
    const filePath = path.join(getImagesPath(), id);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    return null;
  });

  ipcMain.handle('storage:image:save', (_event, id: string, data: Buffer, mimeType: string) => {
    fs.writeFileSync(path.join(getImagesPath(), id), data);
    // 保存元数据
    writeJsonFile(path.join(getImagesPath(), `${id}.meta.json`), {
      id,
      mimeType,
      size: data.length,
      createdAt: Date.now(),
    });
    return true;
  });

  ipcMain.handle('storage:image:delete', (_event, id: string) => {
    deleteFile(path.join(getImagesPath(), id));
    deleteFile(path.join(getImagesPath(), `${id}.meta.json`));
    return true;
  });

  // === 配置 ===
  ipcMain.handle('storage:config:get', () => {
    return readJsonFile(getConfigPath()) || {};
  });

  ipcMain.handle('storage:config:save', (_event, config: unknown) => {
    writeJsonFile(getConfigPath(), config);
    return true;
  });

  // === 导出/导入 ===
  ipcMain.handle('storage:export', () => {
    const notes = listJsonFiles(getNotesPath()).map(f => 
      readJsonFile(path.join(getNotesPath(), f))
    ).filter(Boolean);
    
    const folders = listJsonFiles(getFoldersPath()).map(f => 
      readJsonFile(path.join(getFoldersPath(), f))
    ).filter(Boolean);
    
    const config = readJsonFile(getConfigPath());
    
    return {
      version: 1,
      exportedAt: Date.now(),
      notes,
      folders,
      config,
    };
  });

  ipcMain.handle('storage:import', (_event, data: { notes?: unknown[]; folders?: unknown[]; config?: unknown }) => {
    if (data.notes) {
      for (const note of data.notes) {
        const noteData = note as { id: string };
        writeJsonFile(path.join(getNotesPath(), `${noteData.id}.json`), note);
      }
    }
    if (data.folders) {
      for (const folder of data.folders) {
        const folderData = folder as { id: string };
        writeJsonFile(path.join(getFoldersPath(), `${folderData.id}.json`), folder);
      }
    }
    if (data.config) {
      writeJsonFile(getConfigPath(), data.config);
    }
    return true;
  });

  // === 数据路径 ===
  ipcMain.handle('storage:getDataPath', () => {
    return getDataPath();
  });
}
