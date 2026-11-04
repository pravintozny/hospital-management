import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { createServices } from './services';
import { seed } from './services/seed';
import { NOW } from './test/helpers';

const setup = () => {
  const services = createServices(() => NOW);
  seed(services);
  render(<App services={services} />);
  return services;
};
const go = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('App', () => {
  it('shows the dashboard with seeded statistics', () => {
    setup();
    expect(screen.getByTestId('stat-Patients')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-Bed occupancy')).toHaveTextContent('0%');
    expect(screen.getByText(/Amoxicillin 250mg: 40 left/)).toBeInTheDocument();
  });

  it('registers a patient and shows validation errors from the domain layer', () => {
    const s = setup();
    go('Patients');
    click('Register');
    expect(screen.getByRole('alert')).toHaveTextContent('name is required');
    type('Name', 'Jane Doe'); type('Age', '33'); type('Phone', '+1 555-0123'); type('Address', '5 Elm');
    type('Emergency contact name', 'John'); type('Emergency contact relationship', 'Brother'); type('Emergency contact phone', '+1 555-0124');
    click('Register');
    expect(screen.getByRole('status')).toHaveTextContent('Patient registered');
    expect(s.patients.search('Jane')).toHaveLength(1);
    expect(screen.getByText('Profile: Jane Doe')).toBeInTheDocument();
  });

  it('books an appointment and blocks an overlapping one', () => {
    const s = setup();
    go('Appointments');
    const book = (patient: string) => {
      type('Patient', patient); type('Doctor', 'D-0001'); type('Start (YYYY-MM-DDTHH:mm)', '2026-01-05T09:00'); type('Reason', 'Checkup');
      click('Book');
    };
    book('P-0001');
    expect(screen.getByRole('status')).toHaveTextContent('Appointment scheduled');
    book('P-0002');
    expect(screen.getByRole('alert')).toHaveTextContent('Doctor already has an appointment');
    expect(s.appointments.list()).toHaveLength(1);
  });

  it('admits and discharges, updating bed availability and history', () => {
    const s = setup();
    go('Admissions');
    type('Patient', 'P-0001'); type('Attending doctor', 'D-0001'); type('Bed', 'B-0001'); type('Reason', 'Observation');
    click('Admit');
    expect(s.db.beds.get('B-0001')!.status).toBe('occupied');
    const history = screen.getByText('Admission history').closest('section')!;
    click('Discharge');
    expect(within(history).getByText('discharged')).toBeInTheDocument();
    expect(s.db.beds.get('B-0001')!.status).toBe('available');
  });

  it('previews and creates an invoice from completed work', () => {
    const s = setup();
    const ap = s.appointments.schedule({ patientId: 'P-0001', doctorId: 'D-0001', start: '2026-01-05T09:00', durationMinutes: 30, reason: 'x' });
    s.appointments.complete(ap.id);
    go('Billing');
    type('Patient', 'P-0001');
    const preview = screen.getByLabelText('Invoice preview');
    expect(preview).toHaveTextContent('$150.00'); // fee
    expect(preview).toHaveTextContent('$157.50'); // + 5% tax
    click('Create invoice');
    expect(s.billing.list()).toHaveLength(1);
    click('Mark paid');
    expect(s.billing.list()[0].status).toBe('paid');
  });

  it('dispenses a prescription and updates stock', () => {
    const s = setup();
    const rx = s.pharmacy.prescribe({ patientId: 'P-0001', doctorId: 'D-0001', items: [{ medicineId: 'M-0001', quantity: 10, dosage: '1x' }] });
    go('Pharmacy');
    click('Dispense');
    expect(s.pharmacy.getPrescription(rx.id).status).toBe('dispensed');
    expect(s.pharmacy.sellableStock('M-0001')).toBe(390);
  });

  it('walks a lab request through to a final report', () => {
    const s = setup();
    go('Laboratory');
    type('Patient', 'P-0001'); type('Requesting doctor', 'D-0001'); type('Test', 'LT-0001');
    click('Request');
    click('Collect sample');
    click('Enter result');
    type('Result value', '13.5'); type('Result unit', 'g/dL');
    click('Save draft');
    click('Finalise');
    expect(s.lab.list()[0]).toMatchObject({ status: 'completed', reportStatus: 'final' });
  });
});
