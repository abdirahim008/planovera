/* pb-data.jsx — demo seed data for ProBuild prototype */

const DEMO_PROJECTS = [
  {
    id: 'p1', name: 'Riverside Commercial Tower', code: 'RCT-2024',
    type: 'construction', role: 'supervision',
    clientName: 'Al Madar Investments', contractorName: 'BuildCo Contracting',
    consultantName: 'Apex Engineering', location: 'Dubai Marina, UAE',
    contractTitle: 'Construction of G+30 Commercial Tower',
    contractAmount: '48500000', currency: 'AED',
    start_date: '2024-01-15', end_date: '2026-08-31',
    physical: 62, financial: 55,
    plannedProgress: 68, actualProgress: 62,
    status: 'active',
  },
  {
    id: 'p2', name: 'Al Khail Road Infrastructure', code: 'AKR-2023',
    type: 'construction', role: 'employer',
    clientName: 'Dubai RTA', contractorName: 'Gulf Roads LLC',
    consultantName: 'WSP Middle East', location: 'Al Quoz, Dubai, UAE',
    contractTitle: 'Road Widening & Drainage Works',
    contractAmount: '22750000', currency: 'AED',
    start_date: '2023-06-01', end_date: '2025-12-31',
    physical: 88, financial: 82,
    plannedProgress: 90, actualProgress: 88,
    status: 'active',
  },
  {
    id: 'p3', name: 'Marina Walk Residences', code: 'MWR-2025',
    type: 'construction', role: 'contractor',
    clientName: 'Emaar Properties', contractorName: 'ProBuild Contracting',
    consultantName: 'SSH International', location: 'JBR, Dubai, UAE',
    contractTitle: 'Design & Build — Residential Complex',
    contractAmount: '31200000', currency: 'AED',
    start_date: '2025-03-01', end_date: '2027-06-30',
    physical: 18, financial: 14,
    plannedProgress: 22, actualProgress: 18,
    status: 'active',
  },
];

const DEMO_BOQ = [
  { type: 'header',   id: 'h1',  itemNo: 'A',    description: 'PRELIMINARIES & GENERAL REQUIREMENTS', unit: '', qty: '', rate: '', amount: '' },
  { type: 'item',     id: 'r1',  itemNo: 'A.01', description: 'Site mobilisation and setup', unit: 'Sum', qty: 1, rate: 280000, amount: 280000 },
  { type: 'item',     id: 'r2',  itemNo: 'A.02', description: 'Temporary facilities and services', unit: 'Sum', qty: 1, rate: 145000, amount: 145000 },
  { type: 'item',     id: 'r3',  itemNo: 'A.03', description: 'Health, Safety & Environment plan', unit: 'Sum', qty: 1, rate: 62000, amount: 62000 },
  { type: 'item',     id: 'r4',  itemNo: 'A.04', description: 'Insurances and bonds', unit: 'Sum', qty: 1, rate: 95000, amount: 95000 },
  { type: 'subtotal', id: 's1',  itemNo: '',     description: 'Sub-total — Preliminaries', unit: '', qty: '', rate: '', amount: 582000 },
  { type: 'header',   id: 'h2',  itemNo: 'B',    description: 'SUBSTRUCTURE', unit: '', qty: '', rate: '', amount: '' },
  { type: 'item',     id: 'r5',  itemNo: 'B.01', description: 'Excavation to formation level, including disposal', unit: 'm³', qty: 4820, rate: 38, amount: 183160 },
  { type: 'item',     id: 'r6',  itemNo: 'B.02', description: 'Lean concrete blinding (100mm)', unit: 'm²', qty: 960, rate: 45, amount: 43200 },
  { type: 'item',     id: 'r7',  itemNo: 'B.03', description: 'Reinforced concrete raft foundation — C40/50', unit: 'm³', qty: 1240, rate: 820, amount: 1016800 },
  { type: 'item',     id: 'r8',  itemNo: 'B.04', description: 'High-yield reinforcement bar — raft slab', unit: 'tonne', qty: 186, rate: 4200, amount: 781200 },
  { type: 'item',     id: 'r9',  itemNo: 'B.05', description: 'Waterproofing membrane to raft slab', unit: 'm²', qty: 960, rate: 95, amount: 91200 },
  { type: 'subtotal', id: 's2',  itemNo: '',     description: 'Sub-total — Substructure', unit: '', qty: '', rate: '', amount: 2115560 },
  { type: 'header',   id: 'h3',  itemNo: 'C',    description: 'SUPERSTRUCTURE — FRAME & UPPER FLOORS', unit: '', qty: '', rate: '', amount: '' },
  { type: 'item',     id: 'r10', itemNo: 'C.01', description: 'Reinforced concrete columns — C50/60', unit: 'm³', qty: 680, rate: 1100, amount: 748000 },
  { type: 'item',     id: 'r11', itemNo: 'C.02', description: 'RC flat slab construction (250mm avg)', unit: 'm²', qty: 28400, rate: 210, amount: 5964000 },
  { type: 'item',     id: 'r12', itemNo: 'C.03', description: 'RC shear walls and core', unit: 'm³', qty: 2200, rate: 950, amount: 2090000 },
  { type: 'item',     id: 'r13', itemNo: 'C.04', description: 'Structural steel transfer beams', unit: 'tonne', qty: 48, rate: 12500, amount: 600000 },
  { type: 'item',     id: 'r14', itemNo: 'C.05', description: 'Post-tensioned slab at podium level', unit: 'm²', qty: 3200, rate: 380, amount: 1216000 },
  { type: 'subtotal', id: 's3',  itemNo: '',     description: 'Sub-total — Superstructure', unit: '', qty: '', rate: '', amount: 10618000 },
  { type: 'total',    id: 't1',  itemNo: '',     description: 'CONTRACT SUM (excl. contingencies)', unit: '', qty: '', rate: '', amount: 48500000 },
];

