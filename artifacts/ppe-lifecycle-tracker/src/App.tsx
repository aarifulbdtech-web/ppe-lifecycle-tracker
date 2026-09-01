import { type FormEvent, type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity as ActivityIcon, AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, CheckCircle2,
  ClipboardCheck, Download, LayoutDashboard, PackageCheck, Pencil, Phone, RotateCcw, Search, Settings,
  LockKeyhole, LogOut, ShieldCheck, SlidersHorizontal, Upload, X,
} from 'lucide-react';
import {
  DEFAULT_RULES, SOURCE_ACTIVITIES, TRACEABLE_PPE_ITEMS, cloneSource, ensureRequiredAssignments, mergeRulesWithDefaults, ruleName, type Activity, type AssignmentStatus, type Employee,
  type PPEAssignment, type RuleSet,
} from './data';
import { Link, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();
const STORAGE_KEY = 'ppe-lifecycle-employees-v1';
const RULES_KEY = 'ppe-lifecycle-rules-v1';
const ACTIVITY_KEY = 'ppe-lifecycle-activity-v1';
const badStatuses: AssignmentStatus[] = ['Faulty', 'Missing', 'NOK', 'Due'];

type Store = {
  employees: Employee[];
  rules: RuleSet;
  activities: Activity[];
  updateAssignment: (employeeId: string, assignmentId: string, patch: Partial<PPEAssignment>) => void;
  updateEmployee: (employeeId: string, patch: Partial<Employee>) => void;
  updateRule: (skill: keyof RuleSet, item: string, quantity: number) => void;
  reset: () => void;
  notify: (message: string) => void;
  toast: string;
};

const PpeContext = createContext<Store | null>(null);
type AuthContextValue = { logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function PpeProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<RuleSet>(() => mergeRulesWithDefaults(readStorage(RULES_KEY, DEFAULT_RULES)));
  const [employees, setEmployees] = useState<Employee[]>(() => ensureRequiredAssignments(readStorage(STORAGE_KEY, cloneSource()), mergeRulesWithDefaults(readStorage(RULES_KEY, DEFAULT_RULES))));
  const [activities, setActivities] = useState<Activity[]>(() => readStorage(ACTIVITY_KEY, SOURCE_ACTIVITIES));
  const [toast, setToast] = useState('');

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(employees)), [employees]);
  useEffect(() => localStorage.setItem(RULES_KEY, JSON.stringify(rules)), [rules]);
  useEffect(() => localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities)), [activities]);
  useEffect(() => {
    setEmployees((current) => ensureRequiredAssignments(current, rules));
  }, [rules]);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };
  const updateAssignment = (employeeId: string, assignmentId: string, patch: Partial<PPEAssignment>) => {
    setEmployees((current) => current.map((employee) => {
      if (employee.id !== employeeId) return employee;
      const old = employee.assignments.find((assignment) => (assignment.id || assignment.item) === assignmentId);
      if (!old) return employee;
      const next = { ...old, ...patch };
      setActivities((items) => [{
        date: 'Just now',
        action: 'PPE record updated',
        employee: employee.name,
        item: next.item,
        subcenter: employee.subcenter,
        outcome: next.status === 'OK' ? 'Good / OK' : next.status,
      }, ...items].slice(0, 8));
      return { ...employee, assignments: employee.assignments.map((item) => (item.id || item.item) === assignmentId ? next : item) };
    }));
    notify('PPE record saved');
  };
  const updateEmployee = (employeeId: string, patch: Partial<Employee>) => {
    setEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, ...patch } : employee));
    notify('Employee details saved');
  };
  const updateRule = (skill: keyof RuleSet, item: string, quantity: number) => {
    setRules((current) => ({ ...current, [skill]: current[skill].map((name) => name === item ? `${name}::${quantity}` : name) }));
    notify('Requirement rule saved');
  };
  const reset = () => {
    setEmployees(cloneSource());
    setRules(DEFAULT_RULES);
    setActivities(SOURCE_ACTIVITIES);
    notify('Source snapshot restored');
  };
  return <PpeContext.Provider value={{ employees, rules, activities, updateAssignment, updateEmployee, updateRule, reset, notify, toast }}>{children}</PpeContext.Provider>;
}

function usePpe() {
  const value = useContext(PpeContext);
  if (!value) throw new Error('PPE store is unavailable');
  return value;
}

function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Authentication is unavailable');
  return value;
}

