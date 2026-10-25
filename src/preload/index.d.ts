import type { StudyFlowApi } from './api-types'

declare global {
  interface Window {
    api: StudyFlowApi
  }
}

export {}
