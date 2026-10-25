/**
 * StudyFlow 数据访问层统一出口。
 * 界面组件只从这里导入数据库操作，不直接接触 IndexedDB。
 */
export * from './schema'
export { getDB, closeDB, clearAllData } from './database'
export * from './documents'
export * from './cards'
export * from './quiz'
export * from './answers'
export * from './wrongAnswers'
export * from './sessions'
export * from './seed'
export * from './backup'
export * from './stats'
