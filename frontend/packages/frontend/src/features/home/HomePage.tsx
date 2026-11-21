import { z } from 'zod'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, CarFront, MapPin, Wallet } from 'lucide-react'
import { useVehicles } from '../../api/queries'
import type { Vehicle } from '../../api/types'
import { EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui'
import { formatKes, toUtc } from '../../lib'
import { t } from '../../i18n'
import { APP_PROMO, homeFacts } from './homeConfig'

const bookingSchema = z.object({
  category: z.string().min(1, t('home.chooseCategory')),
  pickup: z.string().trim().min(2, t('home.rentalPlaceRequired')),
  returnLocation: z.string().trim().min(2, t('home.returnPlaceRequired')),
  rentalAt: z.string().min(1, t('home.dateRequired')),
  returnAt: z.string().min(1, t('home.dateRequired')),
}).superRefine((values, context) => {
  try {
    const rentalUtc = toUtc(values.rentalAt)
    const returnUtc = toUtc(values.returnAt)
    if (Date.parse(rentalUtc) < Date.now()) {
      context.addIssue({ code: 'custom', message: t('home.rentalNotPast'), path: ['rentalAt'] })
    }
    if (Date.parse(returnUtc) <= Date.parse(rentalUtc)) {
      context.addIssue({ code: 'custom', message: t('home.returnAfterRental'), path: ['returnAt'] })
    }
  } catch {
    context.addIssue({ code: 'custom', message: t('home.dateRequired'), path: ['rentalAt'] })
  }
})

type BookingValues = z.infer<typeof bookingSchema>
type BookingField = keyof BookingValues

type Feature = { icon: typeof MapPin; title: string; copy: string }
const features: Feature[] = [
  { icon: MapPin, title: 'home.features.availability', copy: 'home.features.availabilityCopy' },
  { icon: CarFront, title: 'home.features.comfort', copy: 'home.features.comfortCopy' },
  { icon: Wallet, title: 'home.features.savings', copy: 'home.features.savingsCopy' },
]

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return <article className="home-vehicle-card">
    <div aria-label={t('home.vehicleImagePlaceholder')} className="home-vehicle-card__image" role="img"><CarFront aria-hidden="true" size={66} /><span>{t('home.vehicleImagePlaceholder')}</span></div>
    <div className="home-vehicle-card__title"><div><h3>{vehicle.make} {vehicle.model}</h3><span>{vehicle.category ?? t('home.chooseCarType')}</span></div><strong>{formatKes(vehicle.ratePerDay)}<small>{t('home.perDay')}</small></strong></div>
    <div className="home-vehicle-card__details"><span><CarFront aria-hidden="true" size={16} />{vehicle.seats} {t('home.seats')}</span><span>{vehicle.transmission === 'automatic' ? t('home.automatic') : t('home.manual')}</span></div>
    <Link className="home-vehicle-card__link" to={`/vehicles/${vehicle.id}`}>{t('styleguide.view')}<ArrowRight aria-hidden="true" size={16} /></Link>
  </article>
}

function FeatureColumns() {
  return <section aria-label={t('home.featuresLabel')} className="home-features home-section">
    {features.map(({ icon: Icon, title, copy }) => <article className="home-feature" key={title}>
      <Icon aria-hidden="true" size={48} strokeWidth={1.6} /><h2>{t(title)}</h2><p>{t(copy)}</p>
    </article>)}
  </section>
}

function HowItWorks() {
  const steps = [1, 2, 3, 4] as const
  return <section className="home-how home-section">
    <div aria-label={t('home.journeyImagePlaceholder')} className="home-how__image" role="img"><CarFront aria-hidden="true" size={92} /><span>{t('home.journeyImagePlaceholder')}</span></div>
    <div className="home-how__content"><h2>{t('home.howTitle')}</h2>
      <ol>{steps.map((step) => <li key={step}><span aria-hidden="true" className="home-step-number">{step}</span><div><h3>{t(`home.howStep${step}`)}</h3><p>{t(`home.howCopy${step}`)}</p></div></li>)}</ol>
    </div>
  </section>
}

function FactsBand() {
  const icons = [CarFront, MapPin, CalendarDays, ArrowRight]
  return <section aria-labelledby="home-facts-title" className="home-facts home-section">
    <div className="home-facts__heading"><h2 id="home-facts-title">{t('home.factsTitle')}</h2><p>{t('home.factsCopy')}</p></div>
    <div className="home-facts__grid">{homeFacts.map((fact, index) => {
      const Icon = icons[index]
      return <article className="home-fact-card" key={fact.key}><span><Icon aria-hidden="true" size={26} /></span><strong>{fact.value}</strong><small>{t(`home.fact${fact.key[0].toUpperCase()}${fact.key.slice(1)}`)}</small></article>
    })}</div>
  </section>
}

function AppPromo() {
  return <section aria-labelledby="home-app-title" className="home-app-promo home-section">
    <div><h2 id="home-app-title">{t('home.appTitle')}</h2><p>{t('home.appCopy')}</p><div className="home-app-badges"><a href="#app-store"><span aria-hidden="true">A</span>{t('home.appStoreBadge')}</a><a href="#google-play"><span aria-hidden="true">▶</span>{t('home.googlePlayBadge')}</a></div></div>
    <div className="home-phone-mockups" aria-label={t('home.phonePlaceholder')}><div><span>{t('home.phonePlaceholder')}</span></div><div><span>{t('home.phonePlaceholder')}</span></div></div>
  </section>
}

