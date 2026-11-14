export type TabOption = { value: string; label: string; disabled?: boolean }
type TabsProps = { label: string; value: string; options: TabOption[]; onChange: (value: string) => void }

export function Tabs({ label, value, options, onChange }: TabsProps) {
  return (
    <div aria-label={label} className="tabs" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={value === option.value}
          className="tabs__item"
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function PillTabs(props: TabsProps) {
  return (
    <div aria-label={props.label} className="pill-tabs" role="tablist">
      {props.options.map((option) => (
        <button
          aria-selected={props.value === option.value}
          className="pill-tabs__item"
          disabled={option.disabled}
          key={option.value}
          onClick={() => props.onChange(option.value)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}