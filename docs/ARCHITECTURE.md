# Architecture

## Layers

```
UI pages ──► AppContext (act, version) ──► Services ──► Database (in-memory Maps)
 (React)         catches DomainError          rules        mock persistence + clock + ID generator
```

- **Domain (`src/domain/types.ts`)** – plain TypeScript interfaces. No behaviour.
- **Services (`src/services/*`)** – one class per module. They own *all* validation and business
  rules, so rules hold no matter which UI (or test) calls them. `createServices(clock?)` wires them
  together around one shared `Database`.
- **Database** – `Map` per entity, deterministic ID generator (`P-0001`, `D-0001`, `AP-0001`…) and an
  injectable clock (tests use a fixed clock; the app uses the real one). Replacing it with a real API
  means re-implementing the `Database` access in the services; the UI is unaffected.
- **UI** – `AppProvider` exposes the services plus `act(fn, successMessage)`, which runs a mutation,
  turns any `DomainError` (`VALIDATION`, `NOT_FOUND`, `CONFLICT`) into a visible alert and bumps a
  version counter to re-render. Pages are thin; reusable pieces are in `ui/components`.

## Entity relationships

```
Department 1─* Doctor *─* Patient            (via DoctorAssignment)
Patient 1─* MedicalHistoryEntry (embedded)
Patient 1─* Appointment *─1 Doctor
Ward 1─* Room 1─* Bed
Patient 1─* Admission *─1 Bed, *─1 Doctor (attending)
Medicine 1─* MedicineBatch
Prescription *─1 Patient, *─1 Doctor, *─0..1 Appointment; Prescription 1─* PrescriptionItem *─1 Medicine
LabTest 1─* LabRequest *─1 Patient, *─1 Doctor
Invoice *─1 Patient; Invoice 1─* InvoiceLine ──► source (Appointment | Admission | Prescription | LabRequest)
```

### How the modules interconnect

| From | To | Link |
|---|---|---|
| Appointment | Doctor / Patient | validated on booking; fee snapshotted from the doctor |
| Admission | Bed, Doctor, Patient | bed becomes `occupied` on admit, `available` on discharge; bed rate snapshotted |
| Prescription | Medicine, optional Appointment | appointment must belong to the same patient & doctor |
| Dispense | Medicine batches | deducts stock FEFO; snapshots unit price |
| LabRequest | LabTest | price snapshotted at request time |
| Invoice | all four sources | pulls completed appointments, discharged admissions, dispensed prescriptions and completed lab requests; marks them with `invoiceId` so nothing is billed twice |
| Reporting | everything | read-only aggregation |

Snapshots (fee, bed rate, lab price, medicine price) mean later catalog changes never rewrite history.

## Reusable UI components (`src/ui/components`)

`Card`, `StatCard`, `Badge`/`StatusBadge`, `DataTable`, `Field`, `Button`, `Alert`, `ProgressBar`,
`Tabs`, and the `useFields` form-state hook.

## Testing

Vitest + Testing Library. A fixed clock (Monday 2026-01-05 08:00) makes date-dependent rules
(availability, expiry, past-booking) deterministic. Service tests cover rules and edge cases;
`App.test.tsx` drives each module's main workflow through the UI.

## Limitations

- In-memory only: no persistence, authentication/authorisation or audit log.
- Single currency (USD), single flat tax rate per invoice.
- Times are hospital-local naive strings (`YYYY-MM-DDTHH:mm`); no timezone/DST handling.
- Bed transfers, partial dispensing, partial payments and invoice editing are not implemented
  (void and re-issue instead).
- The UI forms are intentionally basic (e.g. one medicine per prescription form, though the
  service supports many).
