import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '../../api/client'
import { useAuth } from '../../hooks/AuthContext'
import { getRoleLandingPath } from '../../hooks/roleLanding'
import { t } from '../../i18n'
import { Button, Input } from '../../components/ui'

const loginSchema = z.object({
  email: z.string().email(t('auth.emailInvalid')),
  password: z.string().min(1, t('auth.passwordRequired')),
})

type LoginValues = z.infer<typeof loginSchema>
type LoginError = 'credentials' | 'rateLimit' | 'deactivated' | 'network'

type ReturnLocation = { from?: { pathname?: string; search?: string; hash?: string } }

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState<{ kind: LoginError; message: string } | null>(null)
  const [retrying, setRetrying] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setLoginError(null)
    setRetrying(false)
    try {
      const user = await login(values.email, values.password)
      const returnLocation = (location.state as ReturnLocation | null)?.from
      const returnTo = returnLocation?.pathname
        ? `${returnLocation.pathname}${returnLocation.search ?? ''}${returnLocation.hash ?? ''}`
        : getRoleLandingPath(user.role)
      navigate(returnTo, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setLoginError({ kind: 'credentials', message: t('auth.invalidCredentials') })
      } else if (error instanceof ApiError && error.status === 429) {
        const seconds = error.retryAfterSeconds ?? 60
        setLoginError({ kind: 'rateLimit', message: t('auth.rateLimited').replace('{seconds}', String(seconds)) })
      } else if (error instanceof ApiError && error.code === 'ACCOUNT_DEACTIVATED') {
        setLoginError({ kind: 'deactivated', message: t('auth.deactivated') })
      } else {
        setLoginError({ kind: 'network', message: t('auth.networkError') })
      }
    }
  }

  async function retryLogin() {
    setRetrying(true)
    await handleSubmit(onSubmit)()
  }

  return (
    <main className="login-screen">
      <section aria-labelledby="login-brand-headline" className="login-brand-panel">
        <div className="login-brand-panel__content">
          <Link aria-label={t('admin.brand')} className="brand brand--login" to="/">
            <span className="brand__mark"><span className="brand__mark-inner"><Check aria-hidden="true" size={22} /></span></span>
            <span className="brand__name">AutoHire <b>KE</b></span>
          </Link>
          <div className="login-brand-panel__copy">
            <p className="login-eyebrow">{t('auth.staffPortal')}</p>
            <h1 id="login-brand-headline">{t('auth.headline')}</h1>
            <ul>
              {['auth.benefitFleet', 'auth.benefitBookings', 'auth.benefitTeam'].map((key) => (
                <li key={key}><span aria-hidden="true"><Check size={15} /></span>{t(key)}</li>
              ))}
            </ul>
          </div>
          <p className="login-brand-panel__footnote">{t('auth.kenya')}</p>
        </div>
      </section>

      <section aria-labelledby="login-title" className="login-form-panel">
        <div className="login-form-wrap">
          <p className="login-form-kicker">{t('auth.welcome')}</p>
          <h2 id="login-title">{t('auth.signInTitle')}</h2>
          <p className="login-form-description">{t('auth.signInDescription')}</p>

          {loginError && (
            <div className={`login-alert login-alert--${loginError.kind}`} role="alert">
              <p>{loginError.message}</p>
              {loginError.kind === 'network' && (
                <Button disabled={isSubmitting || retrying} onClick={retryLogin} size="sm" variant="secondary">
                  {(isSubmitting || retrying) && <LoaderCircle aria-hidden="true" className="spin" size={15} />}
                  {t('auth.retry')}
                </Button>
              )}
            </div>
          )}

          <form className="login-form" noValidate onSubmit={handleSubmit(onSubmit)}>
            <Input autoComplete="username" error={errors.email?.message} label={t('auth.email')} placeholder={t('auth.emailPlaceholder')} type="email" {...register('email')} />
            <div className="field">
              <label className="field__label" htmlFor="login-password">{t('auth.password')}</label>
              <span className="login-password-control">
                <input autoComplete="current-password" className="control" id="login-password" type={showPassword ? 'text' : 'password'} {...register('password')} />
                <button aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')} className="password-toggle" onClick={() => setShowPassword(!showPassword)} type="button">
                  {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              </span>
              {errors.password && <span className="field__error">{errors.password.message}</span>}
            </div>
            <Button className="login-submit" disabled={isSubmitting} type="submit">
              {isSubmitting && <LoaderCircle aria-hidden="true" className="spin" size={17} />}
              {isSubmitting ? t('auth.submitting') : t('auth.signIn')}
            </Button>
          </form>
          <p className="login-invite-note">{t('auth.inviteOnly')}</p>
        </div>
      </section>
    </main>
  )
}