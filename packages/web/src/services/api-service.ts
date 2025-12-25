/**
 * API 服务
 * 处理与后端的通信，支持离线模式
 */

import type { EncryptedData, WrappedKey } from './crypto-service';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/** 存储的认证信息 */
interface AuthData {
  token: string;
  userId: string;
  deviceId: string;
}

class ApiService {
  private authData: AuthData | null = null;
  private isOffline = false;

  constructor() {
    // 从 localStorage 恢复认证信息
    const stored = localStorage.getItem('auth-data');
    if (stored) {
      try {
        this.authData = JSON.parse(stored);
      } catch {
        localStorage.removeItem('auth-data');
      }
    }

    // 监听网络状态
    window.addEventListener('online', () => {
      this.isOffline = false;
    });
    window.addEventListener('offline', () => {
      this.isOffline = true;
    });
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.authData?.token) {
      headers['Authorization'] = `Bearer ${this.authData.token}`;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    if (this.isOffline) {
      return { error: 'Network offline' };
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { error: errorData.message || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      console.error('API request failed:', error);
      return { error: 'Network error' };
    }
  }

  /** 设置认证数据 */
  setAuth(data: AuthData) {
    this.authData = data;
    localStorage.setItem('auth-data', JSON.stringify(data));
  }

  /** 清除认证数据 */
  clearAuth() {
    this.authData = null;
    localStorage.removeItem('auth-data');
  }

  /** 获取当前用户 ID */
  getUserId(): string | null {
    return this.authData?.userId || null;
  }

  /** 检查是否已认证 */
  isAuthenticated(): boolean {
    return !!this.authData?.token;
  }

  // ============ 认证 API ============

  async register(data: {
    email: string;
    encryptedKEK: EncryptedData;
    salt: string;
    recoveryKeyHash: string;
    deviceName?: string;
  }): Promise<ApiResponse<{ userId: string; deviceId: string; token: string }>> {
    const result = await this.request<{ userId: string; deviceId: string; token: string }>(
      'POST',
      '/auth/register',
      data
    );
    if (result.data) {
      this.setAuth(result.data);
    }
    return result;
  }

  async login(data: {
    email: string;
    deviceName?: string;
  }): Promise<ApiResponse<{
    userId: string;
    deviceId: string;
    token: string;
    encryptedKEK: EncryptedData;
    salt: string;
  }>> {
    const result = await this.request<{
      userId: string;
      deviceId: string;
      token: string;
      encryptedKEK: EncryptedData;
      salt: string;
    }>('POST', '/auth/login', data);
    if (result.data) {
      this.setAuth({
        token: result.data.token,
        userId: result.data.userId,
        deviceId: result.data.deviceId,
      });
    }
    return result;
  }

  async changePassword(data: {
    newEncryptedKEK: EncryptedData;
    newSalt: string;
  }): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('POST', '/auth/change-password', data);
  }

