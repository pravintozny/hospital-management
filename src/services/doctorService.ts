import type { AvailabilitySlot, Department, Doctor, DoctorAssignment } from '../domain/types';
import { ConflictError, ValidationError } from '../lib/errors';
import { minutesOfDay } from '../lib/time';
import { isCents } from '../lib/money';
import { required } from '../lib/validate';
import type { Database } from './database';

export interface DoctorInput {
  name: string;
  specialization: string;
  departmentId: string;
  consultationFeeCents: number;
  availability: AvailabilitySlot[];
}

export class DoctorService {
  constructor(private db: Database) {}

  addDepartment(name: string): Department {
    const n = required(name, 'department name');
    if ([...this.db.departments.values()].some((d) => d.name.toLowerCase() === n.toLowerCase()))
      throw new ConflictError(`Department "${n}" already exists`);
    const d: Department = { id: this.db.nextId('DEP'), name: n };
    this.db.departments.set(d.id, d);
    return d;
  }
  listDepartments(): Department[] {
    return [...this.db.departments.values()];
  }

  private validate(input: DoctorInput) {
    this.db.get(this.db.departments, 'Department', input.departmentId);
    if (!isCents(input.consultationFeeCents)) throw new ValidationError('consultation fee must be non-negative cents');
    for (const s of input.availability) {
      if (!Number.isInteger(s.dayOfWeek) || s.dayOfWeek < 0 || s.dayOfWeek > 6)
        throw new ValidationError('dayOfWeek must be 0-6');
      let a: number, b: number;
      try {
        a = minutesOfDay(s.start);
        b = minutesOfDay(s.end);
      } catch (e) {
        throw new ValidationError((e as Error).message);
      }
      if (a >= b) throw new ValidationError('availability start must be before end');
    }
    // Slots on the same day must not overlap each other.
    for (let i = 0; i < input.availability.length; i++)
      for (let j = i + 1; j < input.availability.length; j++) {
        const x = input.availability[i], y = input.availability[j];
        if (x.dayOfWeek === y.dayOfWeek && minutesOfDay(x.start) < minutesOfDay(y.end) && minutesOfDay(y.start) < minutesOfDay(x.end))
          throw new ValidationError('availability slots overlap on the same day');
      }
    return {
      name: required(input.name, 'name'),
      specialization: required(input.specialization, 'specialization'),
      departmentId: input.departmentId,
      consultationFeeCents: input.consultationFeeCents,
      availability: input.availability.map((s) => ({ ...s })),
    };
  }

  create(input: DoctorInput): Doctor {
    const doc: Doctor = { id: this.db.nextId('D'), ...this.validate(input), active: true };
    this.db.doctors.set(doc.id, doc);
    return doc;
  }
  update(id: string, input: DoctorInput): Doctor {
    const doc = { ...this.get(id), ...this.validate(input) };
    this.db.doctors.set(id, doc);
    return doc;
  }
  setActive(id: string, active: boolean): Doctor {
    const doc = { ...this.get(id), active };
    this.db.doctors.set(id, doc);
    return doc;
  }
  get(id: string): Doctor {
    return this.db.get(this.db.doctors, 'Doctor', id);
  }
  list(filter: { departmentId?: string; specialization?: string; activeOnly?: boolean } = {}): Doctor[] {
    return [...this.db.doctors.values()].filter(
      (d) =>
        (!filter.departmentId || d.departmentId === filter.departmentId) &&
        (!filter.specialization || d.specialization.toLowerCase() === filter.specialization.toLowerCase()) &&
        (!filter.activeOnly || d.active),
    );
  }

  assign(doctorId: string, patientId: string): DoctorAssignment {
    const doc = this.get(doctorId);
    this.db.get(this.db.patients, 'Patient', patientId);
    if (!doc.active) throw new ConflictError('Cannot assign patients to an inactive doctor');
    const dup = [...this.db.assignments.values()].find(
      (a) => a.active && a.doctorId === doctorId && a.patientId === patientId,
    );
    if (dup) throw new ConflictError('Patient is already assigned to this doctor');
    const a: DoctorAssignment = {
      id: this.db.nextId('AS'), doctorId, patientId, assignedAt: this.db.now().toISOString(), active: true,
    };
    this.db.assignments.set(a.id, a);
    return a;
  }
  unassign(assignmentId: string): DoctorAssignment {
    const a = { ...this.db.get(this.db.assignments, 'Assignment', assignmentId), active: false };
    this.db.assignments.set(a.id, a);
    return a;
  }
  patientsOf(doctorId: string) {
    return [...this.db.assignments.values()]
      .filter((a) => a.active && a.doctorId === doctorId)
      .map((a) => this.db.patients.get(a.patientId)!);
  }
  doctorsOf(patientId: string) {
    return [...this.db.assignments.values()]
      .filter((a) => a.active && a.patientId === patientId)
      .map((a) => this.db.doctors.get(a.doctorId)!);
  }
}
