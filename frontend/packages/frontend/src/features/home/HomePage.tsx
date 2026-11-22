import { z } from 'zod'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, CarFront, CheckCircle2, DollarSign, MapPin, Star, Wallet } from 'lucide-react'
import { useVehicles } from '../../api/queries'
import type { Vehicle } from '../../api/types'
import { EmptyState, ErrorState, Input, Select, Skeleton } from '../../components/ui'
import { formatKes, toUtc } from '../../lib'
import { t } from '../../i18n'
import { homeFacts } from './homeConfig'

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
  const photos = vehicle.photos?.slice(0, 3) ?? []
  return (
    <article className="home-card group" data-testid={`vehicle-card-${vehicle.id}`}>
      <div className={`home-card-media photo-grid ${photos.length === 0 ? 'photo-grid--empty' : photos.length === 1 ? 'photo-grid--single' : photos.length === 2 ? 'photo-grid--double' : ''}`}>
        {photos.length > 0
          ? photos.map((photo, index) => <img alt={`${vehicle.make} ${vehicle.model} photo ${index + 1}`} className="home-card-photo" key={photo.id} src={photo.url} />)
          : <div className="home-card-photo is-placeholder" />}
        <div className="home-card-badges">
          <span className={`badge badge--${vehicle.status}`}><span />{vehicle.status}</span>
        </div>
      </div>
      <div className="home-card-body">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6f687a]">{vehicle.category ?? 'Vehicle'}</p>
            <h3 className="m-0 mt-1 font-heading text-base font-bold leading-snug">{vehicle.make} {vehicle.model}</h3>
          </div>
          <strong className="home-card-price font-heading text-2xl font-bold leading-none text-[#1d1630]">{formatKes(vehicle.ratePerDay)}</strong>
        </div>
        <p className="m-0 mt-3 text-[13px] text-[#6f687a]">{vehicle.year} · {vehicle.registration} · {vehicle.seats} {t('home.seats')}</p>
        <div className="home-card-actions"><Link className="home-card-view button button--primary" to={`/vehicles/${vehicle.id}`}>{t('styleguide.view')}<ArrowRight aria-hidden="true" size={16} /></Link></div>
      </div>
    </article>
  )
}

function FeatureColumns() {
  return <section aria-label={t('home.featuresLabel')} className="home-section">
    <div className="grid gap-6 md:grid-cols-3">
      {features.map(({ icon: Icon, title, copy }) => (
        <article className="home-feature-card" key={title}>
          <div className="home-feature-icon"><Icon aria-hidden="true" size={26} /></div>
          <h2 className="m-0 mt-5 font-heading text-lg font-bold">{t(title)}</h2>
          <p className="m-0 mt-3 text-[14px] leading-relaxed">{t(copy)}</p>
        </article>
      ))}
    </div>
  </section>
}

function HowItWorks() {
  const steps = [
    { icon: CalendarDays, title: t('home.howStep1'), copy: t('home.howCopy1') },
    { icon: CarFront, title: t('home.howStep2'), copy: t('home.howCopy2') },
    { icon: CheckCircle2, title: t('home.howStep3'), copy: t('home.howCopy3') },
    { icon: MapPin, title: t('home.howStep4'), copy: t('home.howCopy4') },
  ] as const
  return <section className="home-section">
    <h2 className="home-section-title">{t('home.howTitle')}</h2>
    <div className="home-grid-3">
      {steps.map((step, index) => (
        <div className="home-step" key={step.title}>
          <span className="home-step-number">{index + 1}</span>
          <span className={`home-step-icon ${index === 0 ? 'is-calendar' : index === 1 ? 'is-car' : index === 2 ? 'is-check' : 'is-map'}`}><step.icon aria-hidden="true" size={24} /></span>
          <div><h3>{step.title}</h3><p>{step.copy}</p></div>
        </div>
      ))}
    </div>
  </section>
}

function StatsStrip({ vehicles, featuredCount }: { vehicles: number; featuredCount: number }) {
  return <div className="home-stats" aria-label="Gari Poa facts">
    <div className="home-stat is-primary"><span className="home-stat-value"><CarFront aria-hidden="true" size={22} />{vehicles}</span><span className="home-stat-label">{t('home.factCars')}</span></div>
    <div className="home-stat"><span className="home-stat-value"><CheckCircle2 aria-hidden="true" size={22} />{featuredCount}</span><span className="home-stat-label">{t('home.factFeatured')}</span></div>
    <div className="home-stat"><span className="home-stat-value"><Star aria-hidden="true" size={22} />4.8</span><span className="home-stat-label">{t('home.factRating')}</span></div>
    <div className="home-stat"><span className="home-stat-value"><DollarSign aria-hidden="true" size={22} />{homeFacts[2]?.value}</span><span className="home-stat-label">{t('home.factYears')}</span></div>
  </div>
}

