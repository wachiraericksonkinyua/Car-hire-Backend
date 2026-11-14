import { useEffect, useId, useRef, type PropsWithChildren } from 'react'
import { X } from 'lucide-react'
import { t } from '../../i18n'
import { Button, IconButton } from './button'

type FrameProps = PropsWithChildren<{
  open: boolean
  title: string
  onClose: () => void
  variant?: 'modal' | 'drawer'
}>

function OverlayFrame({ open, title, onClose, variant = 'modal', children }: FrameProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    frameRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && frameRef.current) {
        const focusable = frameRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), [tabindex="0"]')
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={`overlay overlay--${variant}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-labelledby={titleId} aria-modal="true" className="overlay__panel" ref={frameRef} role="dialog" tabIndex={-1}>
        <header className="overlay__header"><h2 id={titleId}>{title}</h2><IconButton icon={<X size={18} />} label={t('styleguide.cancel')} onClick={onClose} /></header>
        {children}
      </section>
    </div>
  )
}

export function Modal(props: FrameProps) {
  return <OverlayFrame {...props} variant="modal" />
}

export function Drawer(props: FrameProps) {
  return <OverlayFrame {...props} variant="drawer" />
}

export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="confirm-dialog"><p>{description}</p><div className="confirm-dialog__actions"><Button onClick={onCancel} variant="secondary">{cancelLabel}</Button><Button onClick={onConfirm} variant="danger">{confirmLabel}</Button></div></div>
    </Modal>
  )
}