import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} button--${size} ${className}`} type="button" {...props}>
      {icon}{children}
    </button>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode
  label: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}

export function IconButton({ icon, label, variant = 'ghost', className = '', ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`icon-button button--${variant} ${className}`}
      title={label}
      type="button"
      {...props}
    >
      {icon}
    </button>
  )
}