function FactsBand() {
  const facts = homeFacts
  return <section className="home-section">
    <div className="home-facts">
      <h2 className="home-facts-title">{t('home.factsTitle')}</h2>
      <p className="home-facts-sub">{t('home.factsCopy')}</p>
      <div className="home-facts-grid">
        {facts.map((fact, index) => {
          const Icon = [CarFront, MapPin, Star, DollarSign][index]
          return <article className="home-fact-card" key={fact.key}><Icon aria-hidden="true" size={26} /><strong>{fact.value}</strong><small>{t(`home.fact${fact.key[0].toUpperCase()}${fact.key.slice(1)}`)}</small></article>
        })}
      </div>
    </div>
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
    <div className="home-booking-card__head">
      <div><p className="home-booking-kicker">{t('home.bookYourCar')}</p><h2 className="home-booking-card__title">{t('home.chooseCar')}</h2><p className="home-booking-card__sub">{t('home.chooseCarSub')}</p></div>
      <button className="home-booking-card__cta" type="submit">
        {t('home.bookNow')}
        <span aria-hidden="true" className="home-booking-card__arrow"><ArrowRight size={18} /></span>
      </button>
    </div>
    <div className="home-booking-grid">
      <Select error={errors.category} label={t('home.carType')} onChange={(event) => update('category', event.target.value)} options={[{ value: '', label: t('home.chooseCarType') }, ...categories.map((category) => ({ value: category, label: category }))]} value={values.category} />
      <Input error={errors.pickup} label={t('home.placeRental')} onChange={(event) => update('pickup', event.target.value)} placeholder={t('home.placeRentalPlaceholder')} value={values.pickup} />
      <Input error={errors.returnLocation} label={t('home.placeReturn')} onChange={(event) => update('returnLocation', event.target.value)} placeholder={t('home.placeReturnPlaceholder')} value={values.returnLocation} />
      <Input error={errors.rentalAt} label={t('home.rentalDate')} onChange={(event) => update('rentalAt', event.target.value)} type="datetime-local" value={values.rentalAt} />
      <Input error={errors.returnAt} label={t('home.returnDate')} onChange={(event) => update('returnAt', event.target.value)} type="datetime-local" value={values.returnAt} />
    </div>
    {errors.category && <p className="home-form-error" role="alert">{errors.category}</p>}
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
  return <section className="home-city">
    <div className="home-city__head">
      <h2>{t('home.cityTitle')}</h2>
      <p>{t('home.cityCopy')}</p>
    </div>
    <form className="home-city__form" onSubmit={submit}>
      <label className="home-city__input"><input value={city} onChange={(event) => { setCity(event.target.value); setError(false) }} placeholder={t('home.cityPlaceholder')} /></label>
      <button className="home-city__go" type="submit">{t('home.searchCity')}</button>
    </form>
    {error && <p className="home-form-error" role="alert">{t('home.cityRequired')}</p>}
  </section>
}

export function HomePage() {
  const vehiclesQuery = useVehicles()
  const vehicles = vehiclesQuery.data ?? []
  const categories = [...new Set(vehicles.map((vehicle) => vehicle.category ?? '').filter((category) => category.length > 0))].sort()
  const featuredVehicles = vehicles.filter((vehicle) => vehicle.status === 'available').slice(0, 6)

  return <div className="home-page">
    <section aria-labelledby="home-hero-title" className="home-hero">
      <div className="home-hero__copy">
        <h1 className="home-hero__title">{t('home.heroTitle')}</h1>
        <p className="home-hero__support">{t('home.heroSupport')}</p>
      </div>
      <div className="home-hero__card">
        <HeroBookingForm categories={categories} />
        <div className="home-hero-stats">
          <span className="home-stat-box"><span className="home-stat-box__value"><CarFront aria-hidden="true" size={22} />{vehicles.length}</span><span className="home-stat-box__label">{t('home.statCars')}</span></span>
          <span className="home-stat-box"><span className="home-stat-box__value"><CheckCircle2 aria-hidden="true" size={22} />{featuredVehicles.length}</span><span className="home-stat-box__label">{t('home.statFeatured')}</span></span>
          <span className="home-stat-box"><span className="home-stat-box__value"><Star aria-hidden="true" size={22} />4.8</span><span className="home-stat-box__label">{t('home.factRating')}</span></span>
        </div>
      </div>
    </section>

    <StatsStrip vehicles={vehicles.length} featuredCount={featuredVehicles.length} />

    <FeatureColumns />
    <HowItWorks />

    <section aria-labelledby="home-cars-title" className="home-cars">
      <header><h2 id="home-cars-title">{t('home.chooseCarsTitle')}</h2><Link to="/vehicles">{t('home.viewAll')}<ArrowRight aria-hidden="true" size={18} /></Link></header>
      {vehiclesQuery.isLoading && <div aria-label={t('home.loadingVehicles')} className="home-vehicle-grid"><Skeleton rows={2} /></div>}
      {vehiclesQuery.isError && <ErrorState onRetry={() => void vehiclesQuery.refetch()} retryLabel={t('styleguide.retry')} title={t('styleguide.error')} />}
      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && featuredVehicles.length === 0 && <EmptyState description={t('home.emptyVehiclesCopy')} title={t('home.emptyVehiclesTitle')} />}
      {!vehiclesQuery.isLoading && !vehiclesQuery.isError && featuredVehicles.length > 0 && <div className="home-vehicle-grid">{featuredVehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} />)}</div>}
    </section>

    <FactsBand />
    <CitySearch />
  </div>
}
