import { useEffect, useState } from 'react'
import { Bell, Plus } from 'lucide-react'
import type { Vehicle } from '../api/types'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  DateTimeRangePicker,
  Drawer,
  EmptyState,
  ErrorState,
  FileUploader,
  IconButton,
  Input,
  KpiCard,
  Modal,
  MoneyInput,
  PhoneInput,
  PillTabs,
  Select,
  Skeleton,
  StatusChip,
  Stepper,
  Switch,
  Tabs,
  Toast,
} from '../components/ui'
import { t } from '../i18n'
import { formatKes } from '../lib'
import { vehicles } from '../mocks/fixtures'

const bookingStatuses = ['pending', 'awaiting_approval', 'approved', 'confirmed', 'active', 'completed', 'cancelled', 'rejected', 'overdue', 'draft'] as const
const vehicleStatuses = ['available', 'booked', 'maintenance', 'inactive'] as const

export function StyleguidePage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [phone, setPhone] = useState('254712345678')
  const [money, setMoney] = useState<number | null>(12500)
  const [checked, setChecked] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [tab, setTab] = useState('details')
  const [pillTab, setPillTab] = useState('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toastOpen, setToastOpen] = useState(true)
  const [retries, setRetries] = useState(0)
  const [dateRange, setDateRange] = useState({ startUtc: '2026-11-14T06:00:00.000Z', endUtc: '2026-11-15T06:00:00.000Z' })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const columns = [
    { key: 'vehicle', header: t('styleguide.vehicleColumn'), render: (vehicle: Vehicle) => `${vehicle.make} ${vehicle.model}` },
    { key: 'rate', header: t('styleguide.rateColumn'), render: (vehicle: Vehicle) => formatKes(vehicle.ratePerDay) },
    { key: 'status', header: t('styleguide.statusColumn'), render: (vehicle: Vehicle) => <StatusChip status={vehicle.status} variant="vehicle" /> },
  ]

  return (
    <main className="styleguide">
      <header className="styleguide__header">
        <div><p className="eyebrow">{t('admin.brand')}</p><h1>{t('styleguide.title')}</h1></div>
        <div aria-label={t('styleguide.theme')} className="theme-switch" role="group">
          <Button onClick={() => setTheme('light')} size="sm" variant={theme === 'light' ? 'primary' : 'secondary'}>{t('styleguide.light')}</Button>
          <Button onClick={() => setTheme('dark')} size="sm" variant={theme === 'dark' ? 'primary' : 'secondary'}>{t('styleguide.dark')}</Button>
        </div>
      </header>

      <section className="styleguide-section">
        <h2>{t('styleguide.buttons')}</h2>
        <div className="component-row">
          <Button>{t('styleguide.save')}</Button><Button variant="secondary">{t('styleguide.cancel')}</Button>
          <Button variant="ghost">{t('styleguide.view')}</Button><Button variant="danger">{t('styleguide.confirm')}</Button>
          <Button size="sm">{t('styleguide.preview')}</Button><Button size="lg">{t('styleguide.addVehicle')}</Button>
          <Button disabled>{t('styleguide.disabled')}</Button><IconButton icon={<Plus size={18} />} label={t('styleguide.addVehicle')} variant="primary" />
          <IconButton icon={<Bell size={18} />} label={t('styleguide.information')} />
        </div>
      </section>

      <section className="styleguide-section">
        <h2>{t('styleguide.forms')}</h2>
        <div className="component-grid">
          <Input label={t('styleguide.name')} placeholder={t('styleguide.name')} />
          <Input error={t('styleguide.nameError')} label={t('styleguide.name')} value="" readOnly />
          <PhoneInput hint={t('styleguide.phoneHint')} label={t('styleguide.phone')} onChange={setPhone} value={phone} />
          <MoneyInput label={t('styleguide.rate')} onChange={setMoney} value={money} />
          <Select label={t('styleguide.vehicle')} options={[{ value: '', label: t('styleguide.choose') }, ...vehicles.slice(0, 3).map((vehicle) => ({ value: vehicle.id, label: `${vehicle.make} ${vehicle.model}` }))]} />
          <div className="choice-stack"><Checkbox checked={checked} label={t('styleguide.acceptTerms')} onChange={setChecked} /><Checkbox checked={false} label={t('styleguide.disabled')} disabled onChange={() => undefined} /><Switch checked={enabled} label={t('styleguide.available')} onChange={setEnabled} /><Switch checked={false} label={t('styleguide.disabled')} onChange={() => undefined} /></div>
          <DateTimeRangePicker endUtc={dateRange.endUtc} label={t('styleguide.dateRange')} onChange={setDateRange} startUtc={dateRange.startUtc} />
          <FileUploader accept=".pdf,.png,.jpg" label={t('styleguide.upload')} multiple onFiles={() => undefined} />
        </div>
      </section>

      <section className="styleguide-section">
        <h2>{t('styleguide.navigation')}</h2>
        <div className="component-grid">
          <Tabs label={t('styleguide.navigation')} onChange={setTab} options={[{ value: 'details', label: t('styleguide.tabDetails') }, { value: 'photos', label: t('styleguide.tabPhotos') }, { value: 'history', label: t('styleguide.tabHistory'), disabled: true }]} value={tab} />
          <PillTabs label={t('styleguide.navigation')} onChange={setPillTab} options={[{ value: 'all', label: t('styleguide.vehicleList') }, { value: 'available', label: t('status.vehicle.available') }, { value: 'booked', label: t('status.vehicle.booked') }]} value={pillTab} />
          <Stepper activeStep={1} steps={[t('styleguide.stepOne'), t('styleguide.stepTwo'), t('styleguide.stepThree')]} />
        </div>
      </section>

      <section className="styleguide-section">
        <h2>{t('styleguide.feedback')}</h2>
        <div className="component-row"><Badge>{t('styleguide.preview')}</Badge><Badge tone="success">{t('styleguide.success')}</Badge><Badge tone="info">{t('styleguide.information')}</Badge><Badge tone="warning">{t('styleguide.warning')}</Badge><Badge tone="danger">{t('styleguide.danger')}</Badge></div>
        <div className="status-list">{vehicleStatuses.map((status) => <StatusChip key={status} status={status} variant="vehicle" />)}{bookingStatuses.map((status) => <StatusChip key={status} status={status} variant="booking" />)}</div>
        <div className="component-grid"><div><h3>{t('styleguide.loading')}</h3><Skeleton rows={3} /></div><EmptyState action={<Button>{t('styleguide.addVehicle')}</Button>} description={t('styleguide.emptyDescription')} title={t('styleguide.empty')} /><ErrorState onRetry={() => setRetries(retries + 1)} retryLabel={`${t('styleguide.retry')} ${retries || ''}`.trim()} title={t('styleguide.error')} /></div>
        <div className="component-row"><Button onClick={() => setToastOpen(true)} variant="secondary">{t('styleguide.showToast')}</Button>{toastOpen && <Toast message={t('styleguide.toast')} onClose={() => setToastOpen(false)} />}</div>
      </section>

      <section className="styleguide-section">
        <h2>{t('styleguide.data')}</h2>
        <div className="component-grid"><KpiCard detail={t('styleguide.metricDetail')} label={t('styleguide.kpiLabel')} trend="up" value="128" /><DataTable columns={columns} empty={<EmptyState description={t('styleguide.emptyDescription')} title={t('styleguide.empty')} />} rowKey={(vehicle) => vehicle.id} rows={vehicles.slice(0, 3)} /></div>
      </section>

      <section className="styleguide-section">
        <h2>{t('styleguide.overlays')}</h2>
        <div className="component-row"><Button onClick={() => setModalOpen(true)} variant="secondary">{t('styleguide.openModal')}</Button><Button onClick={() => setDrawerOpen(true)} variant="secondary">{t('styleguide.openDrawer')}</Button><Button onClick={() => setConfirmOpen(true)} variant="danger">{t('styleguide.confirm')}</Button></div>
      </section>

      <Modal open={modalOpen} title={t('styleguide.openModal')} onClose={() => setModalOpen(false)}><div className="overlay__body"><p>{t('styleguide.confirmDescription')}</p><Button onClick={() => setModalOpen(false)}>{t('styleguide.close')}</Button></div></Modal>
      <Drawer open={drawerOpen} title={t('styleguide.openDrawer')} onClose={() => setDrawerOpen(false)}><div className="overlay__body"><p>{t('styleguide.confirmDescription')}</p><Button onClick={() => setDrawerOpen(false)}>{t('styleguide.close')}</Button></div></Drawer>
      <ConfirmDialog cancelLabel={t('styleguide.cancel')} confirmLabel={t('styleguide.confirm')} description={t('styleguide.confirmDescription')} onCancel={() => setConfirmOpen(false)} onConfirm={() => setConfirmOpen(false)} open={confirmOpen} title={t('styleguide.confirmTitle')} />
    </main>
  )
}