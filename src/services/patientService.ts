import type { EmergencyContact, Gender, MedicalHistoryEntry, Patient } from '../domain/types';
import { ValidationError } from '../lib/errors';
import { isoDate } from '../lib/time';
import { email, phone, required } from '../lib/validate';
import type { Database } from './database';

export interface PatientInput {
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  email?: string;
  address: string;
  emergencyContact: EmergencyContact;
}

export class PatientService {
  constructor(private db: Database) {}

  private validate(input: PatientInput): Omit<Patient, 'id' | 'medicalHistory' | 'registeredAt'> {
    if (!Number.isInteger(input.age) || input.age < 0 || input.age > 130)
      throw new ValidationError('age must be an integer between 0 and 130');
    if (!['male', 'female', 'other'].includes(input.gender)) throw new ValidationError('gender is invalid');
    const ec = input.emergencyContact ?? ({} as EmergencyContact);
    return {
      name: required(input.name, 'name'),
      age: input.age,
      gender: input.gender,
      phone: phone(input.phone, 'phone'),
      email: email(input.email, 'email'),
      address: required(input.address, 'address'),
      emergencyContact: {
        name: required(ec.name, 'emergency contact name'),
        relationship: required(ec.relationship, 'emergency contact relationship'),
        phone: phone(ec.phone, 'emergency contact phone'),
      },
    };
  }

  register(input: PatientInput): Patient {
    const data = this.validate(input);
    const patient: Patient = {
      id: this.db.nextId('P'),
      ...data,
      medicalHistory: [],
      registeredAt: this.db.now().toISOString(),
    };
    this.db.patients.set(patient.id, patient);
    return patient;
  }
  get(id: string): Patient {
    return this.db.get(this.db.patients, 'Patient', id);
  }
  update(id: string, input: PatientInput): Patient {
    const existing = this.get(id);
    const updated: Patient = { ...existing, ...this.validate(input) };
    this.db.patients.set(id, updated);
    return updated;
  }
  /** Case-insensitive search over id, name and phone. */
  search(query = ''): Patient[] {
    const q = query.trim().toLowerCase();
    return [...this.db.patients.values()].filter(
      (p) => !q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.phone.includes(q),
    );
  }
  addHistory(id: string, entry: Omit<MedicalHistoryEntry, 'id'>): MedicalHistoryEntry {
    const patient = this.get(id);
    const e: MedicalHistoryEntry = {
      id: this.db.nextId('MH'),
      date: entry.date || isoDate(this.db.now()),
      type: entry.type,
      description: required(entry.description, 'description'),
    };
    patient.medicalHistory = [...patient.medicalHistory, e];
    return e;
  }
}
