import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // pdfjs-dist 的现代构建使用了 Node 22 尚未支持的新 API，
      // 测试环境使用官方 legacy 构建（Electron 渲染进程仍用现代构建）。
      'pdfjs-dist': 'pdfjs-dist/legacy/build/pdf.mjs'
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts']
  }
})
