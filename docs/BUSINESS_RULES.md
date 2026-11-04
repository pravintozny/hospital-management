# Business rules & calculations

Money is stored as integer cents; percentages as basis points (bps, 100 bps = 1%).
Rounding is round-half-up at each stage where a derived amount is computed.

## Patients
- Required: name, age (integer 0–130), gender, phone, address, emergency contact (name, relationship, phone).
- Phone: 7–19 digits/spaces/dashes with optional leading `+`. Email optional but validated.
- Medical history entries (condition, allergy, surgery, medication, note) are append-only; profile updates keep history.

## Doctors
- Fee must be non-negative cents. Department must exist; department names are unique (case-insensitive).
- Availability: weekly slots (`dayOfWeek` 0–6, `HH:mm` start < end); slots on the same day may not overlap.
- A patient can be assigned to a doctor once at a time; inactive doctors cannot receive assignments, appointments or admissions.

## Appointments
- Must be in the future, within a single day, 5–480 minutes, **entirely inside** one of the doctor's availability slots.
- **No overlaps**: a new/rescheduled appointment may not overlap another *scheduled* appointment of the same doctor, nor of the same patient (back-to-back is allowed). Cancelled/completed/no-show appointments free the slot.
- Status machine: `scheduled → completed | cancelled | no_show`; terminal states are final. Only `scheduled` can be rescheduled (reschedule re-validates everything, ignoring itself, and increments `rescheduleCount`).
- The consultation fee is copied from the doctor at booking time.

## Admissions
- Bed must be `available` (not occupied / maintenance). A patient can have only one active admission.
- Admit sets the bed `occupied`; discharge sets it `available`. Occupied beds can't be put into maintenance.
- Room numbers are unique per ward and bed labels unique per room. Daily rate is copied onto the admission.

## Pharmacy
- SKU is upper-cased and unique. Batch numbers are unique per medicine. Expired batches can't be received.
- A batch is *expired* from its expiry date onward (`expiry <= today`). Expired stock is never sellable.
- **Low stock**: sellable (unexpired) quantity `<=` reorder level. **Expiring soon**: stock with expiry within 30 days.
- A prescription needs ≥ 1 item, no duplicate medicines, positive quantities and a dosage.
- **Dispense** is atomic: stock for *every* item is checked first, then deducted first-expiry-first-out; otherwise nothing changes. Only `pending` prescriptions can be dispensed or cancelled.

## Laboratory
- Test codes are unique (upper-cased); price copied onto each request.
- Request flow: `requested → sample_collected → completed`; `cancelled` possible before completion.
- Report status: `none → draft → final`. Results need a collected sample; drafts can be re-saved; finalising requires a draft with results, completes the request and locks the report.

## Billing
Billable items (each billed once, tracked via `invoiceId`):

| Category | Source | Amount |
|---|---|---|
| consultation | completed appointment | booked fee |
| room | **discharged** admission | `billableDays × bed daily rate` |
| medicine | **dispensed** prescription | `quantity × unit price` per item |
| laboratory | **completed** lab request | test price at request time |

`billableDays = max(1, ceil(minutesStayed / 1440))` – any started 24h period counts; minimum one day.

```
subtotal = Σ line amounts
discount = percent: round(subtotal × bps / 10000)   |   fixed: cents      (fixed ≤ subtotal, percent ≤ 100%)
taxable  = subtotal − discount
tax      = round(taxable × taxRateBps / 10000)          (default 5.00%, range 0–100%)
total    = taxable + tax
```

Worked example: consultation $100 + 3 room days × $50 + medicine $4 + lab $25 = **$279.00**;
10% discount = $27.90; taxable $251.10; 5% tax = $12.555 → $12.56; **total $263.66**.

Invoice lifecycle: `issued → paid`, or `issued → void`. Voiding releases the items for re-billing. Paid invoices cannot be voided. Creating an invoice with nothing billable is rejected; an invalid discount aborts without marking anything billed.

## Reporting
- **Patient stats**: totals, registered today, currently admitted, by gender and age group (0–17, 18–39, 40–64, 65+).
- **Appointment stats** (optional date range): counts by status/doctor; `cancellationRate = cancelled / (completed + cancelled + no_show)`.
- **Revenue** (void invoices excluded): collected = Σ total of `paid`; outstanding = Σ total of `issued`; plus discounts, tax, and gross by category.
- **Bed occupancy**: `occupied / (total − maintenance)` overall and per ward.
- **Pharmacy inventory**: stock value = Σ sellable × unit price, low-stock list, expiring batches, expired units.
