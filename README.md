# StudyFlow 知页

本地优先的 AI 学习桌面应用。无需注册、不依赖云端数据库，所有学习数据都保存在你自己的电脑上。

## 技术栈

- **桌面框架**：Electron（主进程 + 渲染进程 + preload 三层结构）
- **前端**：React 19 + TypeScript
- **构建**：Vite（通过 [electron-vite](https://electron-vite.org/) 集成）
- **打包**：electron-builder（Windows NSIS 安装包）
- **本地存储**：IndexedDB（后续阶段接入）

## 环境要求

- Windows 10/11
- Node.js ≥ 20（推荐 22 LTS）
- npm ≥ 10

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（启动 Vite 开发服务器 + Electron 窗口，支持热更新）
npm run dev

# 类型检查（主进程 + 渲染进程）
npm run typecheck

# 生产构建（类型检查 + 打包 out/ 目录）
npm run build

# 打包 Windows 安装包（输出到 dist/ 目录）
npm run build:win

# 代码格式化 / 静态检查
npm run format
npm run lint
```

## 项目结构

```
├── build/                  # 打包资源（应用图标等）
├── resources/              # 应用内静态资源
├── src/
│   ├── main/               # Electron 主进程（Node.js 环境，窗口与系统能力）
│   ├── preload/            # 预加载脚本（向渲染进程暴露安全的白名单 API）
│   └── renderer/           # React 前端界面
│       └── src/
│           ├── App.tsx     # 根组件
│           ├── main.tsx    # 入口
│           └── assets/     # 样式与静态文件
├── electron.vite.config.ts # electron-vite 构建配置
├── electron-builder.yml    # 打包配置
└── package.json
```

## 安全说明

- 已启用 `contextIsolation`（上下文隔离），渲染进程页面脚本无法直接访问 Node.js API
- 已禁用 `nodeIntegration`，主进程与渲染进程只通过 preload 暴露的白名单 API（IPC）通信
- 页面启用了内容安全策略（CSP）
- 新窗口默认拒绝，外部链接交由系统浏览器打开

## 开发路线

- [x] 阶段 1：环境检查与项目初始化
- [ ] 阶段 2：本地数据层（IndexedDB）与基础界面框架
- [ ] 阶段 3：学习内容管理（笔记 / 文档导入）
- [ ] 阶段 4：AI 学习功能（本地推理 / 用户自配模型）
- [ ] 阶段 5：打包发布与自动更新策略
