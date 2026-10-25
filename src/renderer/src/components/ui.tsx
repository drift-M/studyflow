import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Icon, type IconName } from './Icon'

/* ===== 按钮 ===== */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  variant = 'secondary',
  small,
  icon,
  children,
  ...rest
}: {
  variant?: ButtonVariant
  small?: boolean
  icon?: IconName
  children?: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  const className = ['btn', `btn-${variant}`, small ? 'btn-sm' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <button className={className} {...rest}>
      {icon ? <Icon name={icon} size={small ? 14 : 16} /> : null}
      {children}
    </button>
  )
}

/* ===== 徽标 ===== */

export type BadgeVariant = 'md' | 'pdf' | 'ok' | 'gray' | 'warn' | 'ai-badge' | 'demo-badge'

export function Badge({
  variant,
  children
}: {
  variant: BadgeVariant
  children: ReactNode
}): React.JSX.Element {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

/* ===== 空状态 ===== */

export function EmptyState({
  icon = 'folder',
  title,
  desc,
  actions
}: {
  icon?: IconName
  title: string
  desc?: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name={icon} size={24} />
      </div>
      <div className="empty-title">{title}</div>
      {desc ? <div className="empty-desc">{desc}</div> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  )
}

/* ===== 模态框 ===== */

export function Modal({
  open,
  title,
  children,
  footer
}: {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
}): React.JSX.Element | null {
  if (!open) return null
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

export function ConfirmModal({
  open,
  title,
  desc,
  confirmText = '确认',
  danger,
  busy,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  desc: ReactNode
  confirmText?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element | null {
  return (
    <Modal
      open={open}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? '处理中…' : confirmText}
          </Button>
        </>
      }
    >
      {desc}
    </Modal>
  )
}

/* ===== 轻提示 ===== */

type ToastType = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  push: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ push: () => {} })

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const push = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter.current
    setToasts((current) => [...current, { id, message, type }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3400)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