function ruleQty(value: string) { return Number(value.split('::')[1] || '1'); }
function assignmentKey(assignment: PPEAssignment) { return assignment.id || assignment.item; }
function mandatoryAssignments(employee: Employee, rules: RuleSet) {
  const required = new Set((rules[employee.skill] || []).map(ruleName));
  return employee.assignments.filter((assignment) => required.has(assignment.item));
}
function isTraceablePpe(item: string) {
  return TRACEABLE_PPE_ITEMS.includes(item);
}
function initials(name: string) { return name.split(' ').map((part) => part[0]).slice(0, 2).join(''); }
function prettyDate(date: string) {
  if (!date) return 'Not recorded';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function statusClass(status: string) {
  if (status === 'OK') return 'ok';
  if (status === 'Faulty' || status === 'NOK') return 'bad';
  if (status === 'Missing' || status === 'Due') return 'warn';
  return 'neutral';
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { toast } = usePpe();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/register', label: 'PPE register', icon: ClipboardCheck },
    { href: '/requirements', label: 'Requirements', icon: PackageCheck },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Link href="/" className="brand" data-testid="link-brand">
          <span className="brand-mark"><ShieldCheck size={20} /></span>
          <span className="brand-copy"><strong>SAFEGRID</strong><small>PPE control room</small></span>
        </Link>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`nav-item ${location === href ? 'active' : ''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-status"><span className="pulse" /> Local snapshot active</div>
           <div className="account"><span className="avatar">SC</span><div><div className="account-name">Safety control</div><div className="account-role">Operations workspace</div></div></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <span className="eyebrow">Operations / {location === '/' ? 'Today' : location.slice(1).replace('-', ' ')}</span>
          <div className="actions"><span className="status ok"><span className="pulse" /> Data saved locally</span><button className="btn btn-soft btn-small logout-button" onClick={async () => { setLoggingOut(true); await logout(); }} disabled={loggingOut} data-testid="button-logout"><LogOut size={14} /> {loggingOut ? 'Signing out…' : 'Log out'}</button></div>
        </header>
        <div className="content fade-in">{children}</div>
      </main>
      {toast ? <div className="toast" role="status" data-testid="status-toast">{toast}</div> : null}
    </div>
  );
}

function Metric({ label, value, note, tone = '' }: { label: string; value: string | number; note: ReactNode; tone?: string }) {
  return <div className={`card metric ${tone}`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div>;
}

function Dashboard() {
  const { employees, activities, rules } = usePpe();
  const allAssignments = employees.flatMap((employee) => mandatoryAssignments(employee, rules));
  const issues = allAssignments.filter((assignment) => badStatuses.includes(assignment.status) || assignment.quantity <= 0);
  const good = allAssignments.filter((assignment) => assignment.status === 'OK' && assignment.quantity > 0).length;
  const totalExpected = employees.reduce((sum, employee) => sum + (rules[employee.skill]?.length || 0), 0);
  const coverage = totalExpected ? Math.round((good / totalExpected) * 100) : 0;
  const subcenters = [...new Set(employees.map((employee) => employee.subcenter))];
  const hotspots = subcenters.map((subcenter) => {
    const subset = employees.filter((employee) => employee.subcenter === subcenter);
    const total = subset.reduce((sum, employee) => sum + (rules[employee.skill]?.length || 0), 0);
    const okay = subset.flatMap((employee) => mandatoryAssignments(employee, rules)).filter((assignment) => assignment.status === 'OK' && assignment.quantity > 0).length;
    return { subcenter, score: total ? Math.round(okay / total * 100) : 0, issues: subset.flatMap((employee) => mandatoryAssignments(employee, rules)).filter((assignment) => badStatuses.includes(assignment.status)).length };
  }).sort((a, b) => a.score - b.score);
  const actionRows = [
    { label: 'Replacement actions', copy: 'Faulty, missing or NOK equipment', count: issues.filter((item) => item.status !== 'Due').length, tone: 'red' },
    { label: 'Inspections due', copy: 'Records flagged for review this month', count: issues.filter((item) => item.status === 'Due').length, tone: 'amber' },
     { label: 'Requirement gaps', copy: 'Open PPR lines across all subcenters', count: buildRequirements(employees, rules).filter((row) => row.shortfall > 0).length, tone: 'red' },
  ];
  return <section>
     <div className="header-row"><div><div className="eyebrow">{new Date().toLocaleDateString('en-BD', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</div><h1 className="page-title">PPE readiness overview</h1><p className="page-subtitle">A current safety picture across all tracked subcenters.</p></div><div className="actions"><Link href="/requirements" className="btn btn-primary" data-testid="link-review-gaps"><AlertTriangle size={15} /> Review open gaps <ArrowUpRight size={14} /></Link></div></div>
    <div className="metric-grid">
      <Metric label="PPE coverage" value={`${coverage}%`} tone="good" note={<><strong>{good}</strong> good items of {totalExpected} required</>} />
      <Metric label="Open actions" value={issues.length} tone="danger" note={<><strong>{issues.filter((i) => i.status !== 'Due').length}</strong> replacement · {issues.filter((i) => i.status === 'Due').length} inspections</>} />
      <Metric label="People tracked" value={employees.length} note={<><strong>{subcenters.length}</strong> active subcenters</>} />
       <Metric label="PPR shortfall" value={buildRequirements(employees, rules).reduce((sum, row) => sum + row.shortfall, 0)} tone="amber" note={<><strong>Units to source</strong> across all subcenters</>} />
    </div>
    <div className="dashboard-grid">
      <div className="card panel"><div className="panel-heading"><div><h2 className="panel-title">Priority actions</h2><p className="panel-kicker">The shortest path to a safer shift.</p></div><Link href="/register" className="link-action" data-testid="link-open-register">Open register <ArrowUpRight size={12} /></Link></div>
        <div className="action-list">{actionRows.map((row) => <div className="action-row" key={row.label}><span className={`signal ${row.tone}`} /><div className="action-main"><strong>{row.label}</strong><span>{row.copy}</span></div><span className="action-count">{row.count.toString().padStart(2, '0')}</span><Link href="/requirements" className="btn btn-soft btn-small" data-testid={`link-action-${row.label.toLowerCase().replaceAll(' ', '-')}`}>View</Link></div>)}</div>
      </div>
      <div className="card panel"><div className="panel-heading"><div><h2 className="panel-title">Subcenter readiness</h2><p className="panel-kicker">Good items against total requirement.</p></div><Link href="/requirements" className="link-action" data-testid="link-all-subcenters">All subcenters</Link></div>
        <div className="hotspot-list">{hotspots.map((spot) => <div className="hotspot" key={spot.subcenter}><span className="hotspot-name">{spot.subcenter}</span><div className="bar"><span className={spot.score < 70 ? 'risk' : spot.score < 90 ? 'warn' : ''} style={{ width: `${spot.score}%` }} /></div><span className="hotspot-score">{spot.score}%</span></div>)}</div>
      </div>
      <div className="card panel activity"><div className="panel-heading"><div><h2 className="panel-title">Recent activity</h2><p className="panel-kicker">A quiet audit trail of the latest changes.</p></div><span className="eyebrow">Local record</span></div>
        <div className="activity-list">{activities.slice(0, 4).map((item, index) => <div className="activity-item" key={`${item.date}-${index}`} data-testid={`activity-${index}`}><div className="activity-date">{item.date}</div><p className="activity-text"><strong>{item.action}</strong><br />{item.employee} · {item.item}<br /><span className="text-muted">{item.outcome}</span></p></div>)}</div>
      </div>
    </div>
  </section>;
}

function Register() {
  const { employees, rules, updateAssignment } = usePpe();
  const [query, setQuery] = useState('');
  const [skill, setSkill] = useState('All skills');
  const [subcenter, setSubcenter] = useState('All subcenters');
  const [status, setStatus] = useState('All statuses');
  const [expanded, setExpanded] = useState<string | null>(null);
  const subcenters = [...new Set(employees.map((employee) => employee.subcenter))];
  const filtered = employees.filter((employee) => {
    const currentAssignments = mandatoryAssignments(employee, rules);
    const matchesText = `${employee.name} ${employee.id} ${employee.mobile}`.toLowerCase().includes(query.toLowerCase());
    const matchesSkill = skill === 'All skills' || employee.skill === skill;
    const matchesSubcenter = subcenter === 'All subcenters' || employee.subcenter === subcenter;
    const employeeStatus = currentAssignments.some((item) => badStatuses.includes(item.status)) ? 'Needs attention' : 'Ready';
    return matchesText && matchesSkill && matchesSubcenter && (status === 'All statuses' || employeeStatus === status);
  });
  const statusOptions = ['All statuses', 'Ready', 'Needs attention'];
  return <section>
    <div className="header-row"><div><div className="eyebrow">Register / people & equipment</div><h1 className="page-title">PPE register</h1><p className="page-subtitle">Review each person, then edit the lifecycle record without leaving the register.</p></div><div className="actions"><button className="btn btn-soft" onClick={() => exportCsv(filtered, rules)} data-testid="button-export-register"><Download size={15} /> Export CSV</button></div></div>
    <div className="card table-card">
     <div className="toolbar"><div className="search-wrap"><Search /><input className="input" type="search" placeholder="Search name, employee ID or mobile" value={query} onChange={(event) => setQuery(event.target.value)} data-testid="input-register-search" /></div><select className="select" value={skill} onChange={(event) => setSkill(event.target.value)} data-testid="select-register-skill"><option>All skills</option><option>Electrical</option><option>Electrical &amp; WAH</option></select><select className="select" value={subcenter} onChange={(event) => setSubcenter(event.target.value)} data-testid="select-register-subcenter"><option>All subcenters</option>{subcenters.map((item) => <option key={item}>{item}</option>)}</select><select className="select" value={status} onChange={(event) => setStatus(event.target.value)} data-testid="select-register-status">{statusOptions.map((item) => <option key={item}>{item}</option>)}</select><span className="filters-note">{filtered.length} of {employees.length} people</span></div>
      {filtered.length === 0 ? <EmptyState title="No people match these filters" copy="Try clearing one of the filters to see the full register." /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Employee</th><th>Skill / subcenter</th><th>Assigned PPE</th><th>Register health</th><th>Last inspection</th><th /></tr></thead><tbody>{filtered.map((employee) => {
        const latest = mandatoryAssignments(employee, rules).map((item) => item.inspectionDate).sort().at(-1) || '';
        const hasIssue = mandatoryAssignments(employee, rules).some((item) => badStatuses.includes(item.status));
        return <RegisterRow key={employee.id} employee={employee} expanded={expanded === employee.id} onExpand={() => setExpanded(expanded === employee.id ? null : employee.id)} hasIssue={hasIssue} latest={latest} rules={rules} onUpdate={updateAssignment} />;
      })}</tbody></table></div>}
    </div>
  </section>;
}

function RegisterRow({ employee, expanded, onExpand, hasIssue, latest, rules, onUpdate }: { employee: Employee; expanded: boolean; onExpand: () => void; hasIssue: boolean; latest: string; rules: RuleSet; onUpdate: Store['updateAssignment'] }) {
  return <>
    <tr data-testid={`row-employee-${employee.id}`}><td><Link href={`/people/${employee.id}`} className="person-cell link-person" data-testid={`link-person-${employee.id}`}><span className="person-avatar">{initials(employee.name)}</span><span><span className="person-name">{employee.name}</span><span className="person-meta">{employee.id} · {employee.mobile}</span></span></Link></td><td><strong>{employee.skill}</strong><div className="person-meta">{employee.subcenter}</div></td><td><span className="mono">{mandatoryAssignments(employee, rules).length} / {rules[employee.skill]?.length || 0}</span><div className="person-meta">items recorded</div></td><td><span className={`status ${hasIssue ? 'bad' : 'ok'}`}><span className="signal" />{hasIssue ? 'Needs attention' : 'Ready'}</span></td><td className="mono">{prettyDate(latest)}</td><td><button className="btn btn-soft btn-small" onClick={onExpand} data-testid={`button-expand-${employee.id}`}>{expanded ? <X size={14} /> : <Pencil size={14} />} {expanded ? 'Close' : 'Edit'}</button></td></tr>
      {expanded ? <tr><td colSpan={6} style={{ padding: 0, background: 'hsl(42 32% 96%)' }}><InlineEditor employee={employee} rules={rules} onUpdate={onUpdate} /></td></tr> : null}
  </>;
}

function InlineEditor({ employee, rules, onUpdate }: { employee: Employee; rules: RuleSet; onUpdate: Store['updateAssignment'] }) {
  return <div style={{ padding: '17px 20px 19px' }}><div style={{ display: 'grid', gap: 10 }}>{mandatoryAssignments(employee, rules).map((assignment) => { const key = assignmentKey(assignment); return <div key={key}><div style={{ display: 'grid', gridTemplateColumns: '1.2fr .65fr .52fr .9fr .9fr .9fr 1fr auto', gap: 10, alignItems: 'end' }}><div><label className="field-label">{assignment.item}</label><div className="mono text-muted">{assignment.id || 'No PPE ID recorded'}</div></div><div><label className="field-label">Status</label><select className="select small-input" value={assignment.status} onChange={(event) => onUpdate(employee.id, key, { status: event.target.value as AssignmentStatus })} data-testid={`select-status-${key}`}><option>OK</option><option>Faulty</option><option>Missing</option><option>NOK</option><option>Due</option></select></div><div><label className="field-label">Qty</label><input className="input small-input" type="number" min="0" value={assignment.quantity} onChange={(event) => onUpdate(employee.id, key, { quantity: Math.max(0, Number(event.target.value) || 0) })} data-testid={`input-quantity-${key}`} /></div><div><label className="field-label">Purchased</label><input className="input small-input" type="date" value={assignment.purchaseDate} onChange={(event) => onUpdate(employee.id, key, { purchaseDate: event.target.value })} data-testid={`input-purchase-${key}`} /></div><div><label className="field-label">Issued</label><input className="input small-input" type="date" value={assignment.issueDate} onChange={(event) => onUpdate(employee.id, key, { issueDate: event.target.value })} data-testid={`input-issue-${key}`} /></div><div><label className="field-label">Inspection</label><input className="input small-input" type="date" value={assignment.inspectionDate} onChange={(event) => onUpdate(employee.id, key, { inspectionDate: event.target.value })} data-testid={`input-inspection-${key}`} /></div><div><label className="field-label">Reason</label><input className="input small-input" value={assignment.reason} placeholder="Add note" onChange={(event) => onUpdate(employee.id, key, { reason: event.target.value })} data-testid={`input-reason-${key}`} /></div><Link href={`/people/${employee.id}`} className="btn btn-soft btn-small" data-testid={`link-edit-person-${employee.id}`}>Details</Link></div><TraceabilityFields employee={employee} assignment={assignment} onUpdate={onUpdate} prefix={`inline-${key}`} /></div>; })}</div></div>;
}

function TraceabilityFields({ employee, assignment, onUpdate, prefix }: { employee: Employee; assignment: PPEAssignment; onUpdate: Store['updateAssignment']; prefix: string }) {
  if (!isTraceablePpe(assignment.item)) return null;
  const key = assignmentKey(assignment);
  return <div className="traceability-fields"><div className="traceability-heading"><strong>Traceability details</strong><span>{assignment.item === 'Helmet (WAH)' ? 'Climbing helmet record' : 'Required for controlled PPE'}</span></div><div className="traceability-grid"><div><label className="field-label">Brand name</label><input className="input small-input" value={assignment.brandName || ''} placeholder="Enter brand" onChange={(event) => onUpdate(employee.id, key, { brandName: event.target.value })} data-testid={`input-brand-${prefix}`} /></div><div><label className="field-label">Manufacturer date</label><input className="input small-input" type="date" value={assignment.manufacturerDate || ''} onChange={(event) => onUpdate(employee.id, key, { manufacturerDate: event.target.value })} data-testid={`input-manufacturer-date-${prefix}`} /></div><div><label className="field-label">Expiry date</label><input className="input small-input" type="date" value={assignment.expiryDate || ''} onChange={(event) => onUpdate(employee.id, key, { expiryDate: event.target.value })} data-testid={`input-expiry-date-${prefix}`} /></div></div></div>;
}

type Requirement = { subcenter: string; skill: string; item: string; required: number; available: number; shortfall: number; reason: string };
function buildRequirements(employees: Employee[], rules: RuleSet): Requirement[] {
  const combos = [...new Set(employees.map((employee) => `${employee.subcenter}///${employee.skill}`))];
  return combos.flatMap((combo) => {
    const [subcenter, skill] = combo.split('///');
    const people = employees.filter((employee) => employee.subcenter === subcenter && employee.skill === skill);
    return (rules[skill as keyof RuleSet] || []).map((rawItem) => {
      const item = ruleName(rawItem);
      const required = people.length * ruleQty(rawItem);
      const matching = people.flatMap((person) => person.assignments.filter((assignment) => assignment.item === item));
       const available = matching.filter((assignment) => assignment.status === 'OK' && assignment.quantity > 0).reduce((sum, assignment) => sum + assignment.quantity, 0);
      const shortfall = Math.max(required - available, 0);
      const reason = shortfall ? (matching.some((assignment) => assignment.status === 'Missing') ? 'Missing assignment' : matching.some((assignment) => assignment.status === 'Faulty' || assignment.status === 'NOK') ? 'Faulty / NOK stock' : 'Not recorded') : 'Covered';
      return { subcenter, skill, item, required, available, shortfall, reason };
    });
  });
}

function Requirements() {
  const { employees, rules } = usePpe();
  const [subcenter, setSubcenter] = useState('All subcenters');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const allRows = useMemo(() => buildRequirements(employees, rules), [employees, rules]);
  const rows = allRows.filter((row) => (subcenter === 'All subcenters' || row.subcenter === subcenter) && (!onlyGaps || row.shortfall > 0));
  const centers = [...new Set(employees.map((employee) => employee.subcenter))];
  const totalShortfall = rows.reduce((sum, row) => sum + row.shortfall, 0);
  const totalRequired = rows.reduce((sum, row) => sum + row.required, 0);
  return <section><div className="header-row"><div><div className="eyebrow">Procurement / planning view</div><h1 className="page-title">PPR requirements</h1><p className="page-subtitle">A clean view of what each subcenter needs to close the safety gap.</p></div><div className="actions"><button className="btn btn-primary" onClick={() => exportRequirements(rows)} data-testid="button-export-requirements"><Download size={15} /> Export procurement CSV</button></div></div>
    <div className="requirements-layout"><div className="card table-card"><div className="toolbar"><select className="select" value={subcenter} onChange={(event) => setSubcenter(event.target.value)} data-testid="select-requirement-subcenter"><option>All subcenters</option>{centers.map((item) => <option key={item}>{item}</option>)}</select><button className={`btn btn-small ${onlyGaps ? 'btn-primary' : 'btn-soft'}`} onClick={() => setOnlyGaps(!onlyGaps)} data-testid="button-toggle-gaps"><SlidersHorizontal size={14} /> {onlyGaps ? 'Showing gaps' : 'Show gaps only'}</button><span className="filters-note">{rows.length} lines</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Subcenter / skill</th><th>Item</th><th>Required</th><th>Good / available</th><th>Shortfall</th><th>Reason</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row.subcenter}-${row.item}-${index}`} data-testid={`row-requirement-${index}`}><td><strong>{row.subcenter}</strong><div className="person-meta">{row.skill}</div></td><td>{row.item}</td><td className="mono">{row.required}</td><td className="mono">{row.available}</td><td><span className={`status ${row.shortfall ? 'bad' : 'ok'}`}>{row.shortfall ? row.shortfall : <Check size={12} />} {row.shortfall || 'Covered'}</span></td><td className={row.shortfall ? '' : 'text-muted'}>{row.reason}</td></tr>) : <tr><td colSpan={6}><EmptyState title="No requirement gaps here" copy="This view is clear for the current filters." /></td></tr>}</tbody></table></div></div>
      <aside className="card panel side-summary"><div className="eyebrow">Procurement brief</div><div className="summary-number">{totalShortfall}</div><div className="panel-kicker">units to source</div><div className="summary-rule" /><div className="summary-pair"><span>Total required</span><strong>{totalRequired}</strong></div><div className="summary-pair"><span>Covered / good</span><strong>{totalRequired - totalShortfall}</strong></div><div className="summary-pair"><span>Open lines</span><strong>{rows.filter((row) => row.shortfall > 0).length}</strong></div><div className="summary-rule" /><p className="panel-kicker">Faulty, NOK, missing and unrecorded PPE are excluded from available stock. Export this view for the next procurement review.</p></aside></div>
  </section>;
}

function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const { employees, rules, updateAssignment, updateEmployee } = usePpe();
  const employee = employees.find((item) => item.id === id);
  if (!employee) return <EmptyState title="Employee not found" copy="Return to the register to choose an active employee." link="/register" />;
  const assignments = mandatoryAssignments(employee, rules);
  return <section><div className="header-row"><div><Link href="/register" className="link-action" data-testid="link-back-register"><ArrowLeft size={13} /> Back to register</Link><h1 className="page-title" style={{ marginTop: 12 }}>{employee.name}</h1><p className="page-subtitle">{employee.id} · {employee.designation}</p></div><div className="actions"><a className="btn btn-soft" href={`tel:${employee.mobile}`} data-testid="link-call-employee"><Phone size={15} /> Call employee</a></div></div>
     <div className="detail-grid"><div className="card profile-card"><div className="profile-head"><span className="profile-avatar">{initials(employee.name)}</span><div><div className="profile-name">{employee.name}</div><div className="profile-role">{employee.skill}</div></div></div><dl className="info-list"><div className="info-item"><dt>Employee ID</dt><dd className="mono">{employee.id}</dd></div><div className="info-item"><dt>Mobile</dt><dd>{employee.mobile}</dd></div><div className="info-item"><dt>Designation</dt><dd>{employee.designation}</dd></div><div className="info-item"><dt>Subcenter</dt><dd>{employee.subcenter}</dd></div></dl><div style={{ marginTop: 22 }}><button className="btn btn-soft" onClick={() => updateEmployee(employee.id, { designation: employee.designation === 'Technician' ? 'Senior Technician' : 'Technician' })} data-testid="button-toggle-designation"><Pencil size={14} /> Toggle designation</button></div></div>
       <div className="section-stack"><div className="card panel"><div className="panel-heading"><div><h2 className="panel-title">Assigned PPE</h2><p className="panel-kicker">Edit inspection fields and status inline.</p></div><span className={`status ${assignments.some((item) => badStatuses.includes(item.status)) ? 'bad' : 'ok'}`}>{assignments.filter((item) => item.status === 'OK').length} / {assignments.length} good</span></div><div className="assignment-list">{assignments.map((assignment) => <AssignmentEditor key={assignmentKey(assignment)} employee={employee} assignment={assignment} onUpdate={updateAssignment} />)}</div></div><div className="card panel"><div className="panel-heading"><div><h2 className="panel-title">Inspection history</h2><p className="panel-kicker">Most recent recorded checks for {employee.name.split(' ')[0]}.</p></div><ActivityIcon size={17} className="text-muted" /></div><div className="action-list">{assignments.slice(0, 4).map((assignment) => <div className="action-row" key={`history-${assignmentKey(assignment)}`}><span className={`signal ${assignment.status === 'OK' ? 'green' : 'red'}`} /><div className="action-main"><strong>{assignment.item}</strong><span>Inspected {prettyDate(assignment.inspectionDate)}{assignment.reason ? ` · ${assignment.reason}` : ''}</span></div><span className={`status ${statusClass(assignment.status)}`}>{assignment.status}</span></div>)}</div></div></div></div>
  </section>;
}

function AssignmentEditor({ employee, assignment, onUpdate }: { employee: Employee; assignment: PPEAssignment; onUpdate: Store['updateAssignment'] }) {
  const key = assignmentKey(assignment);
  return <><div className="assignment-row"><div><div className="assignment-item">{assignment.item}</div><div className="assignment-id">{assignment.id || 'No PPE ID recorded'}</div></div><div><label className="field-label">Status</label><select className="select small-input" value={assignment.status} onChange={(event) => onUpdate(employee.id, key, { status: event.target.value as AssignmentStatus })} data-testid={`detail-status-${key}`}><option>OK</option><option>Faulty</option><option>Missing</option><option>NOK</option><option>Due</option></select></div><div><label className="field-label">Quantity</label><input className="input small-input" type="number" min="0" value={assignment.quantity} onChange={(event) => onUpdate(employee.id, key, { quantity: Math.max(0, Number(event.target.value) || 0) })} data-testid={`detail-quantity-${key}`} /></div><div><label className="field-label">Inspection</label><input className="input small-input" type="date" value={assignment.inspectionDate} onChange={(event) => onUpdate(employee.id, key, { inspectionDate: event.target.value })} data-testid={`detail-inspection-${key}`} /></div><div><label className="field-label">Purchase</label><input className="input small-input" type="date" value={assignment.purchaseDate} onChange={(event) => onUpdate(employee.id, key, { purchaseDate: event.target.value })} data-testid={`detail-purchase-${key}`} /></div><div><label className="field-label">Issue date</label><input className="input small-input" type="date" value={assignment.issueDate} onChange={(event) => onUpdate(employee.id, key, { issueDate: event.target.value })} data-testid={`detail-issue-${key}`} /></div><div><label className="field-label">Action</label><button className="btn btn-soft btn-small" onClick={() => onUpdate(employee.id, key, { status: 'OK', reason: '' })} data-testid={`button-clear-issue-${key}`}><Check size={13} /> Clear</button></div></div><TraceabilityFields employee={employee} assignment={assignment} onUpdate={onUpdate} prefix={`detail-${key}`} /></>;
}

function SettingsPage() {
  const { rules, updateRule, reset, notify, employees } = usePpe();
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText) as Employee[];
      if (!Array.isArray(parsed)) throw new Error('Invalid');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      window.location.reload();
    } catch { notify('Import failed — paste a valid JSON snapshot'); }
  };
  return <section><div className="header-row"><div><div className="eyebrow">Workspace / controls</div><h1 className="page-title">Settings</h1><p className="page-subtitle">Tune PPE rules and manage the local workbook snapshot.</p></div></div>
    <div className="settings-grid"><div className="rule-grid">{(Object.keys(rules) as (keyof RuleSet)[]).map((skill) => <div className="card rule-card" key={skill}><div className="rule-card-heading"><strong>{skill}</strong><span>{employees.filter((employee) => employee.skill === skill).length} people tracked</span></div><div className="rule-items">{rules[skill].map((rawItem) => { const item = ruleName(rawItem); return <label className="rule-chip" key={rawItem}><span>{item}</span><input type="number" min="0" value={ruleQty(rawItem)} onChange={(event) => updateRule(skill, rawItem, Number(event.target.value) || 0)} aria-label={`${skill} ${item} quantity`} data-testid={`input-rule-${skill}-${item}`} /></label>; })}</div></div>)}</div>
      <aside className="settings-actions"><button className="card settings-action" onClick={() => downloadJson(employees)} data-testid="button-download-snapshot"><ArrowDownToLine /><span><strong>Download snapshot</strong><span>Save the current local records as JSON.</span></span></button><button className="card settings-action" onClick={() => setShowImport(!showImport)} data-testid="button-import-snapshot"><Upload /><span><strong>Import snapshot</strong><span>Replace local records from a JSON export.</span></span></button>{showImport ? <div className="card panel"><textarea className="input" style={{ height: 110, padding: 10, resize: 'vertical' }} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste exported JSON here" data-testid="textarea-import" /><button className="btn btn-primary" style={{ marginTop: 10, width: '100%' }} onClick={handleImport} data-testid="button-confirm-import">Import records</button></div> : null}<button className="card settings-action" onClick={() => { if (window.confirm('Restore the original source snapshot? Local edits will be removed.')) reset(); }} data-testid="button-reset-snapshot"><RotateCcw /><span><strong>Reset to source snapshot</strong><span>Restore the workbook starting point.</span></span></button></aside></div>
  </section>;
}

function EmptyState({ title, copy, link }: { title: string; copy: string; link?: string }) {
  return <div className="empty"><CheckCircle2 size={28} /> <strong>{title}</strong><span>{copy}</span>{link ? <div style={{ marginTop: 15 }}><Link href={link} className="btn btn-soft" data-testid="link-empty-action">Return to register</Link></div> : null}</div>;
}

function exportCsv(employees: Employee[], rules: RuleSet) {
  const rows = employees.flatMap((employee) => mandatoryAssignments(employee, rules).map((item) => [employee.id, employee.name, employee.skill, employee.subcenter, item.item, item.id, item.brandName, item.manufacturerDate, item.expiryDate, item.quantity, item.purchaseDate, item.issueDate, item.inspectionDate, item.status, item.reason]));
  downloadFile([['Employee ID', 'Employee', 'Skill', 'Subcenter', 'PPE item', 'PPE ID', 'Brand name', 'Manufacturer date', 'Expiry date', 'Quantity', 'Purchase date', 'Issue date', 'Inspection date', 'Status', 'Reason'], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'), 'ppe-register.csv', 'text/csv');
}
function exportRequirements(rows: ReturnType<typeof buildRequirements>) {
  downloadFile([['Subcenter', 'Skill', 'PPE item', 'Required', 'Good / available', 'Shortfall', 'Reason'], ...rows.map((row) => [row.subcenter, row.skill, row.item, row.required, row.available, row.shortfall, row.reason])].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n'), 'ppe-procurement-requirements.csv', 'text/csv');
}
function downloadJson(employees: Employee[]) { downloadFile(JSON.stringify(employees, null, 2), 'ppe-source-snapshot.json', 'application/json'); }
function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function AuthLoading() {
  return <main className="auth-screen"><div className="auth-card card auth-loading"><span className="auth-mark"><ShieldCheck size={24} /></span><div className="auth-title">SAFEGRID</div><p>Checking workspace access…</p></div></main>;
}

function LoginPage({ initialError, onLogin }: { initialError: string; onLogin: (password: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await onLogin(password);
    if (!result.ok) setError(result.error || 'Unable to sign in.');
    setSubmitting(false);
  };
  return <main className="auth-screen"><section className="auth-card card">
    <div className="auth-brand"><span className="auth-mark"><ShieldCheck size={24} /></span><div><strong>SAFEGRID</strong><span>PPE control room</span></div></div>
    <div className="auth-copy"><div className="eyebrow">Protected workspace</div><h1>Sign in to continue</h1><p>Use the workspace password to access the PPE lifecycle tracker.</p></div>
    <form className="auth-form" onSubmit={submit}>
      <input className="auth-username" type="text" name="username" autoComplete="username" value="workspace" readOnly tabIndex={-1} aria-hidden="true" />
      <label className="field-label" htmlFor="workspace-password">Workspace password</label>
      <div className="auth-input-wrap"><LockKeyhole size={16} /><input id="workspace-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required autoFocus data-testid="input-login-password" /></div>
      {error ? <div className="auth-error" role="alert">{error}</div> : null}
      <button className="btn btn-primary auth-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'} </button>
    </form>
    <p className="auth-note">Single-password access for the operations workspace.</p>
  </section></main>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [initialError, setInitialError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { authenticated?: boolean };
        if (!response.ok) throw new Error('The access service is unavailable.');
        if (active) setAuthenticated(data.authenticated === true);
      })
      .catch((error: unknown) => {
        if (active) {
          setInitialError(error instanceof Error ? error.message : 'The access service is unavailable.');
          setAuthenticated(false);
        }
      });
    return () => { active = false; };
  }, []);

  const login = async (password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({})) as { authenticated?: boolean; error?: string };
      if (!response.ok || data.authenticated !== true) return { ok: false, error: data.error || 'Unable to sign in.' };
      setAuthenticated(true);
      setInitialError('');
      return { ok: true };
    } catch {
      return { ok: false, error: 'The access service is unavailable.' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      setAuthenticated(false);
    }
  };

  if (authenticated === null) return <AuthLoading />;
  if (!authenticated) return <LoginPage initialError={initialError} onLogin={login} />;
  return <AuthContext.Provider value={{ logout }}>{children}</AuthContext.Provider>;
}

function Router() {
  return <Shell><Switch><Route path="/" component={Dashboard} /><Route path="/register" component={Register} /><Route path="/requirements" component={Requirements} /><Route path="/people/:id" component={PersonDetail} /><Route path="/settings" component={SettingsPage} /><Route component={() => <EmptyState title="Page not found" copy="The requested workspace view does not exist." link="/" />} /></Switch></Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AuthGate><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><ErrorBoundary><PpeProvider><Router /></PpeProvider></ErrorBoundary></WouterRouter><Toaster /></AuthGate></TooltipProvider></QueryClientProvider>;
}

export default App;