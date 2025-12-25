# Secure Notebook 桌面版

基于 Electron 的跨平台桌面客户端，数据存储在本地，支持远程同步。

## 特点

- **本地优先**：所有数据首先存储在本地文件系统，离线可用
- **远程同步**：支持同步到自建服务器或 WebDAV（坚果云、NextCloud 等）
- **端到端加密**：笔记内容使用 AES-256-GCM 加密，服务器无法解密
- **跨平台**：支持 Windows、macOS、Linux
- **多设备同步**：通过远程同步实现多设备数据同步

## 同步选项

在设置页面可以配置：

1. **不同步** - 纯本地使用
2. **自建服务器** - 连接到你部署的 Secure Notebook 后端
3. **WebDAV** - 连接到坚果云、NextCloud、Synology 等支持 WebDAV 的服务

## 数据存储位置

- Windows: `%APPDATA%/Secure Notebook/data/`
- macOS: `~/Library/Application Support/Secure Notebook/data/`
- Linux: `~/.config/Secure Notebook/data/`

## 开发

```bash
# 在项目根目录
cd secure-notebook

# 安装依赖
pnpm install

# 开发模式（会同时启动 web 开发服务器和 Electron）
pnpm run dev:desktop

# 或者在 desktop 目录
cd packages/desktop
pnpm run dev
```

## 构建

```bash
# 在项目根目录构建 Windows 版本
pnpm run build:desktop:win

# 构建 macOS 版本
pnpm run build:desktop:mac

# 构建 Linux 版本
pnpm run build:desktop:linux
```

## 图标

在 `assets/` 目录放置应用图标：
- `icon.ico` - Windows (256x256)
- `icon.icns` - macOS
- `icon.png` - Linux (512x512)

可以使用在线工具如 [icoconvert.com](https://icoconvert.com/) 生成图标。

## 构建产物

构建后的安装包在 `release/` 目录：
- Windows: `.exe` 安装包和便携版
- macOS: `.dmg` 和 `.zip`
- Linux: `.AppImage` 和 `.deb`

## 功能

- 原生窗口菜单（文件、编辑、视图、帮助）
- 快捷键支持
- 单实例运行
- 外部链接在默认浏览器打开
- 本地文件系统存储（JSON 格式）
- 支持导出/导入备份
