# API 文档

Secure Notebook REST API 参考文档。

## 基础信息

- **Base URL**: `http://localhost:4000/api`
- **认证方式**: Bearer Token (JWT)
- **内容类型**: `application/json`

---

## 认证 API

### 注册

```http
POST /api/auth/register
```

**请求体:**
```json
{
  "email": "user@example.com",
  "encryptedKEK": "base64-encoded-encrypted-kek",
  "salt": "base64-encoded-salt",
  "recoveryKeyHash": "hashed-recovery-key"
}
```

**响应:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "token": "jwt-token"
}
```

### 登录

```http
POST /api/auth/login
```

**请求体:**
```json
{
  "email": "user@example.com"
}
```

**响应:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "encryptedKEK": "base64-encoded-encrypted-kek",
    "salt": "base64-encoded-salt"
  },
  "token": "jwt-token"
}
```

### 验证令牌

```http
GET /api/auth/verify
Authorization: Bearer <token>
```

**响应:**
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

### 登出

```http
POST /api/auth/logout
Authorization: Bearer <token>
```

---

## 笔记 API

### 获取笔记列表

```http
GET /api/notes
Authorization: Bearer <token>
```

**查询参数:**
- `folderId` (可选): 筛选特定文件夹
- `isPinned` (可选): 筛选置顶笔记
- `limit` (可选): 返回数量限制
- `offset` (可选): 分页偏移

**响应:**
```json
{
  "notes": [
    {
      "id": "uuid",
      "encryptedTitle": "...",
      "encryptedContent": "...",
      "encryptedDEK": "...",
      "folderId": "uuid | null",
      "isPinned": false,
      "hasPassword": false,
      "syncVersion": 1,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 100
}
```

### 创建笔记

```http
POST /api/notes
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "encryptedTitle": "base64-encoded",
  "encryptedContent": "base64-encoded",
  "encryptedDEK": "base64-encoded",
  "folderId": "uuid | null"
}
```

