import { Link } from 'react-router-dom'
import { t } from '../i18n'

export function ForbiddenPage() {
  return (
    <main className="access-page">
      <p className="eyebrow">403</p>
      <h1>{t('page.forbidden')}</h1>
      <p>{t('page.forbiddenDescription')}</p>
      <Link className="button button--primary" to="/">{t('page.backHome')}</Link>
    </main>
  )
}

export function NotFoundPage() {
  return (
    <main className="access-page">
      <p className="eyebrow">404</p>
      <h1>{t('page.notFound')}</h1>
      <p>{t('page.notFoundDescription')}</p>
      <Link className="button button--primary" to="/">{t('page.backHome')}</Link>
    </main>
  )
}