const DEMO_PROGRESS_ITEMS = [
  { id: 'pr1', code: 'A', description: 'Preliminaries', weight: 5, planned: 100, actual: 100 },
  { id: 'pr2', code: 'B', description: 'Substructure', weight: 18, planned: 100, actual: 100 },
  { id: 'pr3', code: 'C', description: 'Superstructure — Frame', weight: 30, planned: 85, actual: 78 },
  { id: 'pr4', code: 'D', description: 'Façade & External Envelope', weight: 20, planned: 45, actual: 32 },
  { id: 'pr5', code: 'E', description: 'MEP Rough-in Works', weight: 15, planned: 40, actual: 28 },
  { id: 'pr6', code: 'F', description: 'Internal Finishes', weight: 8, planned: 12, actual: 6 },
  { id: 'pr7', code: 'G', description: 'External Works & Landscaping', weight: 4, planned: 5, actual: 0 },
];

const DEMO_PROGRESS_HISTORY = [
  { period: 'Jan 2026', planned: 38, actual: 34 },
  { period: 'Feb 2026', planned: 44, actual: 40 },
  { period: 'Mar 2026', planned: 52, actual: 48 },
  { period: 'Apr 2026', planned: 60, actual: 56 },
  { period: 'May 2026', planned: 68, actual: 62 },
];

const DEMO_CERTIFICATES = [
  { id: 'ipc1', number: 1, date: '2024-04-30', status: 'paid',     amount: 1850000, retention: 185000, net: 1665000 },
  { id: 'ipc2', number: 2, date: '2024-07-31', status: 'paid',     amount: 2640000, retention: 264000, net: 2376000 },
  { id: 'ipc3', number: 3, date: '2024-10-31', status: 'paid',     amount: 3120000, retention: 312000, net: 2808000 },
  { id: 'ipc4', number: 4, date: '2025-01-31', status: 'approved', amount: 2980000, retention: 298000, net: 2682000 },
  { id: 'ipc5', number: 5, date: '2025-04-30', status: 'submitted',amount: 3450000, retention: 345000, net: 3105000 },
];

