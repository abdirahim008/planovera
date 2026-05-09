/* pb-dashboard.jsx — Portfolio + Project Overview dashboards */

/* ── Shared sub-components ── */
function Gauge({ value, tone = 'accent', size = 96 }) {
  const r = size * 0.38, circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, value)) / 100);
  const colors = { accent: '#3b82f6', ok: '#22c55e', warn: '#f59e0b', err: '#ef4444' };
  const col = colors[tone] || colors.accent;
  return (
    <div className="gauge-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.05)" strokeWidth={size*0.09} fill="none" />
        <circle cx={size/2} cy={size/2} r={r} stroke={col} strokeWidth={size*0.09} fill="none"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="gauge-label">
        <div className="gauge-val" style={{ color: col, fontSize: size * 0.19 }}>{Math.round(value)}</div>
        <div className="gauge-unit">%</div>
      </div>
    </div>
  );
}

function SparkLine({ values = [], tone = 'accent', height = 40 }) {
  const colors = { accent: '#3b82f6', ok: '#22c55e', warn: '#f59e0b', err: '#ef4444' };
  const col = colors[tone] || colors.accent;
  const safe = values.length > 1 ? values : [0, 0, ...(values.length ? values : [0])];
  const max = Math.max(...safe, 1), min = Math.min(...safe, 0), range = Math.max(max - min, 1);
  const pts = safe.map((v, i) => `${(i / (safe.length - 1)) * 100},${height - ((v - min) / range) * (height - 6)}`).join(' ');
  const area = `0,${height} ${pts} 100,${height}`;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }} className="w-full">
      <defs>
        <linearGradient id={`sg-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.3" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${tone})`} />
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DualLine({ history }) {
  if (!history || history.length < 2) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt-d)', fontSize: 11 }}>No history data</div>;
  const planned = history.map(h => h.planned), actual = history.map(h => h.actual);
  const all = [...planned, ...actual], maxV = Math.max(...all, 1);
  const W = 260, H = 100, px = (i) => (i / (history.length - 1)) * W, py = (v) => H - (v / maxV) * (H - 10);
  const planPts = planned.map((v,i) => `${px(i)},${py(v)}`).join(' ');
  const actPts  = actual.map((v,i)  => `${px(i)},${py(v)}`).join(' ');
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />Planned</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />Actual</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90 }}>
        {[20, 50, 80].map(y => <line key={y} x1="0" y1={py(y)} x2={W} y2={py(y)} stroke="rgba(255,255,255,0.05)" />)}
        <polyline points={planPts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
        <polyline points={actPts}  fill="none" stroke="var(--ok)"     strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {actual.map((v,i) => <circle key={i} cx={px(i)} cy={py(v)} r="3" fill="var(--ok)" />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {history.map(h => <span key={h.period} style={{ fontSize: 9, color: 'var(--txt-d)', textAlign: 'center' }}>{h.period.replace(' 2026','').replace(' 2025','')}</span>)}
      </div>
    </div>
  );
}

function ProgressStrip({ label, value, tone = 'accent' }) {
  const colors = { accent: '#3b82f6', ok: '#22c55e', warn: '#f59e0b', err: '#ef4444' };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <span>{label}</span><span style={{ color: colors[tone] }}>{pct(value)}</span>
      </div>
      <div className="pbar">
        <div className="pbar-fill" style={{ width: `${Math.min(100, value)}%`, background: `linear-gradient(90deg, ${colors[tone]}, ${colors[tone]}88)` }} />
      </div>
    </div>
  );
}

