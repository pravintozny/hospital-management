# Hospital Management System

A front-end Hospital Management System (React + TypeScript + Vite) backed by a fully in-memory
mock service layer. It covers patients, doctors, appointments, admissions, billing, pharmacy,
laboratory and dashboard reporting, with the business rules enforced in the service layer and
covered by automated tests.

## Quick start

```bash
npm install
npm run dev         # start the app with seeded demo data
npm test            # unit + UI tests (vitest)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # typecheck + production build
```

Data lives in memory and resets on reload (mock persistence; see *Limitations* in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Documentation

- [Architecture & data model relationships](docs/ARCHITECTURE.md)
- [Business rules & calculations](docs/BUSINESS_RULES.md)

## Layout

```
src/
  domain/types.ts      entity types
  lib/                 errors, money, time, validation helpers
  services/            one service per module + in-memory Database + seed data
  ui/components/       reusable components (Card, StatCard, DataTable, Badge, Tabs, ...)
  ui/pages/            one page per module
  test/                test helpers (fixed clock, fixtures)
```
