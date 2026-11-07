import type { ReactNode } from 'react'

type Props = {
  href: string
  title?: string
  children: ReactNode
}

// One place that defines how every outside link behaves:
// new tab + noopener/noreferrer so the new page can't touch ours.
export default function ExternalLink({ href, title, children }: Props) {
  return (
    <a
      className="external-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {children} <span aria-hidden="true">↗</span>
    </a>
  )
}