function HeroBookingForm({ categories }: { categories: string[] }) {
  const navigate = useNavigate()
  const [values, setValues] = useState<BookingValues>({ category: '', pickup: '', returnLocation: '', rentalAt: '', returnAt: '' })
  const [errors, setErrors] = useState<Partial<Record<BookingField, string>>>({})

  function update(field: BookingField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = bookingSchema.safeParse(values)
    if (!result.success) {
      const nextErrors: Partial<Record<BookingField, string>> = {}
      for (const issue of result.error.issues) {
        const field = issue.path[0] as BookingField | undefined
        if (field && !nextErrors[field]) nextErrors[field] = issue.message
      }
      setErrors(nextErrors)
      return
    }
    const params = new URLSearchParams({
      category: result.data.category,
      from: toUtc(result.data.rentalAt),
      to: toUtc(result.data.returnAt),
      pickup: result.data.pickup.trim(),
      return: result.data.returnLocation.trim(),
    })
    navigate(`/vehicles?${params.toString()}`)
  }

  return <form className="home-booking-card" noValidate onSubmit={submit}>
    <h2>{t('home.bookYourCar')}</h2>
    <Select error={errors.category} label={t('home.carType')} onChange={(event) => update('category', event.target.value)} options={[{ value: '', label: t('home.chooseCarType') }, ...categories.map((category) => ({ value: category, label: category }))]} value={values.category} />
    <Input error={errors.pickup} label={t('home.placeRental')} onChange={(event) => update('pickup', event.target.value)} placeholder={t('home.placeRentalPlaceholder')} value={values.pickup} />
    <Input error={errors.returnLocation} label={t('home.placeReturn')} onChange={(event) => update('returnLocation', event.target.value)} placeholder={t('home.placeReturnPlaceholder')} value={values.returnLocation} />
    <Input error={errors.rentalAt} label={t('home.rentalDate')} onChange={(event) => update('rentalAt', event.target.value)} type="datetime-local" value={values.rentalAt} />
    <Input error={errors.returnAt} label={t('home.returnDate')} onChange={(event) => update('returnAt', event.target.value)} type="datetime-local" value={values.returnAt} />
    <button className="home-booking-submit" type="submit">{t('home.bookNow')}</button>
  </form>
}

function CitySearch() {
  const navigate = useNavigate()
  const [city, setCity] = useState('')
  const [error, setError] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!city.trim()) { setError(true); return }
    navigate(`/vehicles?city=${encodeURIComponent(city.trim())}`)
  }
  return <section className="home-city-band home-section">
    <div><h2>{t('home.cityTitle')}</h2><p>{t('home.cityCopy')}</p><form onSubmit={submit}>
      <label className="visually-hidden" htmlFor="home-city">{t('home.city')}</label>
      <input id="home-city" onChange={(event) => { setCity(event.target.value); setError(false) }} placeholder={t('home.cityPlaceholder')} value={city} />
      <button type="submit">{t('home.searchCity')}</button>
    </form>{error && <span className="home-city-error" role="alert">{t('home.cityRequired')}</span>}</div>
    <CarFront aria-hidden="true" className="home-city-car" size={170} strokeWidth={1.1} />
  </section>
}

export function HomePage() {
  const vehiclesQuery = useVehicles()
  const categories = [...new Set((vehiclesQuery.data ?? []).map((vehicle) => vehicle.category).filter((category): category is string => Boolean(category)))].sort()
  const featuredVehicles = (vehiclesQuery.data ?? []).filter((vehicle) => vehicle.status === 'available').slice(0, 6)

  return <div className="home-page">
    <section aria-labelledby="home-hero-title" className="home-hero home-section">
      <div className="home-hero__copy"><h1 id="home-hero-title">{t('home.heroTitle')}</h1><p>{t('home.heroSupport')}</p><Link className="home-hero__cta" to="/vehicles">{t('home.viewAllCars')}</Link></div>
      <HeroBookingForm categories={categories} />
    </section>
    <FeatureColumns />
    <HowItWorks />
    <section aria-labelledby="home-cars-title" className="home-cars home-section">
      <header><h2 id="home-cars-title">{t('home.chooseCarsTitle')}</h2><Link to="/vehicles">{t('home.viewAll')}<ArrowRight aria-hidden="true" size={18} /></Link></header>
      {vehiclesQuery.isLoading && <div aria-label={t('home.loadingVehicles')} className="home-vehicle-grid"><Skeleton rows={2} /></div>}
      {vehiclesQuery.isError && <ErrorState onRetry={() => void vehiclesQuery.refetch()} retryLabel={t('styleguide.retry')} title={t('styleguide.error')} />}
      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && featuredVehicles.length === 0 && <EmptyState description={t('home.emptyVehiclesCopy')} title={t('home.emptyVehiclesTitle')} />}
      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && featuredVehicles.length > 0 && <div className="home-vehicle-grid">{featuredVehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div>}
    </section>
    <FactsBand />
    {APP_PROMO && <AppPromo />}
    <CitySearch />
  </div>
}
