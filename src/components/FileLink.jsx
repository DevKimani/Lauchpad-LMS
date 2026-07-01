import { useEffect, useState } from 'react'
import { getFileUrl } from '../lib/files'

function isExternal(value) {
  if (!value) return false
  return (
    (value.startsWith('http://') || value.startsWith('https://')) &&
    !value.includes('/storage/v1/object/')
  )
}

export default function FileLink({ value, label, className }) {
  const [href, setHref] = useState(() => (isExternal(value) ? value : null))

  useEffect(() => {
    if (!value || isExternal(value)) return
    getFileUrl(value).then((url) => setHref(url ?? null))
  }, [value])

  if (!value) return null

  if (!href) {
    return <span className="text-sm text-ink/40">preparing…</span>
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label}
    </a>
  )
}
