import type { Services } from './index';

/** Populates demo data through the public services so every business rule is exercised. */
export function seed(s: Services): void {
  const cardio = s.doctors.addDepartment('Cardiology');
  const gen = s.doctors.addDepartment('General Medicine');
  const weekdays = [1, 2, 3, 4, 5];
  const d1 = s.doctors.create({
    name: 'Dr. Asha Rao', specialization: 'Cardiologist', departmentId: cardio.id, consultationFeeCents: 15000,
    availability: weekdays.map((dayOfWeek) => ({ dayOfWeek, start: '09:00', end: '13:00' })),
  });
  const d2 = s.doctors.create({
    name: 'Dr. Liam Chen', specialization: 'General Physician', departmentId: gen.id, consultationFeeCents: 8000,
    availability: weekdays.map((dayOfWeek) => ({ dayOfWeek, start: '10:00', end: '17:00' })),
  });
  const p1 = s.patients.register({
    name: 'Maria Garcia', age: 54, gender: 'female', phone: '+1 555-0101', email: 'maria@example.com',
    address: '12 Oak Street, Springfield', emergencyContact: { name: 'Jose Garcia', relationship: 'Spouse', phone: '+1 555-0102' },
  });
  const p2 = s.patients.register({
    name: 'Tom Baker', age: 29, gender: 'male', phone: '+1 555-0111',
    address: '88 Pine Avenue, Springfield', emergencyContact: { name: 'Ann Baker', relationship: 'Mother', phone: '+1 555-0112' },
  });
  s.patients.addHistory(p1.id, { date: '2024-03-02', type: 'condition', description: 'Hypertension' });
  s.patients.addHistory(p1.id, { date: '2022-07-19', type: 'allergy', description: 'Penicillin' });
  s.doctors.assign(d1.id, p1.id);
  s.doctors.assign(d2.id, p2.id);

  const ward = s.admissions.addWard('General Ward A', 'general');
  const icu = s.admissions.addWard('ICU', 'icu');
  const r1 = s.admissions.addRoom(ward.id, '101');
  const r2 = s.admissions.addRoom(icu.id, 'ICU-1');
  s.admissions.addBed(r1.id, 'A', 5000);
  s.admissions.addBed(r1.id, 'B', 5000);
  s.admissions.addBed(r2.id, 'A', 25000);

  const para = s.pharmacy.addMedicine({ name: 'Paracetamol 500mg', sku: 'PARA-500', unitPriceCents: 50, reorderLevel: 100 });
  const amox = s.pharmacy.addMedicine({ name: 'Amoxicillin 250mg', sku: 'AMOX-250', unitPriceCents: 120, reorderLevel: 50 });
  const year = s.db.now().getUTCFullYear();
  s.pharmacy.receiveBatch({ medicineId: para.id, batchNumber: 'PB-1', expiryDate: `${year + 1}-06-30`, quantity: 400 });
  s.pharmacy.receiveBatch({ medicineId: amox.id, batchNumber: 'AB-1', expiryDate: `${year + 1}-01-31`, quantity: 40 });

  s.lab.addTest({ code: 'CBC', name: 'Complete Blood Count', priceCents: 2500 });
  s.lab.addTest({ code: 'LIPID', name: 'Lipid Profile', priceCents: 4000 });
}