/* ── Portfolio Dashboard ── */
function PortfolioDashboard({ projects, onOpenProject, onCreateProject }) {
  const totalApproved = DEMO_CERTIFICATES.reduce((s, c) => s + (c.status === 'paid' ? c.net : 0), 0);
  const avgPhysical = projects.reduce((s, p) => s + p.physical, 0) / Math.max(projects.length, 1);
  const avgFinancial = projects.reduce((s, p) => s + p.financial, 0) / Math.max(projects.length, 1);

  return (
    <div className="animate-in" style={{ maxWidth: 1320, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">ProBuild · Portfolio</div>
          <div className="page-title">Overall Project Control Centre</div>
          <div className="page-sub">Track all projects from one command surface with live progress, commercial position, and action items.</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-primary" onClick={onCreateProject}>{I.plus} New Project</button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Hero cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left hero */}
          <div style={{ background: 'linear-gradient(135deg, #12161f 0%, #0f1520 100%)', border: '1px solid var(--border)', borderRadius: 24, padding: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />
            <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--txt-d)', marginBottom: 8 }}>Portfolio Commercial Position</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-0.03em', marginBottom: 4 }}>AED {currency(totalApproved)}</div>
              <div style={{ fontSize: 12, color: 'var(--txt-m)', marginBottom: 20 }}>Paid certificates across all active projects</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Avg Physical</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--ok)' }}>{avgPhysical.toFixed(0)}%</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Avg Financial</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{avgFinancial.toFixed(0)}%</div>
                </div>
              </div>
            </div>
          </div>
          {/* Right: gauges */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 24, padding: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--txt-d)', marginBottom: 16 }}>Portfolio Averages</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}>
                <Gauge value={avgPhysical} tone="ok" size={100} />
                <div style={{ fontSize: 11, color: 'var(--txt-m)', marginTop: 8 }}>Physical Progress</div>
              </div>
              <div style={{ width: 1, height: 80, background: 'var(--border)' }} />
              <div style={{ textAlign: 'center' }}>
                <Gauge value={avgFinancial} tone="accent" size={100} />
                <div style={{ fontSize: 11, color: 'var(--txt-m)', marginTop: 8 }}>Financial Progress</div>
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <DualLine history={DEMO_PROGRESS_HISTORY} />
            </div>
          </div>
        </div>

        {/* Project cards */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Projects Register</div>
            <span className="badge badge-neutral">{projects.length} projects</span>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden' }}>
            <table className="data-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Contract Value</th>
                  <th style={{ width: 180 }}>Planned vs Actual</th>
                  <th style={{ width: 100 }}>Physical</th>
                  <th style={{ width: 100 }}>Financial</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)', cursor: 'pointer', marginBottom: 2 }} onClick={() => onOpenProject(p.id)}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt-d)' }}>{p.code} · {p.location}</div>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--txt)' }}>{p.currency} {currency(p.contractAmount)}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <ProgressStrip label="Plan" value={p.plannedProgress} tone="accent" />
                        <ProgressStrip label="Actual" value={p.actualProgress} tone={p.actualProgress >= p.plannedProgress ? 'ok' : 'warn'} />
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ok)', marginBottom: 4 }}>{p.physical}%</div>
                      <div className="pbar"><div className="pbar-fill" style={{ width: `${p.physical}%`, background: 'var(--ok)' }} /></div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--accent)', marginBottom: 4 }}>{p.financial}%</div>
                      <div className="pbar"><div className="pbar-fill" style={{ width: `${p.financial}%`, background: 'var(--accent)' }} /></div>
                    </td>
                    <td><span className={`badge badge-${p.role === 'supervision' ? 'accent' : p.role === 'employer' ? 'ok' : 'warn'}`}>{p.role}</span></td>
                    <td><button className="btn btn-sm btn-primary" onClick={() => onOpenProject(p.id)}>Open {I.arrow_r}</button></td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon">{I.building}</div>
                      <div className="empty-state-title">No projects yet</div>
                      <div className="empty-state-sub">Create your first project to get started with BOQ, progress tracking, and payment certificates.</div>
                      <button className="btn btn-primary" onClick={onCreateProject}>{I.plus} New Project</button>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Project Overview Dashboard ── */
