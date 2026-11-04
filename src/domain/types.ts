/** Domain model. IDs are prefixed strings (P-0001, D-0001...). Money is integer cents. */
export type Id = string;
export type Gender = 'male' | 'female' | 'other';

// ---- Patients ----
export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}
export interface MedicalHistoryEntry {
  id: Id;
  date: string; // YYYY-MM-DD
  type: 'condition' | 'allergy' | 'surgery' | 'medication' | 'note';
  description: string;
}
export interface Patient {
  id: Id;
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  email?: string;
  address: string;
  emergencyContact: EmergencyContact;
  medicalHistory: MedicalHistoryEntry[];
  registeredAt: string;
}

// ---- Doctors ----
export interface Department {
  id: Id;
  name: string;
}
export interface AvailabilitySlot {
  dayOfWeek: number; // 0=Sunday..6=Saturday
  start: string; // HH:mm
  end: string; // HH:mm
}
export interface Doctor {
  id: Id;
  name: string;
  specialization: string;
  departmentId: Id;
  consultationFeeCents: number;
  availability: AvailabilitySlot[];
  active: boolean;
}
export interface DoctorAssignment {
  id: Id;
  doctorId: Id;
  patientId: Id;
  assignedAt: string;
  active: boolean;
}

// ---- Appointments ----
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export interface Appointment {
  id: Id;
  patientId: Id;
  doctorId: Id;
  start: string; // YYYY-MM-DDTHH:mm
  end: string;
  reason: string;
  status: AppointmentStatus;
  /** Fee snapshot taken at booking so later fee changes do not alter history. */
  feeCents: number;
  rescheduleCount: number;
  cancelReason?: string;
  invoiceId?: Id;
}

// ---- Admissions ----
export type BedStatus = 'available' | 'occupied' | 'maintenance';
export interface Ward {
  id: Id;
  name: string;
  type: 'general' | 'icu' | 'maternity' | 'pediatric' | 'private';
}
export interface Room {
  id: Id;
  wardId: Id;
  number: string;
}
export interface Bed {
  id: Id;
  roomId: Id;
  label: string;
  dailyRateCents: number;
  status: BedStatus;
}
export interface Admission {
  id: Id;
  patientId: Id;
  doctorId: Id;
  bedId: Id;
  reason: string;
  admittedAt: string;
  dischargedAt?: string;
  status: 'active' | 'discharged';
  dailyRateCents: number; // snapshot
  dischargeSummary?: string;
  invoiceId?: Id;
}

// ---- Pharmacy ----
export interface Medicine {
  id: Id;
  name: string;
  sku: string;
  unitPriceCents: number;
  reorderLevel: number;
}
export interface MedicineBatch {
  id: Id;
  medicineId: Id;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  quantity: number;
}
export interface PrescriptionItem {
  medicineId: Id;
  quantity: number;
  dosage: string;
  unitPriceCents?: number; // snapshot at dispense
}
export interface Prescription {
  id: Id;
  patientId: Id;
  doctorId: Id;
  appointmentId?: Id;
  items: PrescriptionItem[];
  status: 'pending' | 'dispensed' | 'cancelled';
  createdAt: string;
  dispensedAt?: string;
  invoiceId?: Id;
}

// ---- Laboratory ----
export interface LabTest {
  id: Id;
  code: string;
  name: string;
  priceCents: number;
}
export type LabRequestStatus = 'requested' | 'sample_collected' | 'completed' | 'cancelled';
export type ReportStatus = 'none' | 'draft' | 'final';
export interface LabResult {
  value: string;
  unit?: string;
  referenceRange?: string;
  notes?: string;
}
export interface LabRequest {
  id: Id;
  patientId: Id;
  doctorId: Id;
  testId: Id;
  priceCents: number; // snapshot
  status: LabRequestStatus;
  requestedAt: string;
  sampleId?: string;
  sampleCollectedAt?: string;
  result?: LabResult;
  reportStatus: ReportStatus;
  invoiceId?: Id;
}

// ---- Billing ----
export type ChargeCategory = 'consultation' | 'room' | 'medicine' | 'laboratory';
export type SourceType = 'appointment' | 'admission' | 'prescription' | 'lab_request';
export interface InvoiceLine {
  category: ChargeCategory;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  sourceType: SourceType;
  sourceId: Id;
}
export type Discount = { type: 'percent'; bps: number } | { type: 'fixed'; cents: number };
export interface Invoice {
  id: Id;
  patientId: Id;
  lines: InvoiceLine[];
  subtotalCents: number;
  discount: Discount | null;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  status: 'issued' | 'paid' | 'void';
  createdAt: string;
  paidAt?: string;
}
