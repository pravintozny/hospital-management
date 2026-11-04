import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Alert, Badge, DataTable, ProgressBar, StatCard, StatusBadge, Tabs } from '.';

describe('reusable components', () => {
  it('DataTable renders rows and an empty state', () => {
    const cols = [{ header: 'Name', render: (r: { n: string }) => r.n }];
    const { rerender } = render(<DataTable columns={cols} rows={[{ n: 'A' }, { n: 'B' }]} rowKey={(r) => r.n} />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    rerender(<DataTable columns={cols} rows={[]} rowKey={(r) => r.n} empty="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
  it('StatCard shows label, value and hint', () => {
    render(<StatCard label="Patients" value={12} hint="3 admitted" />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3 admitted')).toBeInTheDocument();
  });
  it('StatusBadge humanises status and Badge applies tone', () => {
    render(<><StatusBadge status="no_show" /><Badge tone="danger">Low</Badge></>);
    expect(screen.getByText('no show')).toHaveClass('badge-danger');
    expect(screen.getByText('Low')).toHaveClass('badge-danger');
  });
  it('ProgressBar clamps values', () => {
    render(<ProgressBar label="occ" value={1.7} />);
    expect(screen.getByRole('progressbar', { name: 'occ' })).toHaveAttribute('aria-valuenow', '100');
  });
  it('Alert exposes role and dismiss', () => {
    const onClose = vi.fn();
    render(<Alert kind="error" onClose={onClose}>Boom</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onClose).toHaveBeenCalled();
  });
  it('Tabs switch selection', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]} active="a" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
