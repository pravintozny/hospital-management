import { useState } from 'react';
import { Alert, Tabs } from './ui/components';
import { AppProvider, useApp } from './ui/context';
import { Admissions } from './ui/pages/Admissions';
import { Appointments } from './ui/pages/Appointments';
import { Billing } from './ui/pages/Billing';
import { Dashboard } from './ui/pages/Dashboard';
import { Doctors } from './ui/pages/Doctors';
import { Laboratory } from './ui/pages/Laboratory';
import { Patients } from './ui/pages/Patients';
import { Pharmacy } from './ui/pages/Pharmacy';
import type { Services } from './services';
import './styles.css';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' }, { key: 'patients', label: 'Patients' }, { key: 'doctors', label: 'Doctors' },
  { key: 'appointments', label: 'Appointments' }, { key: 'admissions', label: 'Admissions' }, { key: 'billing', label: 'Billing' },
  { key: 'pharmacy', label: 'Pharmacy' }, { key: 'laboratory', label: 'Laboratory' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const PAGES: Record<Tab, () => React.JSX.Element> = {
  dashboard: Dashboard, patients: Patients, doctors: Doctors, appointments: Appointments,
  admissions: Admissions, billing: Billing, pharmacy: Pharmacy, laboratory: Laboratory,
};

function Shell() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { notice, clearNotice } = useApp();
  const Page = PAGES[tab];
  return (
    <div className="app">
      <h1>Hospital Management System</h1>
      <Tabs tabs={[...TABS]} active={tab} onChange={(k) => { clearNotice(); setTab(k); }} />
      {notice && <Alert kind={notice.kind} onClose={clearNotice}>{notice.text}</Alert>}
      <main><Page /></main>
    </div>
  );
}

export default function App({ services, withSeed }: { services?: Services; withSeed?: boolean }) {
  return (
    <AppProvider services={services} withSeed={withSeed}>
      <Shell />
    </AppProvider>
  );
}
