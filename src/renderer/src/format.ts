/** 展示层格式化工具 */

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp))
}

/** 相对时间：刚刚 / n 分钟前 / n 小时前 / 昨天 HH:mm / 日期 */
export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  if (diff < 48 * 60 * 60 * 1000) {
    return `昨天 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(timestamp))}`
  }
  return formatDateTime(timestamp)
}

export function formatDuration(durationSec: number): string {
  if (durationSec < 60) return `${durationSec} 秒`
  if (durationSec < 60 * 60) return `${Math.round(durationSec / 60)} 分钟`
  const hours = Math.floor(durationSec / 3600)
  const minutes = Math.round((durationSec % 3600) / 60)
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
}

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index)
}