function ProjectDashboard({ project, setModule }) {
  const tl = timelinePercent(project);
  const start = project.start_date ? new Date(project.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const end   = project.end_date   ? new Date(project.end_date).toLocaleDateString('en-GB',   { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const paidTotal = DEMO_CERTIFICATES.filter(c => c.status === 'paid').reduce((s,c) => s + c.net, 0);
  const pendingTotal = DEMO_CERTIFICATES.filter(c => c.status === 'submitted' || c.status === 'approved').reduce((s,c) => s + c.net, 0);

  const quickLinks = [
    { id: 'boq',            label: 'BOQ',            icon: 'table',    badge: '21 items',         tone: 'accent'  },
    { id: 'progress',       label: 'Progress',       icon: 'activity', badge: 'May 2026 — active', tone: 'ok'     },
    { id: 'payment',        label: 'Payments',       icon: 'dollar',   badge: '5 certificates',   tone: 'accent'  },
    { id: 'workplan',       label: 'Work Plan',      icon: 'cal',      badge: '14 activities',    tone: 'warn'    },
    { id: 'drawings',       label: 'Drawings',       icon: 'pen',      badge: '3 sheets',         tone: 'purple'  },
    { id: 'correspondence', label: 'Correspondence', icon: 'mail',     badge: '5 records',        tone: 'warn'    },
    { id: 'documents',      label: 'Documents',      icon: 'file',     badge: '4 generated',      tone: 'neutral' },
    { id: 'meetings',       label: 'Meetings',       icon: 'chat',     badge: '3 minutes',        tone: 'neutral' },
  ];

  return (
    <div className="animate-in" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">{project.code} · {project.role}</div>
          <div className="page-title">{project.name}</div>
          <div className="page-sub">{project.contractTitle} · {project.location}</div>
        </div>
        <div className="page-header-right">
          <span className={`badge badge-${project.role === 'supervision' ? 'accent' : project.role === 'employer' ? 'ok' : 'warn'}`}>{project.role}</span>
          <span className="badge badge-ok">Active</span>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { label: 'Contract Value', val: `${project.currency} ${currency(project.contractAmount)}`, sub: project.clientName, tone: 'accent', icon: 'wallet', spark: [1,1,1,1,1] },
            { label: 'Physical Progress', val: `${project.physical}%`, sub: `${project.plannedProgress}% planned · ${project.physical >= project.plannedProgress ? '+' : ''}${project.physical - project.plannedProgress}% variance`, tone: project.physical >= project.plannedProgress ? 'ok' : 'warn', icon: 'activity', spark: DEMO_PROGRESS_HISTORY.map(h => h.actual) },
            { label: 'Certified to Date', val: `${project.currency} ${currency(paidTotal)}`, sub: `${currency(pendingTotal)} pending approval`, tone: 'accent', icon: 'dollar', spark: DEMO_CERTIFICATES.map(c => c.net/100000) },
            { label: 'Open Actions', val: '5', sub: '2 overdue · 3 from last meeting', tone: 'warn', icon: 'warn_tri', spark: [8,6,7,4,5] },
          ].map((kpi, i) => (
            <div key={i} className="metric-tile">
              <div className="metric-tile-top" style={{ background: `linear-gradient(90deg, transparent, ${kpi.tone === 'ok' ? 'var(--ok)' : kpi.tone === 'warn' ? 'var(--warn)' : 'var(--accent)'}, transparent)` }} />
              <div className="metric-tile-icon" style={{ background: `${kpi.tone === 'ok' ? 'var(--ok-s)' : kpi.tone === 'warn' ? 'var(--warn-s)' : 'var(--accent-s)'}`, color: kpi.tone === 'ok' ? 'var(--ok)' : kpi.tone === 'warn' ? 'var(--warn)' : 'var(--accent)', borderColor: 'transparent' }}>
                {I[kpi.icon]}
              </div>
              <div className="metric-tile-name">{kpi.label}</div>
              <div className="metric-tile-val">{kpi.val}</div>
              <div className="metric-tile-sub">{kpi.sub}</div>
              <div style={{ marginTop: 10 }}><SparkLine values={kpi.spark} tone={kpi.tone} height={36} /></div>
            </div>
          ))}
        </div>

        {/* Middle row: gauges + timeline */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Progress gauges */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--txt-d)', marginBottom: 16 }}>Progress Summary</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <Gauge value={project.physical} tone="ok" size={88} />
                  <div style={{ fontSize: 10, color: 'var(--txt-m)', marginTop: 6 }}>Physical</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Gauge value={project.financial} tone="accent" size={88} />
                  <div style={{ fontSize: 10, color: 'var(--txt-m)', marginTop: 6 }}>Financial</div>
                </div>
              </div>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ marginBottom: 12 }}>
                  <DualLine history={DEMO_PROGRESS_HISTORY} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {DEMO_PROGRESS_ITEMS.slice(0, 4).map(item => (
                    <ProgressStrip key={item.id} label={item.description.split(' ')[0]} value={item.actual} tone={item.actual >= item.planned ? 'ok' : 'warn'} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Timeline + commercial */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Timeline */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 20, flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--txt-d)', marginBottom: 12 }}>Project Timeline</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 11 }}>
                <span style={{ color: 'var(--txt-m)' }}>{start}</span>
                <span className="badge badge-warn">{Math.round(100 - tl)}% remaining</span>
                <span style={{ color: 'var(--txt-m)' }}>{end}</span>
              </div>
              <div className="timeline-bar pbar-lg">
                <div className="timeline-fill pbar-fill" style={{ width: `${tl}%`, background: 'linear-gradient(90deg, var(--accent), var(--ok))' }} />
                <div className="timeline-today" style={{ left: `${tl}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--txt-d)' }}>
                <span>Start</span>
                <span style={{ color: 'var(--warn)' }}>Today — {tl.toFixed(0)}% elapsed</span>
                <span>Completion</span>
              </div>
            </div>
            {/* Commercial summary */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--txt-d)', marginBottom: 12 }}>Commercial Position</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Paid', val: `AED ${currency(paidTotal)}`, tone: 'ok' },
                  { label: 'Approved', val: `AED ${currency(DEMO_CERTIFICATES.filter(c=>c.status==='approved').reduce((s,c)=>s+c.net,0))}`, tone: 'accent' },
                  { label: 'Submitted', val: `AED ${currency(DEMO_CERTIFICATES.filter(c=>c.status==='submitted').reduce((s,c)=>s+c.net,0))}`, tone: 'warn' },
                ].map(item => (
                  <div key={item.label} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: item.tone === 'ok' ? 'var(--ok)' : item.tone === 'warn' ? 'var(--warn)' : 'var(--accent)', fontFamily: 'JetBrains Mono' }}>{item.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 12 }}>Workspace Modules</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {quickLinks.map(link => (
              <button key={link.id} onClick={() => setModule(link.id)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-l)'; e.currentTarget.style.background = 'var(--raised)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: link.tone === 'neutral' ? 'var(--raised)' : `var(--${link.tone}-s)`, color: link.tone === 'neutral' ? 'var(--txt-d)' : `var(--${link.tone})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {I[link.icon]}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{link.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt-d)', marginTop: 1 }}>{link.badge}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Create Project Modal ── */
function CreateProjectModal({ open, onClose, onCreate }) {
  const [form, setForm] = React.useState({ name: '', type: 'construction', role: 'supervision', code: '', clientName: '', contractorName: '', location: '', contractAmount: '', currency: 'AED', start_date: '', end_date: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <div className="modal-title">Create New Project</div>
          <button className="btn btn-sm btn-icon" onClick={onClose}>{I.x}</button>
        </div>
        <div className="modal-body">
          <div className="field"><label className="field-label">Project Name *</label><input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Riverside Commercial Tower" /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Type</label><select className="field-select" value={form.type} onChange={e => set('type', e.target.value)}><option value="construction">Construction</option><option value="non-construction">Non-Construction</option></select></div>
            <div className="field"><label className="field-label">Role</label><select className="field-select" value={form.role} onChange={e => set('role', e.target.value)}><option value="supervision">Supervision</option><option value="employer">Employer</option><option value="contractor">Contractor</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">Project Code</label><input className="field-input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="RCT-2024" /></div>
            <div className="field"><label className="field-label">Location</label><input className="field-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Dubai, UAE" /></div>
          </div>
          <div className="field"><label className="field-label">Client Name</label><input className="field-input" value={form.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Al Madar Investments" /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Contract Amount</label><input className="field-input" value={form.contractAmount} onChange={e => set('contractAmount', e.target.value)} placeholder="48500000" /></div>
            <div className="field"><label className="field-label">Currency</label><select className="field-select" value={form.currency} onChange={e => set('currency', e.target.value)}><option>AED</option><option>USD</option><option>EUR</option><option>GBP</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">Start Date</label><input className="field-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
            <div className="field"><label className="field-label">End Date</label><input className="field-input" type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { if (form.name.trim()) { onCreate(form); onClose(); } }}>{I.plus} Create Project</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PortfolioDashboard, ProjectDashboard, CreateProjectModal, Gauge, SparkLine, ProgressStrip });
