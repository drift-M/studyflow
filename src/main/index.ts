import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpcHandlers } from './ipc'
import { registerAiIpcHandlers } from './aiIpc'

let mainWindow: BrowserWindow | null = null

// 自定义协议：为 PDF.js 提供本地 cmaps 与标准字体（不访问网络）。
// 必须在 app ready 之前注册。
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'pdfassets',
    privileges: { supportFetchAPI: true, stream: true, secure: true, bypassCSP: false }
  }
])

function registerPdfAssetsProtocol(): void {
  const base = resolve(__dirname, '../../node_modules/pdfjs-dist')
  protocol.handle('pdfassets', (request) => {
    const url = new URL(request.url)
    // pdfassets://cmaps/xxx.bcmap → host 是一级目录，pathname 是文件名
    const relative = decodeURIComponent(`${url.host}${url.pathname}`)
    const filePath = resolve(base, relative)
    // 防止路径穿越：解析后的路径必须仍位于 pdfjs-dist 目录内
    if (!filePath.startsWith(base + sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net
      .fetch(pathToFileURL(filePath).toString())
      .then((response) => {
        const headers = new Headers(response.headers)
        headers.set('Access-Control-Allow-Origin', '*')
        headers.set('Cache-Control', 'public, max-age=31536000')
        return new Response(response.body, { status: response.status, headers })
      })
      .catch(() => new Response('Not Found', { status: 404 }))
  })
}

function createWindow(): void {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'StudyFlow 知页',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // 安全基线：渲染进程与页面脚本不直接拥有 Node.js 能力，
      // 只能通过 preload 暴露的白名单 API 与主进程通信。
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式下把渲染进程的控制台消息转发到终端，方便排查界面错误
  if (is.dev) {
    win.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message} (${event.sourceId})`)
    })
  }

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.studyflow.app')

  registerPdfAssetsProtocol()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers(() => mainWindow)
  registerAiIpcHandlers()

  createWindow()

  mainWindow?.on('closed', () => {
    mainWindow = null
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
