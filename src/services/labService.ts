import type { LabRequest, LabResult, LabTest } from '../domain/types';
import { ConflictError, ValidationError } from '../lib/errors';
import { isCents } from '../lib/money';
import { required } from '../lib/validate';
import type { Database } from './database';

export class LabService {
  constructor(private db: Database) {}

  addTest(input: { code: string; name: string; priceCents: number }): LabTest {
    const code = required(input.code, 'code').toUpperCase();
    if ([...this.db.labTests.values()].some((t) => t.code === code)) throw new ConflictError(`Test code ${code} already exists`);
    if (!isCents(input.priceCents)) throw new ValidationError('price must be non-negative cents');
    const t: LabTest = { id: this.db.nextId('LT'), code, name: required(input.name, 'name'), priceCents: input.priceCents };
    this.db.labTests.set(t.id, t);
    return t;
  }
  updatePrice(testId: string, priceCents: number): LabTest {
    const t = this.db.get(this.db.labTests, 'Lab test', testId);
    if (!isCents(priceCents)) throw new ValidationError('price must be non-negative cents');
    const u = { ...t, priceCents };
    this.db.labTests.set(testId, u);
    return u;
  }
  listTests(): LabTest[] {
    return [...this.db.labTests.values()];
  }

  get(id: string): LabRequest {
    return this.db.get(this.db.labRequests, 'Lab request', id);
  }
  list(filter: { patientId?: string; status?: LabRequest['status'] } = {}): LabRequest[] {
    return [...this.db.labRequests.values()].filter(
      (r) => (!filter.patientId || r.patientId === filter.patientId) && (!filter.status || r.status === filter.status),
    );
  }
  request(input: { patientId: string; doctorId: string; testId: string }): LabRequest {
    this.db.get(this.db.patients, 'Patient', input.patientId);
    this.db.get(this.db.doctors, 'Doctor', input.doctorId);
    const test = this.db.get(this.db.labTests, 'Lab test', input.testId);
    const r: LabRequest = {
      id: this.db.nextId('LR'), ...input, priceCents: test.priceCents, status: 'requested',
      requestedAt: this.db.now().toISOString(), reportStatus: 'none',
    };
    this.db.labRequests.set(r.id, r);
    return r;
  }
  collectSample(id: string, sampleId?: string): LabRequest {
    const r = this.get(id);
    if (r.status !== 'requested') throw new ConflictError(`Cannot collect sample for a ${r.status} request`);
    const u: LabRequest = {
      ...r, status: 'sample_collected', sampleId: sampleId?.trim() || `S-${r.id}`, sampleCollectedAt: this.db.now().toISOString(),
    };
    this.db.labRequests.set(id, u);
    return u;
  }
  /** Saves a draft result; may be called repeatedly until finalised. */
  recordResult(id: string, result: LabResult): LabRequest {
    const r = this.get(id);
    if (r.status !== 'sample_collected') throw new ConflictError('A sample must be collected before recording results');
    if (r.reportStatus === 'final') throw new ConflictError('Report is final and cannot be changed');
    const u: LabRequest = { ...r, result: { ...result, value: required(result.value, 'result value') }, reportStatus: 'draft' };
    this.db.labRequests.set(id, u);
    return u;
  }
  /** Finalises the report and completes the request. */
  finalizeReport(id: string): LabRequest {
    const r = this.get(id);
    if (r.reportStatus !== 'draft' || !r.result) throw new ConflictError('Only a draft report with results can be finalised');
    const u: LabRequest = { ...r, reportStatus: 'final', status: 'completed' };
    this.db.labRequests.set(id, u);
    return u;
  }
  cancel(id: string): LabRequest {
    const r = this.get(id);
    if (r.status === 'completed' || r.status === 'cancelled') throw new ConflictError(`Cannot cancel a ${r.status} request`);
    const u: LabRequest = { ...r, status: 'cancelled' };
    this.db.labRequests.set(id, u);
    return u;
  }
}