const DEMO_WORKPLAN = [
  { id: 'wp1',  section: true, description: 'SUBSTRUCTURE', status: 'completed' },
  { id: 'wp2',  section: false, description: 'Excavation & earthworks', start: '2024-01', end: '2024-03', planned: 100, actual: 100, status: 'completed' },
  { id: 'wp3',  section: false, description: 'Raft foundation', start: '2024-02', end: '2024-05', planned: 100, actual: 100, status: 'completed' },
  { id: 'wp4',  section: true, description: 'SUPERSTRUCTURE', status: 'in-progress' },
  { id: 'wp5',  section: false, description: 'Ground floor slab', start: '2024-04', end: '2024-06', planned: 100, actual: 100, status: 'completed' },
  { id: 'wp6',  section: false, description: 'Floors 1–10 columns & slabs', start: '2024-06', end: '2024-10', planned: 100, actual: 100, status: 'completed' },
  { id: 'wp7',  section: false, description: 'Floors 11–20 columns & slabs', start: '2024-10', end: '2025-02', planned: 100, actual: 96, status: 'in-progress' },
  { id: 'wp8',  section: false, description: 'Floors 21–30 columns & slabs', start: '2025-02', end: '2025-07', planned: 65, actual: 38, status: 'in-progress' },
  { id: 'wp9',  section: true, description: 'FAÇADE', status: 'in-progress' },
  { id: 'wp10', section: false, description: 'Unitised curtain wall — lower zone', start: '2025-01', end: '2025-08', planned: 45, actual: 28, status: 'in-progress' },
  { id: 'wp11', section: false, description: 'Unitised curtain wall — upper zone', start: '2025-06', end: '2026-02', planned: 10, actual: 0, status: 'pending' },
  { id: 'wp12', section: true, description: 'MEP', status: 'in-progress' },
  { id: 'wp13', section: false, description: 'Mechanical rough-in (GF-L10)', start: '2024-08', end: '2025-03', planned: 100, actual: 90, status: 'in-progress' },
  { id: 'wp14', section: false, description: 'Electrical conduit & tray (GF-L10)', start: '2024-09', end: '2025-04', planned: 80, actual: 62, status: 'in-progress' },
];

const DEMO_CORRESPONDENCE = [
  { id: 'cor1', ref: 'RCT-L-2025-042', type: 'Letter', subject: 'Request for Extension of Time — Clause 44.1', from: 'BuildCo Contracting', to: 'Apex Engineering', date: '2025-11-20', status: 'pending-approval' },
  { id: 'cor2', ref: 'RCT-RFI-2025-108', type: 'RFI',    subject: 'Clarification on curtain wall anchor detail — Grid F5', from: 'BuildCo Contracting', to: 'SSH International', date: '2025-11-18', status: 'open' },
  { id: 'cor3', ref: 'RCT-NCR-2025-015', type: 'NCR',    subject: 'Non-conformance — concrete cube failure, pour C-L22', from: 'Apex Engineering', to: 'BuildCo Contracting', date: '2025-11-15', status: 'closed' },
  { id: 'cor4', ref: 'RCT-L-2025-041',   type: 'Letter', subject: 'Approval of Revised Programme Rev. 5', from: 'Apex Engineering', to: 'BuildCo Contracting', date: '2025-11-10', status: 'closed' },
  { id: 'cor5', ref: 'RCT-SI-2025-033',  type: 'SI',     subject: 'Site Instruction — Additional drainage at Basement Level 2', from: 'Apex Engineering', to: 'BuildCo Contracting', date: '2025-11-05', status: 'open' },
];

