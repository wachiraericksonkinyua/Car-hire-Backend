import type { ReactNode } from 'react'

type Column<T> = { key: string; header: string; render: (row: T) => ReactNode }

export function DataTable<T extends object>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty: ReactNode
}) {
  if (!rows.length) return <>{empty}</>
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td data-label={column.header} key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function KpiCard({ label, value, detail, trend }: { label: string; value: string; detail?: string; trend?: 'up' | 'down' }) {
  return (
    <article className="kpi-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail && <span className={trend ? `kpi-card__detail kpi-card__detail--${trend}` : 'kpi-card__detail'}>{detail}</span>}
    </article>
  )
}

export function Stepper({ steps, activeStep }: { steps: string[]; activeStep: number }) {
  return (
    <ol className="stepper">
      {steps.map((step, index) => (
        <li aria-current={index === activeStep ? 'step' : undefined} className={index <= activeStep ? 'stepper__item is-active' : 'stepper__item'} key={step}>
          <span className="stepper__number">{index + 1}</span><span>{step}</span>
        </li>
      ))}
    </ol>
  )
}