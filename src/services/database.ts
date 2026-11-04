import type {
  Admission, Appointment, Bed, Department, Doctor, DoctorAssignment, Invoice, LabRequest, LabTest,
  Medicine, MedicineBatch, Patient, Prescription, Room, Ward,
} from '../domain/types';
import { NotFoundError } from '../lib/errors';

export type Clock = () => Date;

/** In-memory store shared by all services (mock persistence layer). */
export class Database {
  patients = new Map<string, Patient>();
  departments = new Map<string, Department>();
  doctors = new Map<string, Doctor>();
  assignments = new Map<string, DoctorAssignment>();
  appointments = new Map<string, Appointment>();
  wards = new Map<string, Ward>();
  rooms = new Map<string, Room>();
  beds = new Map<string, Bed>();
  admissions = new Map<string, Admission>();
  medicines = new Map<string, Medicine>();
  batches = new Map<string, MedicineBatch>();
  prescriptions = new Map<string, Prescription>();
  labTests = new Map<string, LabTest>();
  labRequests = new Map<string, LabRequest>();
  invoices = new Map<string, Invoice>();

  private counters = new Map<string, number>();
  constructor(public readonly clock: Clock = () => new Date()) {}

  nextId(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }
  now(): Date {
    return this.clock();
  }
  get<T>(map: Map<string, T>, entity: string, id: string): T {
    const v = map.get(id);
    if (!v) throw new NotFoundError(entity, id);
    return v;
  }
}
