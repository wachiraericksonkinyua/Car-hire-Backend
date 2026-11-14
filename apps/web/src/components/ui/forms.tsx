import { useId, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { toUtc } from '../../lib/format'
import { t } from '../../i18n'

type LabeledProps = { label: string; error?: string; hint?: string }
type InputProps = InputHTMLAttributes<HTMLInputElement> & LabeledProps

export function Input({ label, error, hint, id, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input aria-invalid={Boolean(error)} className="control" id={inputId} {...props} />
      {error && <span className="field__error">{error}</span>}
      {!error && hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

type PhoneInputProps = LabeledProps & {
  value: string
  onChange: (value: string) => void
  id?: string
}

export function PhoneInput({ label, value, onChange, error, hint, id }: PhoneInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const localDigits = value.replace(/\D/g, '').replace(/^254/, '').replace(/^0/, '').slice(0, 9)
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <span className="phone-control">
        <span aria-hidden="true">+254</span>
        <input
          aria-invalid={Boolean(error)}
          autoComplete="tel-national"
          className="control"
          id={inputId}
          inputMode="numeric"
          onChange={(event) => onChange(`254${event.target.value.replace(/\D/g, '').slice(0, 9)}`)}
          pattern="[17][0-9]{8}"
          value={localDigits}
        />
      </span>
      {error && <span className="field__error">{error}</span>}
      {!error && hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

type MoneyInputProps = LabeledProps & {
  value: number | null
  onChange: (value: number | null) => void
  id?: string
}

export function MoneyInput({ label, value, onChange, error, hint, id }: MoneyInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <span className="money-control">
        <span aria-hidden="true">KES</span>
        <input
          aria-invalid={Boolean(error)}
          className="control"
          id={inputId}
          inputMode="numeric"
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '')
            onChange(digits ? Number(digits) : null)
          }}
          value={value === null ? '' : new Intl.NumberFormat('en-KE').format(value)}
        />
      </span>
      {error && <span className="field__error">{error}</span>}
      {!error && hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & LabeledProps & {
  options: { value: string; label: string }[]
}

export function Select({ label, options, error, hint, id, ...props }: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  return (
    <label className="field" htmlFor={selectId}>
      <span className="field__label">{label}</span>
      <select aria-invalid={Boolean(error)} className="control" id={selectId} {...props}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error && <span className="field__error">{error}</span>}
      {!error && hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

type ChoiceProps = { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }

export function Checkbox({ label, checked, onChange, disabled }: ChoiceProps) {
  return <label className="choice"><input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" /><span>{label}</span></label>
}

export function Switch({ label, checked, onChange, disabled }: ChoiceProps) {
  return (
    <label className="choice">
      <button aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)} role="switch" type="button">
        <span />
      </button>
      <span>{label}</span>
    </label>
  )
}

type DateTimeRangePickerProps = {
  label: string
  startUtc: string
  endUtc: string
  onChange: (range: { startUtc: string; endUtc: string }) => void
}

export function DateTimeRangePicker({ label, startUtc, endUtc, onChange }: DateTimeRangePickerProps) {
  const startId = useId()
  const endId = useId()
  const toLocalInput = (value: string) => value ? formatInTimeZone(value, 'Africa/Nairobi', "yyyy-MM-dd'T'HH:mm") : ''
  return (
    <fieldset className="field range-picker">
      <legend className="field__label">{label}</legend>
      <label htmlFor={startId}>{t('phone.from')}
        <input className="control" id={startId} onChange={(event) => onChange({ startUtc: event.target.value ? toUtc(event.target.value) : '', endUtc })} type="datetime-local" value={toLocalInput(startUtc)} />
      </label>
      <label htmlFor={endId}>{t('phone.to')}
        <input className="control" id={endId} onChange={(event) => onChange({ startUtc, endUtc: event.target.value ? toUtc(event.target.value) : '' })} type="datetime-local" value={toLocalInput(endUtc)} />
      </label>
    </fieldset>
  )
}

type FileUploaderProps = { label: string; accept?: string; multiple?: boolean; onFiles: (files: FileList | null) => void }

export function FileUploader({ label, accept, multiple = false, onFiles }: FileUploaderProps) {
  const inputId = useId()
  return (
    <label className="file-uploader" htmlFor={inputId}>
      <input accept={accept} id={inputId} multiple={multiple} onChange={(event) => onFiles(event.target.files)} type="file" />
      <span>{label}</span>
    </label>
  )
}