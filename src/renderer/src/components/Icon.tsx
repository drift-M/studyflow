import type { ReactNode } from 'react'

export type IconName =
  | 'home'
  | 'folder'
  | 'cards'
  | 'quiz'
  | 'wrongbook'
  | 'settings'
  | 'plus'
  | 'trash'
  | 'import'
  | 'eye'
  | 'check'
  | 'clock'
  | 'seed'

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  folder: (
    <path d="M3 7A1.5 1.5 0 0 1 4.5 5.5h4.2l2 2.5H19.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  ),
  cards: (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5.2" />
    </>
  ),
  wrongbook: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V13" />
      <path d="M12 16.4h.01" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h8" />
      <path d="M16 7h4" />
      <circle cx="14" cy="7" r="2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l.7 11.6a1.5 1.5 0 0 0 1.5 1.4h6.6a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </>
  ),
  import: (
    <>
      <path d="M12 15.5V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 16v2.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  seed: (
    <>
      <path d="M12 21v-7" />
      <path d="M12 14a6 6 0 0 1-6-6c0-2.5 1.5-4.5 2.5-5.5C10 3 12 4.5 13.5 6.5" />
      <path d="M12 14a6 6 0 0 0 6-6c0-1.2-.3-2.3-.8-3.2" />
      <path d="M9 18h6" />
    </>
  )
}

export function Icon({
  name,
  size = 18
}: {
  name: IconName
  size?: number
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  )
}
