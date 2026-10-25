import { contextBridge, ipcRenderer } from 'electron'
import type { StudyFlowApi } from './api-types'

/**
 * 只暴露最小化、明确的 IPC API。
 * 渲染进程拿不到 ipcRenderer 本身，也无法直接访问任何 Node.js 能力。
 */
const api: StudyFlowApi = {
  selectStudyFile: () => ipcRenderer.invoke('studyflow:select-file'),
  importStudyFile: () => ipcRenderer.invoke('studyflow:import-file'),
  readStudyFile: (filePath) => ipcRenderer.invoke('studyflow:read-file', filePath),
  saveBackupFile: (json) => ipcRenderer.invoke('studyflow:save-backup', json),
  openBackupFile: () => ipcRenderer.invoke('studyflow:open-backup')
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('暴露 preload API 失败', error)
}