**响应:**
```json
{
  "success": true,
  "note": {
    "id": "uuid",
    "syncVersion": 1,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### 更新笔记

```http
PUT /api/notes/:id
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "encryptedTitle": "base64-encoded",
  "encryptedContent": "base64-encoded",
  "expectedVersion": 1
}
```

**响应:**
```json
{
  "success": true,
  "note": {
    "id": "uuid",
    "syncVersion": 2,
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### 删除笔记

```http
DELETE /api/notes/:id
Authorization: Bearer <token>
```

**响应:**
```json
{
  "success": true
}
```

### 置顶/取消置顶

```http
POST /api/notes/:id/pin
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "isPinned": true
}
```

---

## 文件夹 API

### 获取文件夹树

```http
GET /api/folders
Authorization: Bearer <token>
```

**响应:**
```json
{
  "folders": [
    {
      "id": "uuid",
      "encryptedName": "...",
      "parentId": null,
      "order": 0,
      "hasPassword": false,
      "noteCount": 5,
      "children": []
    }
  ]
}
```

### 创建文件夹

```http
POST /api/folders
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "encryptedName": "base64-encoded",
  "parentId": "uuid | null"
}
```

### 更新文件夹

```http
PUT /api/folders/:id
Authorization: Bearer <token>
```

### 删除文件夹

```http
DELETE /api/folders/:id
Authorization: Bearer <token>
```

---

## 版本历史 API

### 获取版本列表

```http
GET /api/notes/:id/versions
Authorization: Bearer <token>
```

**响应:**
```json
{
  "versions": [
    {
      "id": "uuid",
      "size": 1024,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 获取特定版本

```http
GET /api/notes/:id/versions/:versionId
Authorization: Bearer <token>
```

### 恢复版本

```http
POST /api/notes/:id/versions/:versionId/restore
Authorization: Bearer <token>
```

---

## 分享 API

### 创建分享

```http
POST /api/notes/:id/share
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "recipientEmail": "recipient@example.com",
  "permission": "view | edit",
  "encryptedShareKey": "base64-encoded"
}
```

### 获取分享列表

```http
GET /api/notes/:id/shares
Authorization: Bearer <token>
```

### 撤销分享

```http
DELETE /api/shares/:shareId
Authorization: Bearer <token>
```

---

## 备份 API

### 创建备份

```http
POST /api/backup
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "type": "webdav | cloud",
  "encryptedData": "base64-encoded"
}
```

### 获取备份列表

```http
GET /api/backup
Authorization: Bearer <token>
```

### 恢复备份

```http
POST /api/backup/:id/restore
Authorization: Bearer <token>
```

---

## 同步 API

### 获取增量变更

```http
GET /api/sync/changes?since=<syncVersion>
Authorization: Bearer <token>
```

**查询参数:**
- `since` (必需): 上次同步的 syncVersion

**响应:**
```json
{
  "notes": [
    {
      "id": "uuid",
      "encryptedTitle": "...",
      "encryptedContent": "...",
      "encryptedDEK": "...",
      "folderId": "uuid | null",
      "isPinned": false,
      "hasPassword": false,
      "tags": ["tag1", "tag2"],
      "syncVersion": 5,
      "lastModifiedDeviceId": "device-uuid",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "isDeleted": false,
      "deletedAt": null
    }
  ],
  "folders": [
    {
      "id": "uuid",
      "encryptedName": "...",
      "parentId": null,
      "order": 0,
      "hasPassword": false,
      "syncVersion": 3,
      "lastModifiedDeviceId": "device-uuid",
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "isDeleted": false,
      "deletedAt": null
    }
  ],
  "currentSyncVersion": 10,
  "serverTime": 1703500000000
}
```

### 推送本地变更

```http
POST /api/sync/push
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "deviceId": "device-uuid",
  "notes": [
    {
      "id": "uuid",
      "encryptedTitle": "...",
      "encryptedContent": "...",
      "encryptedDEK": "...",
      "folderId": "uuid | null",
      "isPinned": false,
      "hasPassword": false,
      "tags": ["tag1"],
      "syncVersion": 1,
      "updatedAt": "2024-01-01T00:00:00Z",
      "isDeleted": false
    }
  ],
  "folders": [
    {
      "id": "uuid",
      "encryptedName": "...",
      "parentId": null,
      "order": 0,
      "hasPassword": false,
      "syncVersion": 1,
      "updatedAt": "2024-01-01T00:00:00Z",
      "isDeleted": false
    }
  ]
}
```

**响应:**
```json
{
  "success": true,
  "results": {
    "notes": { "created": 1, "updated": 2, "conflicts": 0 },
    "folders": { "created": 0, "updated": 1, "conflicts": 0 }
  },
  "serverTime": 1703500000000
}
```

### 获取完整快照

```http
GET /api/sync/snapshot
Authorization: Bearer <token>
```

**响应:** 与 `/api/sync/changes` 相同格式，但返回所有数据

### 心跳检测

```http
POST /api/sync/heartbeat
Authorization: Bearer <token>
```

**响应:**
```json
{
  "success": true,
  "serverTime": 1703500000000
}
```

---

## 审计日志 API

### 获取审计日志

```http
GET /api/audit
Authorization: Bearer <token>
```

**查询参数:**
- `limit` (可选): 默认 100
- `action` (可选): 筛选操作类型

**响应:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "action": "login",
      "encryptedIpAddress": "...",
      "userAgent": "...",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## 错误响应

所有 API 错误返回统一格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### 错误码

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | INVALID_REQUEST | 请求参数无效 |
| 401 | UNAUTHORIZED | 未认证或令牌过期 |
| 403 | FORBIDDEN | 无权限访问 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 版本冲突 |
| 429 | RATE_LIMITED | 请求过于频繁 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## WebSocket 事件

### 连接

```javascript
const socket = io('http://localhost:4000', {
  auth: { token: 'jwt-token' }
});
```

### 事件

**服务器 → 客户端:**
- `note:updated` - 笔记更新
- `note:deleted` - 笔记删除
- `folder:updated` - 文件夹更新
- `sync:conflict` - 同步冲突

**客户端 → 服务器:**
- `note:subscribe` - 订阅笔记变更
- `note:unsubscribe` - 取消订阅
