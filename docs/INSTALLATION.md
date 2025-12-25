# 安装指南

本文档提供 Secure Notebook 的详细安装和部署说明。

## 目录

1. [部署场景](#部署场景)
2. [开发环境安装](#开发环境安装)
3. [生产环境部署](#生产环境部署)
4. [Docker 部署](#docker-部署)
5. [常见问题](#常见问题)

---

## 部署场景

Secure Notebook 支持多种部署方式，根据你的需求选择：

### 场景 1：前后端一起部署（推荐）

最简单的部署方式，前端和后端部署在同一服务器。

- **同步配置**: 自动检测后端，默认启用服务器同步
- **优点**: 配置简单，用户无需额外设置
- **适用**: 个人或小团队使用

### 场景 2：前后端分离部署

前端部署在 CDN 或静态服务器，后端独立部署。

- **同步配置**: 用户需要在设置中填写后端服务器地址
- **认证方式**: 
  - 使用当前登录账号（前后端共享用户系统）
  - 使用独立账号（填写用户名密码登录同步服务器）
- **优点**: 前端可以使用 CDN 加速，后端可以独立扩展
- **适用**: 需要高可用或多地域部署

### 场景 3：仅部署前端

只部署前端，不部署后端服务器。

- **同步配置**: 使用 WebDAV 同步或纯本地存储
- **优点**: 无需维护后端服务器
- **适用**: 
  - 已有 WebDAV 服务（如坚果云、Nextcloud）
  - 仅在单设备使用，不需要同步

### 同步配置对照表

| 部署场景 | 同步目标 | 需要配置 |
|---------|---------|---------|
| 前后端一起部署 | 自建服务器 | 无（自动配置） |
| 前后端分离（同账号系统） | 自建服务器 | 服务器地址 |
| 前后端分离（独立账号） | 自建服务器 | 服务器地址 + 用户名密码 |
| 仅前端 + WebDAV | WebDAV | WebDAV URL + 用户名密码 |
| 仅前端（本地） | 无 | 无（数据仅存本地） |

---

## 场景 1：前后端一起部署（详细步骤）

这是最简单的部署方式，适合个人或小团队使用。

### 架构图

```
┌─────────────────────────────────────┐
│           Nginx (443)               │
│  ┌─────────────┬─────────────────┐  │
│  │  /          │  /api, /socket  │  │
│  │  静态文件    │  反向代理        │  │
│  └──────┬──────┴────────┬────────┘  │
└─────────┼───────────────┼───────────┘
          │               │
          ▼               ▼
┌─────────────┐   ┌─────────────┐
│  前端静态    │   │  后端服务    │
│  (dist/)    │   │  (4000)     │
└─────────────┘   └──────┬──────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ PostgreSQL  │
                  │  (5432)     │
                  └─────────────┘
```

### 部署步骤

#### 1. 准备服务器

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nginx postgresql nodejs npm git

# 安装 pnpm
npm install -g pnpm

# 安装 PM2
npm install -g pm2
```

#### 2. 克隆并构建项目

```bash
cd /var/www
git clone <repository-url> secure-notebook
cd secure-notebook

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

#### 3. 配置数据库

```bash
# 创建数据库
sudo -u postgres psql
CREATE DATABASE secure_notebook;
CREATE USER notebook_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE secure_notebook TO notebook_user;
\q

# 配置环境变量
cp packages/server/.env.example packages/server/.env
nano packages/server/.env
```

```env
DATABASE_URL="postgresql://notebook_user:your_password@localhost:5432/secure_notebook"
JWT_SECRET="your-production-secret-key-at-least-32-characters"
PORT=4000
CLIENT_URL="https://your-domain.com"
NODE_ENV="production"
```

#### 4. 初始化数据库并启动后端

```bash
# 初始化数据库
pnpm --filter @secure-notebook/server db:push

# 使用 PM2 启动后端
pm2 start packages/server/dist/index.js --name secure-notebook
pm2 save
pm2 startup
```

#### 5. 配置 Nginx

```bash
sudo nano /etc/nginx/sites-available/secure-notebook
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 前端静态文件
    root /var/www/secure-notebook/packages/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 代理
    location /socket.io {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/secure-notebook /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 6. 配置 SSL（可选但推荐）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 用户使用

用户访问 `https://your-domain.com`，注册登录后：
- 同步自动配置为"自建服务器"
- 无需任何额外设置

---

## 场景 2：前后端分离部署（详细步骤）

适合需要 CDN 加速或独立扩展的场景。

### 架构图

```
┌─────────────────┐         ┌─────────────────┐
│   CDN / 静态    │         │   后端服务器     │
│   服务器        │         │                 │
│  (前端 dist)   │◄───────►│  API (4000)     │
│                │  CORS   │  PostgreSQL     │
└─────────────────┘         └─────────────────┘
   cdn.example.com           api.example.com
```

### 部署步骤

#### 后端部署

与场景 1 相同，但需要配置 CORS：

```env
# packages/server/.env
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
PORT=4000
CLIENT_URL="https://cdn.example.com"  # 前端地址
NODE_ENV="production"
```

Nginx 配置（仅 API）：

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS 头
        add_header Access-Control-Allow-Origin "https://cdn.example.com" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Allow-Credentials "true" always;
    }

    location /socket.io {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

#### 前端部署

构建前端时配置 API 地址：

```bash
# 创建 .env.production
echo "VITE_API_URL=https://api.example.com" > packages/web/.env.production

# 构建
pnpm --filter @secure-notebook/web build
```

将 `packages/web/dist` 目录上传到 CDN 或静态服务器。

### 用户使用

用户访问前端后，需要在设置中配置同步：
1. 打开设置 → 同步
2. 同步目标选择"自建服务器"
3. 服务器地址填写 `https://api.example.com`
4. 勾选"使用当前登录账号"（如果前后端共享用户系统）
5. 或取消勾选，填写独立的用户名密码

---

## 场景 3：仅部署前端（详细步骤）

适合已有 WebDAV 服务或仅单设备使用的场景。

### 架构图

```
┌─────────────────┐         ┌─────────────────┐
│   静态服务器    │         │   WebDAV 服务   │
│   / CDN        │         │  (可选)         │
│  (前端 dist)   │◄───────►│  坚果云/        │
│                │  WebDAV │  Nextcloud 等   │
└─────────────────┘         └─────────────────┘
```

### 部署步骤

#### 1. 构建前端（禁用后端检测）

```bash
# 构建前端
pnpm --filter @secure-notebook/web build
```

#### 2. 部署静态文件

**方式 A：使用 Nginx**

```nginx
server {
    listen 443 ssl http2;
    server_name notes.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/secure-notebook/packages/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**方式 B：使用 GitHub Pages / Vercel / Netlify**

直接将 `packages/web/dist` 目录部署到静态托管服务。

### 用户使用

#### 使用 WebDAV 同步

1. 打开设置 → 同步
2. 同步目标选择"WebDAV"
3. 填写 WebDAV 配置：
   - **坚果云**: `https://dav.jianguoyun.com/dav/`
   - **Nextcloud**: `https://your-nextcloud.com/remote.php/dav/files/username/`
4. 填写用户名和密码（坚果云需要使用应用密码）
5. 点击"测试连接"确认配置正确
6. 启用自动同步

#### 仅本地使用

1. 打开设置 → 同步
2. 同步目标选择"不同步（仅本地）"
3. 数据将只保存在浏览器的 IndexedDB 中

> ⚠️ **注意**: 仅本地模式下，清除浏览器数据会丢失所有笔记！建议定期使用"备份"功能导出数据。

---

## 开发环境安装

### 1. 系统要求

- **操作系统**: Windows 10+, macOS 10.15+, Ubuntu 20.04+
- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **PostgreSQL**: >= 14
- **Git**: >= 2.0

### 2. 安装 Node.js

推荐使用 nvm (Node Version Manager) 管理 Node.js 版本：

**Windows (使用 nvm-windows):**
```powershell
# 下载并安装 nvm-windows
# https://github.com/coreybutler/nvm-windows/releases

nvm install 20
nvm use 20
```

**macOS/Linux:**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### 3. 安装 pnpm

```bash
npm install -g pnpm
```

### 4. 安装 PostgreSQL

**Windows:**
- 下载并安装 [PostgreSQL](https://www.postgresql.org/download/windows/)
- 或使用 Chocolatey: `choco install postgresql`

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
```

**Ubuntu:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 5. 创建数据库

```bash
# 登录 PostgreSQL
psql -U postgres

# 创建数据库和用户
CREATE DATABASE secure_notebook;
CREATE USER notebook_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE secure_notebook TO notebook_user;
\q
```

### 6. 克隆和安装项目

```bash
# 克隆仓库
git clone <repository-url>
cd secure-notebook

# 安装依赖
pnpm install

# 配置环境变量
cp packages/server/.env.example packages/server/.env
```

编辑 `packages/server/.env`:
```env
DATABASE_URL="postgresql://notebook_user:your_password@localhost:5432/secure_notebook?schema=public"
JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters"
PORT=4000
CLIENT_URL="http://localhost:3000"
NODE_ENV="development"
```

### 7. 初始化数据库

```bash
# 生成 Prisma 客户端
pnpm --filter @secure-notebook/server db:generate

# 推送数据库 schema (开发环境)
pnpm --filter @secure-notebook/server db:push

# 或运行迁移 (生产环境推荐)
pnpm --filter @secure-notebook/server db:migrate
```

### 8. 构建和启动

```bash
# 构建共享库
pnpm --filter @secure-notebook/shared build

# 启动开发服务器
pnpm dev
```

访问:
- 前端: http://localhost:3000
- 后端: http://localhost:4000
- API 健康检查: http://localhost:4000/api/health

---

## 生产环境部署

### 1. 构建生产版本

```bash
# 构建所有包
pnpm build
```

### 2. 配置生产环境变量

```env
DATABASE_URL="postgresql://user:password@production-db:5432/secure_notebook"
JWT_SECRET="production-secret-key-minimum-32-characters-long"
PORT=4000
CLIENT_URL="https://your-domain.com"
NODE_ENV="production"
```

### 3. 运行数据库迁移

```bash
pnpm --filter @secure-notebook/server db:migrate
```

### 4. 启动服务

```bash
# 使用 PM2 管理进程
npm install -g pm2

# 启动后端服务
pm2 start packages/server/dist/index.js --name secure-notebook-server

# 查看日志
pm2 logs secure-notebook-server
```

### 5. 配置 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 前端静态文件
    location / {
        root /path/to/secure-notebook/packages/web/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /socket.io {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Docker 部署

### 1. 创建 Dockerfile

**packages/server/Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 workspace 配置
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# 构建
RUN pnpm --filter @secure-notebook/shared build
RUN pnpm --filter @secure-notebook/server build

# 生成 Prisma 客户端
RUN pnpm --filter @secure-notebook/server db:generate

EXPOSE 4000

CMD ["node", "packages/server/dist/index.js"]
```

**packages/web/Dockerfile:**
```dockerfile
FROM node:20-alpine as builder

WORKDIR /app

RUN npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY packages/web ./packages/web

RUN pnpm --filter @secure-notebook/shared build
RUN pnpm --filter @secure-notebook/web build

FROM nginx:alpine
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### 2. Docker Compose

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: secure_notebook
      POSTGRES_USER: notebook_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U notebook_user -d secure_notebook"]
      interval: 5s
      timeout: 5s
      retries: 5

  server:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    environment:
      DATABASE_URL: postgresql://notebook_user:${DB_PASSWORD}@db:5432/secure_notebook
      JWT_SECRET: ${JWT_SECRET}
      PORT: 4000
      CLIENT_URL: ${CLIENT_URL}
      NODE_ENV: production
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "4000:4000"

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - server

volumes:
  postgres_data:
```

### 3. 启动 Docker 服务

```bash
# 创建 .env 文件
echo "DB_PASSWORD=your_secure_password" > .env
echo "JWT_SECRET=your_jwt_secret_at_least_32_chars" >> .env
echo "CLIENT_URL=https://your-domain.com" >> .env

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

---

## 常见问题

### Q: 安装依赖时出现 EACCES 权限错误

**A:** 使用 nvm 管理 Node.js，或修复 npm 权限：
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Q: PostgreSQL 连接失败

**A:** 检查以下几点：
1. PostgreSQL 服务是否运行: `sudo systemctl status postgresql`
2. 数据库和用户是否创建正确
3. pg_hba.conf 是否允许本地连接
4. DATABASE_URL 格式是否正确

### Q: Prisma 生成失败

**A:** 尝试以下步骤：
```bash
# 清理并重新生成
rm -rf packages/server/node_modules/.prisma
pnpm --filter @secure-notebook/server db:generate
```

### Q: 前端无法连接后端 API

**A:** 检查：
1. 后端服务是否运行
2. CORS 配置是否正确
3. CLIENT_URL 环境变量是否设置正确
4. 防火墙是否阻止了端口

### Q: WebSocket 连接失败

**A:** 确保：
1. Nginx 配置了 WebSocket 代理
2. 后端 Socket.io 配置正确
3. 客户端连接地址正确

### Q: 如何重置数据库

**A:** 
```bash
# 删除所有数据并重新创建
pnpm --filter @secure-notebook/server db:push --force-reset
```

---

## 技术支持

如遇到问题，请：
1. 查看 [GitHub Issues](https://github.com/your-repo/issues)
2. 提交新的 Issue，附上详细的错误信息和复现步骤
