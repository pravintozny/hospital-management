import { AdmissionService } from './admissionService';
import { AppointmentService } from './appointmentService';
import { BillingService } from './billingService';
import { Database, type Clock } from './database';
import { DoctorService } from './doctorService';
import { LabService } from './labService';
import { PatientService } from './patientService';
import { PharmacyService } from './pharmacyService';
import { ReportingService } from './reportingService';

export function createServices(clock?: Clock) {
  const db = new Database(clock);
  const patients = new PatientService(db);
  const doctors = new DoctorService(db);
  const appointments = new AppointmentService(db);
  const admissions = new AdmissionService(db);
  const pharmacy = new PharmacyService(db);
  const lab = new LabService(db);
  const billing = new BillingService(db);
  const reporting = new ReportingService(db, admissions, pharmacy);
  return { db, patients, doctors, appointments, admissions, pharmacy, lab, billing, reporting };
}
export type Services = ReturnType<typeof createServices>;
