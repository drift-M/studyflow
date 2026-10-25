import { useEffect, useRef, useState } from 'react'

export interface AsyncData<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * 轻量异步数据加载 hook。
 * deps 变化或调用 reload() 时重新加载，组件卸载后不再更新状态。
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: ReadonlyArray<unknown> = []
): AsyncData<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null
  })
  const [tick, setTick] = useState(0)
  // loader 每次渲染都是新函数，存进 ref 避免它进入 effect 依赖导致死循环
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  useEffect(() => {
    let alive = true
    setState((current) => ({ ...current, loading: true, error: null }))
    loaderRef
      .current()
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (alive) setState((current) => ({ ...current, loading: false, error: message }))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = (): void => setTick((current) => current + 1)

  return { data: state.data, loading: state.loading, error: state.error, reload }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
