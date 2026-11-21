import { Search } from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useGlobalSearch } from '../../api/queries'
import { Button, EmptyState, ErrorState, Input, Modal, Skeleton } from '../../components/ui'
import { t } from '../../i18n'

const resultLabels = {
  vehicle: 'admin.searchVehicle',
  booking: 'admin.searchBooking',
  customer: 'admin.searchCustomer',
} as const

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const result = useGlobalSearch(deferredQuery, open)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  function openSearch() {
    setQuery('')
    setOpen(true)
  }

  return (
    <>
      <Button className="global-search-trigger" icon={<Search aria-hidden="true" size={17} />} onClick={openSearch} variant="secondary">
        <span>{t('admin.search')}</span><kbd>Ctrl K</kbd>
      </Button>
      <Modal open={open} title={t('admin.search')} onClose={close}>
        <div className="global-search-panel">
          <Input autoFocus label={t('admin.search')} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.searchHint')} value={query} />
          <div aria-live="polite" className="global-search-results">
            {result.isLoading && <Skeleton rows={3} />}
            {result.isError && <ErrorState onRetry={() => void result.refetch()} retryLabel={t('styleguide.retry')} title={t('admin.searchError')} />}
            {!result.isLoading && !result.isError && deferredQuery.trim().length >= 2 && result.data?.length === 0 && <EmptyState description={t('admin.searchHint')} title={t('admin.searchEmpty')} />}
            {result.data && result.data.length > 0 && (
              <ul>
                {result.data.map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <Link onClick={close} to={item.href}>
                      <span className="global-search-result__type">{t(resultLabels[item.type])}</span>
                      <span className="global-search-result__title">{item.title}</span>
                      {item.subtitle && <span className="global-search-result__subtitle">{item.subtitle}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}