const DEMO_MEETINGS = [
  {
    id: 'mm1',
    title: 'Monthly Progress Meeting #18',
    date: '2025-11-20',
    time: '09:00',
    location: 'Site Office — Conference Room A',
    chairperson: 'James Chen',
    preparedBy: 'James Chen',
    attendeeList: [
      { name: 'James Chen',       company: 'Apex Engineering',       role: 'Supervision Engineer' },
      { name: 'Sara Al Mansoori', company: 'Al Madar Investments',   role: 'Client Representative' },
      { name: 'Mike O\'Brien',    company: 'BuildCo Contracting',    role: 'Project Manager' },
      { name: 'Tariq Hassan',     company: 'BuildCo Contracting',    role: 'Site Engineer' },
      { name: 'Lena Bauer',       company: 'Apex Engineering',       role: 'QA/QC Manager' },
    ],
    agenda: [
      { id: 'ag1', item: '1. Review of previous meeting minutes and action items' },
      { id: 'ag2', item: '2. Progress update — Superstructure (Floors 21–30)' },
      { id: 'ag3', item: '3. Façade works programme review' },
      { id: 'ag4', item: '4. EOT claim status — Clause 44.1' },
      { id: 'ag5', item: '5. Quality non-conformances outstanding' },
      { id: 'ag6', item: '6. AOB' },
    ],
    actionItems: [
      { id: 'ai1', description: 'Submit revised concrete pour programme for L23–L26', assignee: 'Mike O\'Brien', deadline: '2025-11-27', status: 'open',    priority: 'high' },
      { id: 'ai2', description: 'Close NCR-015 — re-test cube samples submitted to lab', assignee: 'Tariq Hassan',  deadline: '2025-11-25', status: 'open',   priority: 'high' },
      { id: 'ai3', description: 'Issue RFI response for curtain wall anchor detail', assignee: 'James Chen',      deadline: '2025-11-28', status: 'open',    priority: 'medium' },
      { id: 'ai4', description: 'Provide updated cash flow forecast to client', assignee: 'Mike O\'Brien', deadline: '2025-11-22', status: 'closed',  priority: 'medium' },
      { id: 'ai5', description: 'Review and approve MEP coordination drawings L11–L20', assignee: 'Lena Bauer',  deadline: '2025-12-05', status: 'open',    priority: 'low'  },
    ],
    notes: 'Overall physical progress stands at 62% against a planned 68%. The superstructure is approximately 6 weeks behind schedule, primarily due to delayed approval of pour submissions. The EOT claim is under review; Apex to issue preliminary assessment by end of month.',
    nextMeeting: '2025-12-18',
  },
  {
    id: 'mm2',
    title: 'Technical Design Review — Façade',
    date: '2025-11-14',
    time: '14:00',
    location: 'Apex Engineering Office — Dubai',
    chairperson: 'James Chen',
    preparedBy: 'Lena Bauer',
    attendeeList: [
      { name: 'James Chen',    company: 'Apex Engineering',    role: 'Supervision Engineer' },
      { name: 'Lena Bauer',   company: 'Apex Engineering',    role: 'QA/QC Manager' },
      { name: 'Mike O\'Brien', company: 'BuildCo Contracting', role: 'Project Manager' },
      { name: 'Ravi Sharma',  company: 'GlassTech Façades',  role: 'Façade Specialist' },
    ],
    agenda: [
      { id: 'ag1', item: '1. Review unitised curtain wall system shop drawings' },
      { id: 'ag2', item: '2. Anchor bracket detail clarification' },
      { id: 'ag3', item: '3. Thermal performance compliance check' },
      { id: 'ag4', item: '4. Mock-up panel inspection results' },
    ],
    actionItems: [
      { id: 'ai1', description: 'Revise anchor bracket detail drawing and resubmit', assignee: 'Ravi Sharma',  deadline: '2025-11-21', status: 'open',   priority: 'high' },
      { id: 'ai2', description: 'Issue formal approval for mock-up panel inspection',  assignee: 'James Chen', deadline: '2025-11-18', status: 'closed', priority: 'high' },
      { id: 'ai3', description: 'Confirm thermal performance U-value calculation',      assignee: 'Lena Bauer', deadline: '2025-11-25', status: 'open',   priority: 'medium' },
    ],
    notes: 'Mock-up panel inspection completed satisfactorily. Anchor bracket detail requires revision due to structural interference at grid F5. GlassTech to resubmit revised detail within 7 days.',
    nextMeeting: 'TBC — subject to revised drawing submission',
  },
  {
    id: 'mm3',
    title: 'Monthly Progress Meeting #17',
    date: '2025-10-22',
    time: '09:00',
    location: 'Site Office — Conference Room A',
    chairperson: 'James Chen',
    preparedBy: 'James Chen',
    attendeeList: [
      { name: 'James Chen',       company: 'Apex Engineering',     role: 'Supervision Engineer' },
      { name: 'Sara Al Mansoori', company: 'Al Madar Investments', role: 'Client Representative' },
      { name: 'Mike O\'Brien',    company: 'BuildCo Contracting',  role: 'Project Manager' },
      { name: 'Tariq Hassan',     company: 'BuildCo Contracting',  role: 'Site Engineer' },
    ],
    agenda: [
      { id: 'ag1', item: '1. Review of previous meeting minutes' },
      { id: 'ag2', item: '2. Progress update — Floors 16–20' },
      { id: 'ag3', item: '3. IPC No. 4 submission review' },
      { id: 'ag4', item: '4. Programme acceleration measures' },
    ],
    actionItems: [
      { id: 'ai1', description: 'Submit IPC No. 4 supporting documentation', assignee: 'Mike O\'Brien', deadline: '2025-10-29', status: 'closed', priority: 'high' },
      { id: 'ai2', description: 'Prepare programme acceleration proposal',   assignee: 'Mike O\'Brien', deadline: '2025-11-05', status: 'closed', priority: 'medium' },
      { id: 'ai3', description: 'Issue approval for revised programme Rev.4', assignee: 'James Chen',   deadline: '2025-11-08', status: 'closed', priority: 'medium' },
    ],
    notes: 'IPC No. 4 submitted and under review. Programme acceleration measures agreed — contractor to provide additional formwork sets for upper floors. All actions from previous meeting closed.',
    nextMeeting: '2025-11-20',
  },
];

