import { Children, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import doc from '../../docs/MODULOS.md?raw'

const text = (children: ReactNode): string =>
  Children.toArray(children).map((c) => (typeof c === 'string' ? c : typeof c === 'object' && 'props' in c ? text((c.props as { children?: ReactNode }).children) : '')).join('')
export const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')

export default function Docs() {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  return (
    <article className="docs card">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={slug(text(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slug(text(children))}>{children}</h3>,
          table: ({ children }) => <div className="table-wrap"><table className="table compact">{children}</table></div>,
        }}
      >{doc}</Markdown>
    </article>
  )
}
