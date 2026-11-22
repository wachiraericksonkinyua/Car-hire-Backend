import { useState, type ReactNode } from 'react'

export function ProfileAvatar({
  src,
  name,
  className,
  fallbackClassName,
  fallback,
}: {
  src?: string
  name: string
  className: string
  fallbackClassName: string
  fallback?: ReactNode
}) {
  const [failedSource, setFailedSource] = useState<string>()

  if (src && failedSource !== src) {
    return (
      <img
        alt={`${name} profile`}
        className={className}
        onError={() => setFailedSource(src)}
        src={src}
      />
    )
  }

  return (
    <span aria-label={`${name} profile image`} className={fallbackClassName} role="img">
      {fallback ?? name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
