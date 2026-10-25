# StudyFlow 知页

本地优先的 AI 学习桌面应用。无需注册、不依赖云端数据库，所有学习数据都保存在你自己的电脑上。

## 技术栈

- **桌面框架**：Electron（主进程 + 渲染进程 + preload 三层结构）
- **前端**：React 19 + TypeScript
- **构建**：Vite（通过 [electron-vite](https://electron-vite.org/) 集成）
- **本地存储**：IndexedDB（[idb](https://github.com/jakearchibald/idb) 封装，含版本管理与单元测试）
- **测试**：Vitest + fake-indexeddb
- **打包**：electron-builder（Windows NSIS 安装包）

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

# 数据库单元测试（19 个用例，覆盖增删改查/级联删除/重开持久化）
npm test

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

## 当前功能（阶段 2）

- **中文桌面界面**：侧边栏导航（首页 / 我的资料 / 知识卡片 / 练习题 / 错题本 / 设置）
- **首页**：学习资料、知识卡片、待复习统计，最近学习记录，空数据引导
- **导入学习资料**：原生文件选择框（Electron 对话框），支持 PDF 与 Markdown；主进程校验扩展名白名单、文件大小（≤50MB）、空文件、PDF 文件头与文本二进制污染；展示文件名、大小、导入时间与状态；支持删除（级联删除关联卡片/题目/错题）；Markdown 支持内容预览
- **知识卡片**：手动创建（正面/背面/标签）、列表、标记复习（24 小时内不再计入待复习）、删除
- **练习题**：手动创建选择题（选项 + 正确答案 + 解析）、答题核对、一键记入错题本、删除
- **错题本**：自动合并重复错题（次数递增）、标记已掌握、删除；侧边栏实时角标
- **设置**：数据统计、写入示例数据、清空全部数据（危险操作二次确认）
- **学习记录**：在知识卡片 / 练习题页面停留超过 15 秒自动记录一条学习足迹

## 数据存放位置与备份风险

知页是本地优先应用：**所有数据保存在本机 IndexedDB 中，不上传任何服务器，也没有云端备份**。

- 开发模式数据目录：`%APPDATA%\studyflow\IndexedDB`
- 安装版数据目录：`%APPDATA%\StudyFlow\IndexedDB`

⚠️ 备份与风险须知：

- 备份方法：整份复制上述文件夹到安全位置
- 卸载应用、使用系统清理工具、手动删除该文件夹都会导致学习数据**永久丢失**
- 重装系统或更换电脑前，请务必先备份数据目录
- 应用内「设置 → 清空全部数据」会立即删除全部本地数据

## 项目结构

```
├── build/                      # 打包资源（应用图标等）
├── resources/                  # 应用内静态资源
├── src/
│   ├── main/                   # Electron 主进程
│   │   ├── index.ts            # 窗口创建与安全配置
│   │   └── ipc.ts              # IPC 处理器（文件选择/读取，含参数校验）
│   ├── preload/                # 预加载脚本（向渲染进程暴露最小化 API）
│   │   ├── index.ts            # contextBridge 白名单暴露
│   │   └── api-types.ts        # 渲染进程与主进程共享的 IPC 类型
│   └── renderer/               # React 前端界面
│       └── src/
│           ├── App.tsx         # 布局与页面切换
│           ├── db/             # ★ 数据访问层（与界面解耦）
│           │   ├── schema.ts   # 5 个实体的类型定义
│           │   ├── database.ts # 单例连接 + 版本升级迁移
│           │   ├── documents.ts / cards.ts / quiz.ts / wrongAnswers.ts / sessions.ts
│           │   ├── seed.ts     # 示例数据
│           │   └── __tests__/  # 数据库单元测试
│           ├── components/     # 侧边栏、通用组件、图标
│           ├── pages/          # 6 个页面
│           ├── hooks/          # 异步加载 / 导入流程 / 学习时长记录
│           └── assets/         # 设计系统样式
├── electron.vite.config.ts     # electron-vite 构建配置
├── electron-builder.yml        # 打包配置
├── vitest.config.ts            # 测试配置
└── package.json
```

## 数据模型

| 实体 | 说明 | 关键字段 |
|---|---|---|
| StudyDocument | 学习资料（PDF/Markdown） | id、标题、文件名、类型、大小、内容、导入时间 |
| KnowledgeCard | 知识卡片 | id、关联资料、正面/背面、标签、复习次数、下次复习时间 |
| QuizQuestion | 练习题 | id、关联资料、题干、选项、正确答案、解析 |
| WrongAnswer | 错题记录 | id、题目快照、我的答案/正确答案、累计次数、是否已掌握 |
| StudySession | 学习记录 | id、类型、摘要、开始时间、时长 |

## 安全说明

- `contextIsolation: true`、`nodeIntegration: false`：渲染进程页面脚本无法直接访问 Node.js
- 主进程与渲染进程只通过 preload 暴露的两个 IPC API 通信（选择文件、读取文件）
- IPC 主进程侧校验参数：类型检查、绝对路径、扩展名白名单、大小上限、PDF 文件头验证
- 页面启用了内容安全策略（CSP）；外部链接交由系统浏览器打开
- 不向渲染进程暴露 ipcRenderer 或任何通用系统能力

## 当前未实现的功能

- PDF 内容解析（当前仅保存原始二进制，供后续阶段使用）
- AI 自动生成知识卡片与练习题
- 间隔重复复习算法（当前为固定 24 小时复习间隔）
- 资料分类文件夹、搜索、重命名
- 深色模式
- 云同步与多设备（不在规划内）、自动更新、导入导出备份文件

## 开发路线

- [x] 阶段 1：环境检查与项目初始化
- [x] 阶段 2：中文界面与本地数据层（IndexedDB）
- [ ] 阶段 3：PDF/Markdown 内容解析与阅读视图
- [ ] 阶段 4：AI 生成知识卡片与练习题
- [ ] 阶段 5：复习算法与学习统计
- [ ] 阶段 6：打包发布
