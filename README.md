# Secure Notebook

一个端到端加密的安全在线笔记本应用，支持多终端同步、WebDAV备份、云备份、多级目录管理、Markdown编辑等功能。

## 🔐 安全特性

- **端到端加密 (E2E)**: 所有笔记内容在客户端使用 AES-256-GCM 加密后再传输
- **零知识架构**: 服务器永远无法访问您的明文数据
- **密钥派生**: 使用 Argon2id 从用户密码派生主密钥
- **恢复密钥**: 24词助记词用于账户恢复
- **笔记/文件夹密码保护**: 为敏感内容添加额外保护层
- **审计日志**: 记录所有安全相关活动

## 📦 项目结构

```
secure-notebook/
├── packages/
│   ├── web/          # React 前端应用
│   ├── server/       # Express 后端服务
│   └── shared/       # 共享加密库和类型
├── package.json
└── pnpm-workspace.yaml
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL >= 14

### 安装步骤

1. **克隆仓库**
```bash
git clone <repository-url>
cd secure-notebook
```

2. **安装依赖**
```bash
pnpm install
```

3. **配置环境变量**
```bash
# 复制服务端环境变量模板
cp packages/server/.env.example packages/server/.env

# 编辑 .env 文件，配置数据库连接等
```

4. **初始化数据库**
```bash
# 生成 Prisma 客户端
pnpm --filter @secure-notebook/server db:generate

# 推送数据库 schema
pnpm --filter @secure-notebook/server db:push
```

5. **构建共享库**
```bash
pnpm --filter @secure-notebook/shared build
```

6. **启动开发服务器**
```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm dev:web     # 前端 (http://localhost:3000)
pnpm dev:server  # 后端 (http://localhost:4000)
```

## 🧪 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm --filter @secure-notebook/shared test
pnpm --filter @secure-notebook/server test

# 监听模式
pnpm test:watch
```

## 🏗️ 构建生产版本

```bash
# 构建所有包
pnpm build

# 构建特定包
pnpm --filter @secure-notebook/web build
pnpm --filter @secure-notebook/server build
```

## 📝 功能列表

### 核心功能
- ✅ 端到端加密笔记
- ✅ 多终端实时同步
- ✅ Markdown 编辑器
- ✅ 多级文件夹管理
- ✅ 笔记置顶
- ✅ 全文搜索
- ✅ 标签管理

### 安全功能
- ✅ AES-256-GCM 加密
- ✅ Argon2id 密钥派生
- ✅ 24词恢复密钥
- ✅ 笔记/文件夹密码保护
- ✅ 审计日志
- ✅ 会话管理

### 备份功能
- ✅ WebDAV 备份
- ✅ 云备份
- ✅ 版本历史 (最近50个版本)
- ✅ 备份恢复

### 协作功能
- ✅ 笔记分享
- ✅ 权限控制 (查看/编辑)
- ✅ 分享撤销

## 🔧 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | - |
| `JWT_SECRET` | JWT 签名密钥 | - |
| `PORT` | 服务端口 | 4000 |
| `CLIENT_URL` | 前端地址 | http://localhost:3000 |
| `NODE_ENV` | 运行环境 | development |

### WebDAV 配置

在设置页面的 Backup 标签中配置：
- WebDAV URL
- 用户名
- 密码

凭据会使用设备特定密钥加密存储。

## 🛡️ 安全架构

### 加密流程

1. 用户密码 → Argon2id → 主密钥 (Master Key)
2. 主密钥 → HKDF → 密钥加密密钥 (KEK)
3. 每个笔记生成唯一的数据加密密钥 (DEK)
4. DEK 使用 AES-256-KW 包装后存储
5. 笔记内容使用 DEK + AES-256-GCM 加密

### 密码保护

- 笔记密码使用 Argon2id 派生二级密钥
- 实现双重加密 (主密钥 + 笔记密码)
- 5次失败后锁定5分钟
- 支持使用恢复密钥重置笔记密码

## 📱 页面入口

| 页面 | 入口 | 功能 |
|------|------|------|
| 登录 | 应用首页 | 用户登录 |
| 注册 | 登录页切换 | 创建账户，显示恢复密钥 |
| 主界面 | 登录后 | 侧边栏 + 笔记列表 + 编辑器 |
| 设置 | 侧边栏底部 | 通用/备份/安全/账户设置 |
| 版本历史 | 编辑器工具栏 | 查看和恢复历史版本 |
| 分享 | 编辑器工具栏 | 分享笔记给其他用户 |
| 密码保护 | 编辑器工具栏 | 设置/移除笔记密码 |

## 🔄 更新日志

### v1.0.2 (2024-12-25)
- ✅ 前后端 API 集成完成
- ✅ 真实加密数据存储
- ✅ 加密服务 (crypto-service.ts)
- ✅ API 服务 (api-service.ts)
- ✅ 离线模式支持

### v1.0.1 (2024-12-25)
- ✅ 新增密码恢复页面 (RecoveryPage)
- ✅ 新增标签管理对话框 (TagsDialog)
- ✅ 新增 PDF 导出功能 (打印对话框)
- ✅ 新增移动端响应式设计
- ✅ 新增字体大小设置功能
- ✅ 侧边栏移动端折叠支持
- ✅ 编辑器移动端返回按钮
- ✅ 完善 CSS 变量系统

### v1.0.0 (2024-12-25)
- 初始版本发布
- 完整的端到端加密实现
- 200个单元测试全部通过
- 44个正确性属性测试
- 完整的前端UI实现

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

