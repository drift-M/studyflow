// 仅用于 Node 测试环境：pdfjs-dist v6 依赖 ES2025/ES2026 的
// Promise.try 与 Uint8Array.prototype.toHex。Electron 渲染进程
// （Chromium ≥140）原生支持，无需此补丁。
if (typeof Promise.try !== 'function') {
  Object.defineProperty(Promise, 'try', {
    value: function <T>(
      this: PromiseConstructor,
      fn: (...args: unknown[]) => T | PromiseLike<T>,
      ...args: unknown[]
    ): Promise<T> {
      return Promise.resolve().then(() => fn(...args))
    },
    writable: true,
    configurable: true
  })
}

if (typeof Uint8Array.prototype.toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value: function toHex(this: Uint8Array): string {
      let out = ''
      for (const byte of this) out += byte.toString(16).padStart(2, '0')
      return out
    },
    writable: true,
    configurable: true
  })
}

if (typeof Uint8Array.fromHex !== 'function') {
  Object.defineProperty(Uint8Array, 'fromHex', {
    value: (hex: string): Uint8Array => {
      const bytes = new Uint8Array(hex.length / 2)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
      }
      return bytes
    },
    writable: true,
    configurable: true
  })
}
