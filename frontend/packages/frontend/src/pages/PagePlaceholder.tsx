import { t } from '../i18n'

export function PagePlaceholder({ title }: { title: string }) {
  return <section className="page-placeholder"><p>{t('admin.brand')}</p><h1>{title}</h1></section>
}