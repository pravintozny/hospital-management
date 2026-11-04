import type { Appointment, AppointmentStatus } from '../domain/types';
import { ConflictError, ValidationError } from '../lib/errors';
import { dayOfWeek, datePart, isLocalDateTime, minutesOfDay, overlaps, parseLocal, timeOfDay, toLocalString } from '../lib/time';
import { required } from '../lib/validate';
import type { Database } from './database';

export interface BookingInput {
  patientId: string;
  doctorId: string;
  start: string;
  durationMinutes: number;
  reason: string;
}

/** Allowed status transitions. Terminal states have none. */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export class AppointmentService {
  constructor(private db: Database) {}

  get(id: string): Appointment {
    return this.db.get(this.db.appointments, 'Appointment', id);
  }
  list(filter: { patientId?: string; doctorId?: string; status?: AppointmentStatus; date?: string } = {}): Appointment[] {
    return [...this.db.appointments.values()]
      .filter(
        (a) =>
          (!filter.patientId || a.patientId === filter.patientId) &&
          (!filter.doctorId || a.doctorId === filter.doctorId) &&
          (!filter.status || a.status === filter.status) &&
          (!filter.date || datePart(a.start) === filter.date),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** Throws if the window is invalid, outside doctor availability, in the past, or overlaps another booking. */
  private checkSlot(doctorId: string, patientId: string, start: string, end: string, ignoreId?: string) {
    const doc = this.db.get(this.db.doctors, 'Doctor', doctorId);
    if (!doc.active) throw new ConflictError('Doctor is not active');
    if (!isLocalDateTime(start) || !isLocalDateTime(end)) throw new ValidationError('Invalid date/time');
    const s = parseLocal(start), e = parseLocal(end);
    if (e <= s) throw new ValidationError('End must be after start');
    if (datePart(start) !== datePart(end)) throw new ValidationError('Appointment must not span multiple days');
    if (start < toLocalString(this.db.now())) throw new ValidationError('Appointment cannot be in the past');

    const day = dayOfWeek(start);
    const within = doc.availability.some(
      (a) => a.dayOfWeek === day && timeOfDay(start) >= minutesOfDay(a.start) && timeOfDay(end) <= minutesOfDay(a.end),
    );
    if (!within) throw new ConflictError('Doctor is not available at the requested time');

    for (const other of this.db.appointments.values()) {
      if (other.id === ignoreId || other.status !== 'scheduled') continue;
      if (!overlaps(s, e, parseLocal(other.start), parseLocal(other.end))) continue;
      if (other.doctorId === doctorId) throw new ConflictError('Doctor already has an appointment in this time range');
      if (other.patientId === patientId) throw new ConflictError('Patient already has an appointment in this time range');
    }
  }

  private endOf(start: string, duration: number): string {
    if (!Number.isInteger(duration) || duration < 5 || duration > 480)
      throw new ValidationError('duration must be 5-480 minutes');
    if (!isLocalDateTime(start)) throw new ValidationError('Invalid date/time');
    return toLocalString(new Date((parseLocal(start) + duration) * 60000));
  }

  schedule(input: BookingInput): Appointment {
    this.db.get(this.db.patients, 'Patient', input.patientId);
    const doc = this.db.get(this.db.doctors, 'Doctor', input.doctorId);
    const end = this.endOf(input.start, input.durationMinutes);
    this.checkSlot(input.doctorId, input.patientId, input.start, end);
    const appt: Appointment = {
      id: this.db.nextId('AP'),
      patientId: input.patientId,
      doctorId: input.doctorId,
      start: input.start,
      end,
      reason: required(input.reason, 'reason'),
      status: 'scheduled',
      feeCents: doc.consultationFeeCents,
      rescheduleCount: 0,
    };
    this.db.appointments.set(appt.id, appt);
    return appt;
  }

  reschedule(id: string, newStart: string, durationMinutes?: number): Appointment {
    const appt = this.get(id);
    if (appt.status !== 'scheduled') throw new ConflictError(`Cannot reschedule a ${appt.status} appointment`);
    const duration = durationMinutes ?? parseLocal(appt.end) - parseLocal(appt.start);
    const end = this.endOf(newStart, duration);
    this.checkSlot(appt.doctorId, appt.patientId, newStart, end, id);
    const updated = { ...appt, start: newStart, end, rescheduleCount: appt.rescheduleCount + 1 };
    this.db.appointments.set(id, updated);
    return updated;
  }

  cancel(id: string, reason = ''): Appointment {
    return this.transition(id, 'cancelled', { cancelReason: reason.trim() || undefined });
  }
  complete(id: string): Appointment {
    return this.transition(id, 'completed');
  }
  markNoShow(id: string): Appointment {
    return this.transition(id, 'no_show');
  }

  private transition(id: string, to: AppointmentStatus, extra: Partial<Appointment> = {}): Appointment {
    const appt = this.get(id);
    if (!TRANSITIONS[appt.status].includes(to))
      throw new ConflictError(`Invalid status change: ${appt.status} -> ${to}`);
    const updated = { ...appt, ...extra, status: to };
    this.db.appointments.set(id, updated);
    return updated;
  }

  /** Free start times (every `stepMinutes`) for a doctor on a date, honouring availability and existing bookings. */
  availableSlots(doctorId: string, date: string, durationMinutes = 30, stepMinutes = 30): string[] {
    const doc = this.db.get(this.db.doctors, 'Doctor', doctorId);
    if (!doc.active) return [];
    const day = dayOfWeek(`${date}T00:00`);
    const out: string[] = [];
    for (const slot of doc.availability.filter((a) => a.dayOfWeek === day)) {
      for (let m = minutesOfDay(slot.start); m + durationMinutes <= minutesOfDay(slot.end); m += stepMinutes) {
        const start = `${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const end = this.endOf(start, durationMinutes);
        try {
          this.checkSlot(doctorId, '', start, end);
          out.push(start);
        } catch {
          /* slot unavailable */
        }
      }
    }
    return out;
  }
}