const DEMO_DOCUMENTS = [
  { id: 'd1', name: 'Progress Report — May 2026', type: 'Progress Report', date: '2026-05-01', status: 'final' },
  { id: 'd2', name: 'IPC No. 5 — Draft Certificate', type: 'Payment Certificate', date: '2025-04-30', status: 'draft' },
  { id: 'd3', name: 'Contract Data Summary', type: 'Contract Document', date: '2024-01-15', status: 'final' },
  { id: 'd4', name: 'EOT Assessment Report', type: 'Claim Document', date: '2025-11-22', status: 'draft' },
];

const DEMO_LIBRARY = [
  { id: 'l1', name: 'Column Grid Layout', category: 'structural', desc: '6m×6m grid with load annotations and pile cap details.', tags: ['grid','column','structural'], src: 'seed' },
  { id: 'l2', name: 'Foundation Section', category: 'details',    desc: 'Footing-to-slab connection with rebar callouts.', tags: ['footing','rebar','section'], src: 'seed' },
  { id: 'l3', name: 'Electrical Panel Board', category: 'electrical', desc: 'Panel layout with circuit labelling.', tags: ['panel','electrical'], src: 'seed' },
  { id: 'l4', name: 'Piping Isometric', category: 'mechanical', desc: 'Isometric piping with valve symbols.', tags: ['pipe','isometric','valve'], src: 'seed' },
  { id: 'l5', name: 'Site Plan Reference', category: 'civil', desc: 'North arrow, scale bar, and site orientation block.', tags: ['site','civil','north'], src: 'seed' },
];

const DEMO_USERS = [
  { name: 'James Chen', email: 'james@apexeng.ae', company: 'Apex Engineering', role: 'supervision' },
  { name: 'Sara Al Mansoori', email: 'sara@madar.ae', company: 'Al Madar Investments', role: 'employer' },
  { name: 'Mike O\'Brien', email: 'mike@buildco.ae', company: 'BuildCo Contracting', role: 'contractor' },
];

function currency(val) {
  if (!val && val !== 0) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val);
}

function pct(val) { return `${Number(val || 0).toFixed(1)}%`; }

function statusBadge(status) {
  const map = {
    'paid': 'ok', 'approved': 'accent', 'submitted': 'warn',
    'active': 'ok', 'completed': 'ok', 'in-progress': 'accent',
    'pending': 'warn', 'pending-approval': 'warn', 'open': 'warn',
    'closed': 'neutral', 'final': 'ok', 'draft': 'warn',
  };
  return map[status] || 'neutral';
}

function timelinePercent(project) {
  if (!project.start_date || !project.end_date) return 0;
  const start = new Date(project.start_date), end = new Date(project.end_date), now = new Date();
  const total = end - start, elapsed = now - start;
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

Object.assign(window, {
  DEMO_PROJECTS, DEMO_BOQ, DEMO_PROGRESS_ITEMS, DEMO_PROGRESS_HISTORY,
  DEMO_CERTIFICATES, DEMO_WORKPLAN, DEMO_CORRESPONDENCE, DEMO_MEETINGS,
  DEMO_DOCUMENTS, DEMO_LIBRARY, DEMO_USERS,
  currency, pct, statusBadge, timelinePercent,
});
