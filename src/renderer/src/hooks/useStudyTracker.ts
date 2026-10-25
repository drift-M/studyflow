import { useEffect } from 'react'
import { addSession } from '../db'

/** 停留超过该秒数才计入一条学习记录 */
const MIN_TRACK_SECONDS = 15

/**
 * 在学习型页面停留超过 15 秒后，自动写入一条学习记录。
 * StrictMode 开发模式下的快速挂载/卸载不会产生脏数据。
 */
export function useStudyTracker(summary: string): void {
  useEffect(() => {
    const startedAt = Date.now()
    let cancelled = false
    return () => {
      const durationSec = Math.round((Date.now() - startedAt) / 1000)
      if (!cancelled && durationSec >= MIN_TRACK_SECONDS) {
        addSession({ type: 'study', summary, startedAt, durationSec }).catch((error) => {
          console.error('写入学习记录失败', error)
        })
      }
    }
  }, [summary])
}
