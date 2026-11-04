import { useState, type ReactNode } from 'react';

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-header">
          {title && <h3>{title}</h3>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat" data-testid={`stat-${label}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  scheduled: 'info', completed: 'success', cancelled: 'neutral', no_show: 'danger',
  active: 'info', discharged: 'neutral', available: 'success', occupied: 'warning', maintenance: 'danger',
  pending: 'warning', dispensed: 'success', requested: 'warning', sample_collected: 'info',
  issued: 'warning', paid: 'success', void: 'neutral', none: 'neutral', draft: 'warning', final: 'success',
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{status.replace('_', ' ')}</Badge>;
}

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
}
export function DataTable<T>({ columns, rows, rowKey, empty = 'No records' }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: string;
}) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <table className="table">
      <thead>
        <tr>{columns.map((c) => <th key={c.header}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)}>{columns.map((c) => <td key={c.header}>{c.render(r)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Button({ variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button type="button" {...props} className={`btn btn-${variant} ${props.className ?? ''}`} />;
}

export function Alert({ kind, children, onClose }: { kind: 'error' | 'success'; children: ReactNode; onClose?: () => void }) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`alert alert-${kind}`}>
      {children}
      {onClose && <button className="alert-close" aria-label="Dismiss" onClick={onClose}>×</button>}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs<K extends string>({ tabs, active, onChange }: { tabs: { key: K; label: string }[]; active: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="tabs">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={t.key === active} className={t.key === active ? 'tab active' : 'tab'} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Small controlled-form helper: `const f = useFields({a: ''}); <input {...f.bind('a')} />` */
export function useFields<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  return {
    values,
    bind: (k: keyof T) => ({
      value: values[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value })),
    }),
    reset: () => setValues(initial),
  };
}
