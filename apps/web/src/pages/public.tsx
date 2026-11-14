import { useTranslation } from '../i18n'
import { PagePlaceholder } from './PagePlaceholder'
import { SOSButton } from '../features/incidents/SOSButton'

export function VehiclesPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.vehicles')} /> }
export function VehicleDetailsPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.vehicleDetails')} /> }
export function AboutPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.about')} /> }
export function ContactPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.contact')} /> }
export function CheckoutPage() { const { t } = useTranslation(); return <PagePlaceholder title={t('page.checkout')} /> }
export function BookingPage() { const { t } = useTranslation(); return <><PagePlaceholder title={t('page.booking')} /><aside className="public-sos-action"><p>Need roadside help?</p><SOSButton source="customer" label="Send SOS" /></aside></> }