  async revokeAllSessions(): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('POST', '/auth/revoke-all');
  }

  // ============ 笔记 API ============

  async getNotes(folderId?: string | null): Promise<ApiResponse<Array<{
    id: string;
    encryptedTitle: EncryptedData;
    folderId: string | null;
    isPinned: boolean;
    hasPassword: boolean;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>>> {
    const query = folderId !== undefined ? `?folderId=${folderId || 'null'}` : '';
    return this.request('GET', `/notes${query}`);
  }

  async getNote(id: string): Promise<ApiResponse<{
    id: string;
    encryptedTitle: EncryptedData;
    encryptedContent: EncryptedData;
    encryptedDEK: WrappedKey;
    folderId: string | null;
    isPinned: boolean;
    hasPassword: boolean;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>> {
    return this.request('GET', `/notes/${id}`);
  }

  async createNote(data: {
    encryptedTitle: EncryptedData;
    encryptedContent: EncryptedData;
    encryptedDEK: WrappedKey;
    folderId?: string | null;
    tags?: string[];
  }): Promise<ApiResponse<{ id: string; syncVersion: number; createdAt: string }>> {
    return this.request('POST', '/notes', data);
  }

  async updateNote(id: string, data: {
    encryptedTitle?: EncryptedData;
    encryptedContent?: EncryptedData;
    encryptedDEK?: WrappedKey;
    folderId?: string | null;
    tags?: string[];
  }): Promise<ApiResponse<{ id: string; syncVersion: number; updatedAt: string }>> {
    return this.request('PUT', `/notes/${id}`, data);
  }

  async deleteNote(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('DELETE', `/notes/${id}`);
  }

  async pinNote(id: string, isPinned: boolean): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('POST', `/notes/${id}/pin`, { isPinned });
  }

  async getNoteVersions(id: string): Promise<ApiResponse<Array<{
    id: string;
    size: number;
    createdAt: string;
  }>>> {
    return this.request('GET', `/notes/${id}/versions`);
  }

  async restoreNoteVersion(noteId: string, versionId: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('POST', `/notes/${noteId}/versions/${versionId}/restore`);
  }

  // ============ 文件夹 API ============

  async getFolders(): Promise<ApiResponse<Array<{
    id: string;
    encryptedName: EncryptedData;
    parentId: string | null;
    order: number;
    hasPassword: boolean;
    createdAt: string;
    updatedAt: string;
  }>>> {
    return this.request('GET', '/folders');
  }

  async createFolder(data: {
    encryptedName: EncryptedData;
    parentId?: string | null;
  }): Promise<ApiResponse<{ id: string; syncVersion: number; createdAt: string }>> {
    return this.request('POST', '/folders', data);
  }

  async updateFolder(id: string, data: {
    encryptedName?: EncryptedData;
    parentId?: string | null;
    order?: number;
  }): Promise<ApiResponse<{ id: string; syncVersion: number; updatedAt: string }>> {
    return this.request('PUT', `/folders/${id}`, data);
  }

  async deleteFolder(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('DELETE', `/folders/${id}`);
  }

  async setFolderPassword(id: string, passwordHash: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('POST', `/folders/${id}/password`, { passwordHash });
  }

  async removeFolderPassword(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('DELETE', `/folders/${id}/password`);
  }

  async verifyFolderPassword(id: string, passwordHash: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.request('POST', `/folders/${id}/password/verify`, { passwordHash });
  }

  // ============ 笔记密码 API ============

  async setNotePassword(id: string, passwordHash: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('POST', `/notes/${id}/password`, { passwordHash });
  }

  async removeNotePassword(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('DELETE', `/notes/${id}/password`);
  }

  async verifyNotePassword(id: string, passwordHash: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.request('POST', `/notes/${id}/password/verify`, { passwordHash });
  }

  // ============ 审计日志 API ============

  async getAuditLogs(limit = 100): Promise<ApiResponse<Array<{
    id: string;
    action: string;
    deviceId: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>>> {
    return this.request('GET', `/audit/logs?limit=${limit}`);
  }

  // ============ 分享 API ============

  async shareNote(noteId: string, data: {
    recipientEmail: string;
    permission: 'view' | 'edit';
    encryptedShareKey: string;
  }): Promise<ApiResponse<{ shareId: string; createdAt: string }>> {
    return this.request('POST', `/notes/${noteId}/shares`, data);
  }

  async getNoteShares(noteId: string): Promise<ApiResponse<Array<{
    id: string;
    recipientEmail: string;
    permission: 'view' | 'edit';
    createdAt: string;
  }>>> {
    return this.request('GET', `/notes/${noteId}/shares`);
  }

  async revokeShare(noteId: string, shareId: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('DELETE', `/notes/${noteId}/shares/${shareId}`);
  }

  // ============ 版本历史 API ============

  async getNoteVersionContent(noteId: string, versionId: string): Promise<ApiResponse<{
    id: string;
    encryptedContent: EncryptedData;
    encryptedDEK: WrappedKey;
    size: number;
    createdAt: string;
  }>> {
    return this.request('GET', `/notes/${noteId}/versions/${versionId}`);
  }

  // ============ 系统信息 API ============

  async getSystemInfo(): Promise<ApiResponse<{
    siteName: string;
    siteDescription: string;
    allowRegistration: boolean;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
    isFirstUser: boolean;
  }>> {
    return this.request('GET', '/auth/system-info');
  }

  // ============ 管理员 API ============

  async getAdminSettings(): Promise<ApiResponse<{
    id: string;
    siteName: string;
    siteDescription: string;
    allowRegistration: boolean;
    maxUsersLimit: number;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
  }>> {
    return this.request('GET', '/admin/settings');
  }

  async updateAdminSettings(data: {
    siteName?: string;
    siteDescription?: string;
    allowRegistration?: boolean;
    maxUsersLimit?: number;
    maintenanceMode?: boolean;
    maintenanceMessage?: string | null;
  }): Promise<ApiResponse<{
    id: string;
    siteName: string;
    siteDescription: string;
    allowRegistration: boolean;
    maxUsersLimit: number;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
  }>> {
    return this.request('PUT', '/admin/settings', data);
  }

  async getAdminUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<ApiResponse<{
    users: Array<{
      id: string;
      email: string;
      role: string;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
      noteCount: number;
      folderCount: number;
      deviceCount: number;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.search) query.set('search', params.search);
    return this.request('GET', `/admin/users?${query.toString()}`);
  }

  async updateAdminUser(id: string, data: {
    role?: string;
    isActive?: boolean;
  }): Promise<ApiResponse<{
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  }>> {
    return this.request('PUT', `/admin/users/${id}`, data);
  }

  async deleteAdminUser(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('DELETE', `/admin/users/${id}`);
  }

  async getAdminStats(): Promise<ApiResponse<{
    userCount: number;
    activeUsers: number;
    noteCount: number;
    folderCount: number;
    recentUsers: number;
  }>> {
    return this.request('GET', '/admin/stats');
  }

  // ============ 同步 API ============

  async getSyncChanges(since: number): Promise<ApiResponse<{
    notes: Array<{
      id: string;
      encryptedTitle: EncryptedData;
      encryptedContent: EncryptedData;
      encryptedDEK: WrappedKey;
      folderId: string | null;
      isPinned: boolean;
      hasPassword: boolean;
      tags: string[];
      syncVersion: number;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
    }>;
    folders: Array<{
      id: string;
      encryptedName: EncryptedData;
      parentId: string | null;
      order: number;
      hasPassword: boolean;
      syncVersion: number;
      createdAt: string;
      updatedAt: string;
      isDeleted: boolean;
    }>;
    serverTime: number;
  }>> {
    return this.request('GET', `/sync/changes?since=${since}`);
  }

  async getSyncSnapshot(): Promise<ApiResponse<{
    notes: Array<{
      id: string;
      encryptedTitle: EncryptedData;
      encryptedContent: EncryptedData;
      encryptedDEK: WrappedKey;
      folderId: string | null;
      isPinned: boolean;
      hasPassword: boolean;
      tags: string[];
      syncVersion: number;
      createdAt: string;
      updatedAt: string;
    }>;
    folders: Array<{
      id: string;
      encryptedName: EncryptedData;
      parentId: string | null;
      order: number;
      hasPassword: boolean;
      syncVersion: number;
      createdAt: string;
      updatedAt: string;
    }>;
    serverTime: number;
  }>> {
    return this.request('GET', '/sync/snapshot');
  }

  async syncHeartbeat(): Promise<ApiResponse<{ success: boolean; serverTime: number }>> {
    return this.request('POST', '/sync/heartbeat');
  }
}

export const apiService = new ApiService();
