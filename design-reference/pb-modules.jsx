/* pb-modules.jsx — All workspace modules — Enhanced */

/* ── Shared Module Shell ── */
function ModuleShell({ eyebrow, title, sub, actions, children }) {
  return (
    <div className="animate-in" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-eyebrow">{eyebrow}</div>
          <div className="page-title">{title}</div>
          {sub && <div className="page-sub">{sub}</div>}
        </div>
        {actions && <div className="page-header-right">{actions}</div>}
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  );
}

/* ══════════════════════════════════
   BOQ Module — Full inline editing
   Tab to move between cells
   qty × rate = auto amount
══════════════════════════════════ */
function BOQModule({ project, toast }) {
  const [rows, setRows] = React.useState(DEMO_BOQ.map(r => ({ ...r })));
  const [activeCell, setActiveCell] = React.useState(null); // { rowId, col }
  const [selectedRows, setSelectedRows] = React.useState(new Set());

  const itemIds = rows.filter(r => r.type === 'item').map(r => r.id);
  const EDITABLE_COLS = ['description', 'unit', 'qty', 'rate'];

  const updateCell = (rowId, col, rawVal) => {
    setRows(rs => rs.map(r => {
      if (r.id !== rowId) return r;
      const updated = { ...r, [col]: rawVal };
      if (col === 'qty' || col === 'rate') {
        const q = parseFloat(col === 'qty' ? rawVal : r.qty) || 0;
        const rt = parseFloat(col === 'rate' ? rawVal : r.rate) || 0;
        updated.amount = q * rt;
      }
      return updated;
    }));
  };

  const navigateCell = (rowId, col, dir) => {
    const cols = EDITABLE_COLS;
    const ci = cols.indexOf(col);
    const ri = itemIds.indexOf(rowId);
    if (dir === 'tab') {
      if (ci < cols.length - 1) setActiveCell({ rowId, col: cols[ci + 1] });
      else if (ri < itemIds.length - 1) setActiveCell({ rowId: itemIds[ri + 1], col: cols[0] });
      else setActiveCell(null);
    } else if (dir === 'shift-tab') {
      if (ci > 0) setActiveCell({ rowId, col: cols[ci - 1] });
      else if (ri > 0) setActiveCell({ rowId: itemIds[ri - 1], col: cols[cols.length - 1] });
    } else if (dir === 'down') {
      if (ri < itemIds.length - 1) setActiveCell({ rowId: itemIds[ri + 1], col });
    } else if (dir === 'up') {
      if (ri > 0) setActiveCell({ rowId: itemIds[ri - 1], col });
    } else if (dir === 'escape') {
      setActiveCell(null);
    }
  };

  const addRow = () => {
    const newRow = { type: 'item', id: `r${Date.now()}`, itemNo: '', description: 'New item', unit: 'm²', qty: 0, rate: 0, amount: 0 };
    setRows(rs => [...rs, newRow]);
    setTimeout(() => setActiveCell({ rowId: newRow.id, col: 'description' }), 50);
    toast('Row added — start typing to edit.');
  };

  const deleteSelected = () => {
    setRows(rs => rs.filter(r => !selectedRows.has(r.id)));
    setSelectedRows(new Set());
    toast(`${selectedRows.size} row${selectedRows.size > 1 ? 's' : ''} deleted.`);
  };

  const totalAmount = rows.filter(r => r.type === 'item').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const contractAmt = parseFloat(project.contractAmount) || 0;

  const CellInput = ({ rowId, col, value, align = 'left', mono = false }) => {
    const isActive = activeCell?.rowId === rowId && activeCell?.col === col;
    const [draft, setDraft] = React.useState(String(value ?? ''));
    React.useEffect(() => { setDraft(String(value ?? '')); }, [value]);

    const commit = () => updateCell(rowId, col, draft);
    const handleKey = e => {
      if (e.key === 'Tab') { e.preventDefault(); commit(); navigateCell(rowId, col, e.shiftKey ? 'shift-tab' : 'tab'); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(); navigateCell(rowId, col, 'down'); }
      else if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value ?? '')); navigateCell(rowId, col, 'escape'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); commit(); navigateCell(rowId, col, 'down'); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); commit(); navigateCell(rowId, col, 'up'); }
    };

    if (isActive) return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { commit(); setActiveCell(null); }}
        onKeyDown={handleKey}
        style={{
          width: '100%', background: 'var(--bg)', border: '1px solid var(--accent)',
          borderRadius: 4, padding: '3px 8px', color: 'var(--txt)', font: 'inherit',
          fontSize: 12, outline: 'none', textAlign: align,
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
          boxShadow: '0 0 0 3px var(--accent-s)',
        }}
      />
    );

    return (
      <div
        onClick={() => setActiveCell({ rowId, col })}
        style={{
          width: '100%', padding: '4px 8px', borderRadius: 4, cursor: 'text',
          textAlign: align, fontFamily: mono ? 'JetBrains Mono, monospace' : 'inherit',
          fontSize: 12, color: 'var(--txt)', userSelect: 'none',
          border: '1px solid transparent',
          transition: 'border-color 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-l)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
        title="Click to edit · Tab to next cell"
      >
        {mono && (col === 'qty' || col === 'rate') ? (Number(value) || 0).toLocaleString() : value}
      </div>
    );
  };

  const rowBg = r => {
    if (r.type === 'header')   return { background: 'rgba(13,124,102,0.18)', borderLeft: '3px solid #0d7c66' };
    if (r.type === 'subtotal') return { background: 'rgba(20,30,45,0.8)' };
    if (r.type === 'total')    return { background: 'rgba(20,20,43,0.95)', borderTop: '2px solid var(--border-l)' };
    return {};
  };

  return (
    <ModuleShell eyebrow="Bill of Quantities" title={`BOQ — ${project.name}`}
      sub="Click any cell to edit · Tab to move between cells · Enter to move down · qty × rate auto-calculates amount"
      actions={<>
        {selectedRows.size > 0 && <button className="btn btn-sm btn-danger" onClick={deleteSelected}>{I.trash} Delete {selectedRows.size}</button>}
        <button className="btn btn-sm" onClick={() => toast('Exporting to Excel…')}>{I.download} Export XLS</button>
        <button className="btn btn-sm btn-primary" onClick={addRow}>{I.plus} Add Row</button>
      </>}>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px 16px 0 0', overflow: 'hidden', borderBottom: 'none' }}>
        {[
          { label: 'Contract Sum',      val: `${project.currency} ${currency(contractAmt)}`,                                   tone: 'accent' },
          { label: 'BOQ Total',         val: `${project.currency} ${currency(totalAmount)}`,                                    tone: 'ok'     },
          { label: 'Variance',          val: `${project.currency} ${currency(Math.abs(contractAmt - totalAmount))}`,            tone: Math.abs(contractAmt - totalAmount) < 1000 ? 'ok' : 'warn' },
          { label: 'Sections',          val: rows.filter(r => r.type === 'header').length,                                      tone: 'neutral' },
          { label: 'Line Items',        val: rows.filter(r => r.type === 'item').length,                                        tone: 'neutral' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 18px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'JetBrains Mono', color: s.tone === 'ok' ? 'var(--ok)' : s.tone === 'warn' ? 'var(--warn)' : s.tone === 'accent' ? 'var(--accent)' : 'var(--txt)' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0 0 16px 16px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ width: 36, padding: '10px 8px' }}></th>
                <th style={{ width: 80, padding: '10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', textAlign: 'left' }}>Item No.</th>
                <th style={{ padding: '10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', textAlign: 'left' }}>Description</th>
                <th style={{ width: 72, padding: '10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', textAlign: 'center' }}>Unit</th>
                <th style={{ width: 110, padding: '10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', textAlign: 'right' }}>Quantity</th>
                <th style={{ width: 130, padding: '10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', textAlign: 'right' }}>Rate ({project.currency})</th>
                <th style={{ width: 150, padding: '10px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', textAlign: 'right' }}>Amount ({project.currency})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', ...rowBg(row), transition: 'background 0.1s' }}>
                  <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                    {row.type === 'item' && (
                      <input type="checkbox" checked={selectedRows.has(row.id)}
                        onChange={e => { const s = new Set(selectedRows); e.target.checked ? s.add(row.id) : s.delete(row.id); setSelectedRows(s); }}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    )}
                  </td>
                  <td style={{ padding: '4px 8px', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--txt-d)' }}>{row.itemNo}</td>
                  <td style={{ padding: '4px 4px', fontWeight: row.type !== 'item' ? 700 : 400, fontSize: row.type === 'header' ? 11 : 13, textTransform: row.type === 'header' ? 'uppercase' : 'none', letterSpacing: row.type === 'header' ? '0.06em' : 0 }}>
                    {row.type === 'item'
                      ? <CellInput rowId={row.id} col="description" value={row.description} />
                      : <span style={{ paddingLeft: 8 }}>{row.description}</span>}
                  </td>
                  <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                    {row.type === 'item' && <CellInput rowId={row.id} col="unit" value={row.unit} align="center" />}
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    {row.type === 'item'
                      ? <CellInput rowId={row.id} col="qty" value={row.qty} align="right" mono />
                      : <span style={{ display: 'block', textAlign: 'right', padding: '4px 8px', fontFamily: 'JetBrains Mono', fontSize: 12 }}></span>}
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    {row.type === 'item'
                      ? <CellInput rowId={row.id} col="rate" value={row.rate} align="right" mono />
                      : <span style={{ display: 'block', textAlign: 'right', padding: '4px 8px', fontFamily: 'JetBrains Mono', fontSize: 12 }}></span>}
                  </td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: row.type !== 'item' ? 800 : 500, color: row.type === 'total' ? 'var(--accent)' : row.type === 'subtotal' ? 'var(--txt)' : 'var(--txt-m)' }}>
                    {row.amount !== '' ? currency(parseFloat(row.amount) || 0) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer hint */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--txt-d)', display: 'flex', gap: 16 }}>
          <span>Click cell to edit</span><span>Tab → next cell</span><span>Shift+Tab ← prev</span><span>Enter ↓ row</span><span>↑↓ arrow rows</span><span>Esc — cancel</span>
        </div>
      </div>
    </ModuleShell>
  );
}

/* ══════════════════════════════════
   Progress Module — with S-Curve
══════════════════════════════════ */
function ProgressModule({ project, toast }) {
  const [period] = React.useState('May 2026');
  const weightedActual  = DEMO_PROGRESS_ITEMS.reduce((s, i) => s + (i.weight * i.actual  / 100), 0);
  const weightedPlanned = DEMO_PROGRESS_ITEMS.reduce((s, i) => s + (i.weight * i.planned / 100), 0);

  /* ── S-Curve data ── */
  const SCurve = () => {
    const W = 560, H = 180, PAD = { t: 16, r: 24, b: 32, l: 44 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const n = DEMO_PROGRESS_HISTORY.length;

    // Cumulative
    let cumPlan = 0, cumAct = 0;
    const points = DEMO_PROGRESS_HISTORY.map((h, i) => {
      cumPlan += h.planned / n * 1.8;
      cumAct  += h.actual  / n * 1.8;
      return { x: i, planned: Math.min(cumPlan, 100), actual: Math.min(cumAct, 100) };
    });

    const xFn = i => PAD.l + (i / (n - 1)) * cW;
    const yFn = v => PAD.t + cH - (v / 100) * cH;

    const planPts  = points.map(p => `${xFn(p.x)},${yFn(p.planned)}`).join(' ');
    const actPts   = points.map(p => `${xFn(p.x)},${yFn(p.actual)}`).join(' ');
    const actArea  = `${xFn(0)},${PAD.t + cH} ${actPts} ${xFn(n-1)},${PAD.t + cH}`;

    const yTicks = [0, 25, 50, 75, 100];

    return (
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="sc-act" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD.l} y1={yFn(v)} x2={PAD.l + cW} y2={yFn(v)} stroke="rgba(255,255,255,0.05)" strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={PAD.l - 6} y={yFn(v) + 4} textAnchor="end" fontSize={9} fill="var(--txt-d)" fontFamily="JetBrains Mono">{v}%</text>
          </g>
        ))}
        {/* X labels */}
        {DEMO_PROGRESS_HISTORY.map((h, i) => (
          <text key={i} x={xFn(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--txt-d)" fontFamily="DM Sans">{h.period.split(' ')[0]}</text>
        ))}
        {/* Actual area */}
        <polygon points={actArea} fill="url(#sc-act)" />
        {/* Planned dashed line */}
        <polyline points={planPts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Actual solid line */}
        <polyline points={actPts} fill="none" stroke="var(--ok)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={xFn(i)} cy={yFn(p.planned)} r={3} fill="var(--accent)" />
            <circle cx={xFn(i)} cy={yFn(p.actual)}  r={4} fill="var(--ok)" stroke="var(--surface)" strokeWidth={1.5} />
            {/* Variance label */}
            {p.actual < p.planned && (
              <text x={xFn(i)} y={yFn(p.actual) - 8} textAnchor="middle" fontSize={8} fill="var(--warn)" fontFamily="JetBrains Mono">
                {(p.actual - p.planned).toFixed(1)}%
              </text>
            )}
          </g>
        ))}
        {/* Legend */}
        <g transform={`translate(${PAD.l}, ${PAD.t - 2})`}>
          <circle cx={6} cy={6} r={4} fill="var(--accent)" /><text x={14} y={10} fontSize={9} fill="var(--txt-m)" fontFamily="DM Sans">Planned (cumul.)</text>
          <circle cx={106} cy={6} r={4} fill="var(--ok)" /><text x={114} y={10} fontSize={9} fill="var(--txt-m)" fontFamily="DM Sans">Actual (cumul.)</text>
        </g>
      </svg>
    );
  };

  return (
    <ModuleShell eyebrow="Progress Report" title={`Progress — ${period}`}
      sub="Physical progress by work section · S-curve shows cumulative planned vs actual trajectory"
      actions={<>
        <button className="btn btn-sm" onClick={() => toast('PDF generated.')}>{I.pdf} Generate PDF</button>
        <button className="btn btn-sm btn-primary" onClick={() => toast('New report period created.')}>{I.plus} New Period</button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Main table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>Work Section Breakdown</div>
              <span className="badge badge-accent">Period: {period}</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th style={{ textAlign: 'right', width: 60 }}>Wt %</th>
                  <th style={{ width: 150 }}>Planned</th>
                  <th style={{ width: 150 }}>Actual</th>
                  <th style={{ textAlign: 'right', width: 80 }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_PROGRESS_ITEMS.map(item => {
                  const variance = item.actual - item.planned;
                  return (
                    <tr key={item.id}>
                      <td><div style={{ fontWeight: 600, color: 'var(--txt)', fontSize: 12 }}>{item.code}. {item.description}</div></td>
                      <td className="right mono">{item.weight}%</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="pbar" style={{ flex: 1 }}><div className="pbar-fill" style={{ width: `${item.planned}%`, background: 'var(--accent)' }} /></div>
                          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--accent)', width: 34, textAlign: 'right' }}>{item.planned}%</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="pbar" style={{ flex: 1 }}><div className="pbar-fill" style={{ width: `${item.actual}%`, background: variance >= 0 ? 'var(--ok)' : 'var(--warn)' }} /></div>
                          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: variance >= 0 ? 'var(--ok)' : 'var(--warn)', width: 34, textAlign: 'right' }}>{item.actual}%</span>
                        </div>
                      </td>
                      <td className="right">
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono', color: variance >= 0 ? 'var(--ok)' : 'var(--err)' }}>{variance >= 0 ? '+' : ''}{variance.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-l)' }}>
                  <td style={{ fontWeight: 800, color: 'var(--txt)', padding: '12px 14px' }}>Weighted Overall</td>
                  <td className="right mono" style={{ fontWeight: 700, padding: '12px 14px' }}>100%</td>
                  <td style={{ padding: '12px 14px' }}><span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{weightedPlanned.toFixed(1)}%</span></td>
                  <td style={{ padding: '12px 14px' }}><span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 800, color: 'var(--ok)' }}>{weightedActual.toFixed(1)}%</span></td>
                  <td className="right" style={{ padding: '12px 14px' }}><span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 800, color: weightedActual >= weightedPlanned ? 'var(--ok)' : 'var(--err)' }}>{(weightedActual - weightedPlanned).toFixed(1)}%</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* S-Curve */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 14 }}>S-Curve — Cumulative Progress</div>
            <SCurve />
          </div>
        </div>
        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 14 }}>Period Summary</div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}><Gauge value={weightedActual} tone={weightedActual >= weightedPlanned ? 'ok' : 'warn'} size={100} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ProgressStrip label="Planned" value={weightedPlanned} tone="accent" />
              <ProgressStrip label="Actual"  value={weightedActual}  tone={weightedActual >= weightedPlanned ? 'ok' : 'warn'} />
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 12 }}>History</div>
            <SparkLine values={DEMO_PROGRESS_HISTORY.map(h => h.actual)} tone="ok" height={48} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {DEMO_PROGRESS_HISTORY.slice(-3).map(h => (
                <div key={h.period} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--txt-m)' }}>{h.period}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', color: h.actual >= h.planned ? 'var(--ok)' : 'var(--warn)' }}>{h.actual}% actual</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </ModuleShell>
  );
}

/* ══════════════════════════════════
   Payment Module
══════════════════════════════════ */
function PaymentModule({ project, toast }) {
  const paid       = DEMO_CERTIFICATES.filter(c => c.status === 'paid').reduce((s,c) => s + c.net, 0);
  const totalNet   = DEMO_CERTIFICATES.reduce((s,c) => s + c.net, 0);
  const retention  = DEMO_CERTIFICATES.reduce((s,c) => s + c.retention, 0);
  return (
    <ModuleShell eyebrow="Payment Certificates" title="Interim Payment Certificates" sub="Track all IPCs with amounts, retentions, and approval status."
      actions={<button className="btn btn-sm btn-primary" onClick={() => toast('New IPC created.')}>{I.plus} New IPC</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[
            { label: 'Total Certified', val: `${project.currency} ${currency(totalNet)}`, tone: 'accent' },
            { label: 'Total Paid',      val: `${project.currency} ${currency(paid)}`,     tone: 'ok'     },
            { label: 'Retention Held',  val: `${project.currency} ${currency(retention)}`, tone: 'warn'  },
            { label: 'Certificates',    val: DEMO_CERTIFICATES.length,                     tone: 'neutral'},
          ].map((s,i) => (
            <div key={i} className="metric-tile">
              <div className="metric-tile-name">{s.label}</div>
              <div className="metric-tile-val" style={{ fontSize: 20, color: s.tone==='ok'?'var(--ok)':s.tone==='warn'?'var(--warn)':s.tone==='accent'?'var(--accent)':'var(--txt)' }}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Certificate</th><th>Date</th><th className="right">Gross</th><th className="right">Retention</th><th className="right">Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {DEMO_CERTIFICATES.map(cert => (
                <tr key={cert.id}>
                  <td><span style={{ fontWeight: 700, color: 'var(--txt)', fontFamily: 'JetBrains Mono', fontSize: 12 }}>IPC {cert.number}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--txt-m)' }}>{new Date(cert.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                  <td className="right mono">{project.currency} {currency(cert.amount)}</td>
                  <td className="right mono" style={{ color: 'var(--warn)' }}>{project.currency} {currency(cert.retention)}</td>
                  <td className="right mono" style={{ fontWeight: 700, color: 'var(--txt)' }}>{project.currency} {currency(cert.net)}</td>
                  <td><span className={`badge badge-${statusBadge(cert.status)}`}>{cert.status}</span></td>
                  <td><div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm" onClick={() => toast(`Opened IPC ${cert.number}.`)}>{I.edit}</button>
                    <button className="btn btn-sm" onClick={() => toast(`PDF generated for IPC ${cert.number}.`)}>{I.pdf}</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModuleShell>
  );
}

/* ══════════════════════════════════
   Work Plan — Elegant Gantt
   · Zoom: Month / Quarter / Year
   · Drag bars to reschedule
   · Critical path highlighting
══════════════════════════════════ */
function WorkPlanModule({ project, toast }) {
  const [zoomLevel, setZoomLevel] = React.useState('quarter'); // 'month'|'quarter'|'year'
  const [items, setItems] = React.useState(DEMO_WORKPLAN.map(i => ({ ...i })));
  const [hoveredRow, setHoveredRow] = React.useState(null);
  const [dragging, setDragging] = React.useState(null);
  const containerRef = React.useRef(null);

  // Timeline constants
  const TIMELINE_START_YEAR = 2024;
  const TOTAL_MONTHS = 36; // Jan 2024 – Dec 2026
  const TODAY_MONTH_IDX = (2026 - TIMELINE_START_YEAR) * 12 + 3; // Apr 2026 = idx 27

  const toMonthIdx = str => {
    if (!str) return 0;
    const [y, m] = str.split('-').map(Number);
    return (y - TIMELINE_START_YEAR) * 12 + (m - 1);
  };
  const fromMonthIdx = idx => {
    const y = TIMELINE_START_YEAR + Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return `${y}-${String(m).padStart(2,'0')}`;
  };

  // Zoom config
  const zoomConfig = {
    month: {
      cols: Array.from({ length: 36 }, (_, i) => {
        const y = TIMELINE_START_YEAR + Math.floor(i / 12);
        const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i % 12];
        return { label: m, span: 1, idx: i };
      }),
      colSpan: 1,
      totalCols: 36,
      yearGroups: [{ label:'2024',cols:12 },{ label:'2025',cols:12 },{ label:'2026',cols:12 }],
    },
    quarter: {
      cols: ['Q1','Q2','Q3','Q4','Q1','Q2','Q3','Q4','Q1','Q2','Q3','Q4'].map((q,i) => ({ label: q, span: 3, idx: i * 3 })),
      colSpan: 3,
      totalCols: 12,
      yearGroups: [{ label:'2024',cols:4 },{ label:'2025',cols:4 },{ label:'2026',cols:4 }],
    },
    year: {
      cols: [{ label:'2024',span:12,idx:0 },{ label:'2025',span:12,idx:12 },{ label:'2026',span:12,idx:24 }],
      colSpan: 12,
      totalCols: 3,
      yearGroups: [],
    },
  };
  const zc = zoomConfig[zoomLevel];

  // Compute critical path: activities behind schedule where actual < planned - 10
  const criticalIds = new Set(
    items.filter(i => !i.section && typeof i.actual === 'number' && typeof i.planned === 'number' && (i.planned - i.actual) > 10).map(i => i.id)
  );

  const todayPct = (TODAY_MONTH_IDX / TOTAL_MONTHS) * 100;

  // Drag handling
  const FIXED_WIDTH = 340; // px for left columns

  const handleBarMouseDown = (e, itemId, type) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const item = items.find(i => i.id === itemId);
    if (!item || !item.start) return;
    setDragging({ itemId, type, startX: e.clientX, origStart: item.start, origEnd: item.end });
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = e => {
      const container = containerRef.current;
      if (!container) return;
      const ganttW = container.clientWidth - FIXED_WIDTH;
      const dx = e.clientX - dragging.startX;
      const monthsDelta = Math.round((dx / ganttW) * TOTAL_MONTHS);
      if (monthsDelta === 0) return;

      const origSI = toMonthIdx(dragging.origStart);
      const origEI = toMonthIdx(dragging.origEnd);
      const dur = origEI - origSI;

      setItems(prev => prev.map(item => {
        if (item.id !== dragging.itemId) return item;
        if (dragging.type === 'move') {
          const newSI = Math.max(0, Math.min(TOTAL_MONTHS - dur - 1, origSI + monthsDelta));
          return { ...item, start: fromMonthIdx(newSI), end: fromMonthIdx(newSI + dur) };
        } else if (dragging.type === 'resize-end') {
          const newEI = Math.max(origSI + 1, Math.min(TOTAL_MONTHS - 1, origEI + monthsDelta));
          return { ...item, end: fromMonthIdx(newEI) };
        } else if (dragging.type === 'resize-start') {
          const newSI = Math.max(0, Math.min(origEI - 1, origSI + monthsDelta));
          return { ...item, start: fromMonthIdx(newSI) };
        }
        return item;
      }));
    };
    const onUp = () => { setDragging(null); toast('Activity rescheduled.'); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  const GanttBar = ({ item }) => {
    if (!item.start || !item.end) return null;
    const si  = toMonthIdx(item.start);
    const ei  = toMonthIdx(item.end) + 1;
    const left  = (si / TOTAL_MONTHS) * 100;
    const width = Math.max(((ei - si) / TOTAL_MONTHS) * 100, 0.5);
    const isCrit = criticalIds.has(item.id);
    const colors = {
      completed:   '#22c55e',
      'in-progress': isCrit ? '#ef4444' : '#3b82f6',
      pending:     '#4f5872',
    };
    const col = colors[item.status] || colors.pending;
    const actualW = item.actual > 0 ? (item.actual / 100) * width : 0;

    return (
      <div style={{ position: 'relative', height: 32, display: 'flex', alignItems: 'center' }}>
        {/* Ghost planned span */}
        <div
          style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, height: 12, top: 10, borderRadius: 99, background: `${col}22`, border: `1px solid ${col}44`, cursor: dragging ? 'grabbing' : 'grab' }}
          onMouseDown={e => handleBarMouseDown(e, item.id, 'move')}
          title={`${item.start} → ${item.end} · Drag to reschedule`}
        >
          {/* Resize start handle */}
          <div style={{ position: 'absolute', left: -3, top: -2, width: 6, height: 16, borderRadius: 3, background: col, cursor: 'ew-resize', opacity: hoveredRow === item.id ? 1 : 0, transition: 'opacity 0.15s' }}
            onMouseDown={e => { e.stopPropagation(); handleBarMouseDown(e, item.id, 'resize-start'); }} />
          {/* Resize end handle */}
          <div style={{ position: 'absolute', right: -3, top: -2, width: 6, height: 16, borderRadius: 3, background: col, cursor: 'ew-resize', opacity: hoveredRow === item.id ? 1 : 0, transition: 'opacity 0.15s' }}
            onMouseDown={e => { e.stopPropagation(); handleBarMouseDown(e, item.id, 'resize-end'); }} />
        </div>
        {/* Actual progress fill */}
        {item.actual > 0 && (
          <div style={{ position: 'absolute', left: `${left}%`, width: `${actualW}%`, height: 12, top: 10, borderRadius: 99, minWidth: 3, pointerEvents: 'none',
            background: `linear-gradient(90deg, ${col}, ${col}bb)`,
            boxShadow: isCrit ? `0 0 10px ${col}88` : `0 0 6px ${col}44`,
          }} />
        )}
        {/* Critical path indicator */}
        {isCrit && (
          <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, height: 12, top: 10, borderRadius: 99, border: '2px solid var(--err)', pointerEvents: 'none', boxShadow: '0 0 8px rgba(239,68,68,0.4)' }} />
        )}
        {/* Completion diamond */}
        {item.status === 'completed' && (
          <div style={{ position: 'absolute', left: `calc(${left + width}% - 6px)`, top: 10, width: 12, height: 12, background: col, transform: 'rotate(45deg)', borderRadius: 2, pointerEvents: 'none', boxShadow: `0 0 6px ${col}88` }} />
        )}
        {/* Progress label */}
        {item.actual > 0 && width > 5 && (
          <div style={{ position: 'absolute', left: `calc(${left}% + 5px)`, top: 7, fontSize: 9, fontWeight: 700, color: col, pointerEvents: 'none', whiteSpace: 'nowrap', textShadow: '0 0 6px var(--bg)' }}>
            {item.actual}%
          </div>
        )}
      </div>
    );
  };

  const statsRow = [
    { label: 'Activities', val: items.filter(i => !i.section).length },
    { label: 'Completed',  val: items.filter(i => !i.section && i.status === 'completed').length,    color: 'var(--ok)'     },
    { label: 'Active',     val: items.filter(i => !i.section && i.status === 'in-progress').length,  color: 'var(--accent)' },
    { label: 'Pending',    val: items.filter(i => !i.section && i.status === 'pending').length,       color: 'var(--txt-d)'  },
    { label: 'Critical',   val: criticalIds.size,                                                     color: 'var(--err)'    },
  ];

  return (
    <ModuleShell eyebrow="Work Plan" title="Construction Programme"
      sub={`Rev 5 · ${items.filter(i => !i.section && i.status === 'completed').length} of ${items.filter(i => !i.section).length} activities complete · ${criticalIds.size} critical`}
      actions={<>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, marginRight: 6 }}>
          {[{l:'Completed',c:'var(--ok)'},{l:'In Progress',c:'var(--accent)'},{l:'Critical',c:'var(--err)'},{l:'Pending',c:'var(--txt-d)'}].map(({l,c}) => (
            <span key={l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--txt-m)' }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:c, display:'inline-block' }} />{l}
            </span>
          ))}
        </div>
        {/* Zoom toggle */}
        <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 3, gap: 2 }}>
          {['month','quarter','year'].map(z => (
            <button key={z} onClick={() => setZoomLevel(z)}
              style={{ height: 26, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s', background: zoomLevel === z ? 'var(--raised)' : 'transparent', color: zoomLevel === z ? 'var(--txt)' : 'var(--txt-d)' }}>
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn-sm" onClick={() => toast('Programme exported.')}>{I.download} Export</button>
        <button className="btn btn-sm btn-primary" onClick={() => toast('Activity added.')}>{I.plus} Add</button>
      </>}>

      <div ref={containerRef} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'default', userSelect: dragging ? 'none' : 'auto' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 900 }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 10 }}>
              {/* Left fixed cols */}
              <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
                <div style={{ padding: '8px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)' }}>Activity</div>
              </div>
              <div style={{ width: 80, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)' }}>Status</div>
              </div>
              {/* Timeline header */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {/* Year row (only for month/quarter zoom) */}
                {zoomLevel !== 'year' && (
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                    {['2024','2025','2026'].map(yr => (
                      <div key={yr} style={{ flex: 1, textAlign: 'center', padding: '4px 0', fontSize: 10, fontWeight: 800, color: 'var(--txt-m)', letterSpacing: '0.1em', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>{yr}</div>
                    ))}
                  </div>
                )}
                {/* Col labels */}
                <div style={{ display: 'flex' }}>
                  {zc.cols.map((col, ci) => (
                    <div key={ci} style={{ flex: 1, textAlign: 'center', padding: '4px 0', fontSize: 9, fontWeight: 600, color: col.idx <= TODAY_MONTH_IDX && col.idx + col.span > TODAY_MONTH_IDX ? 'var(--warn)' : 'var(--txt-d)', letterSpacing: '0.06em', borderRight: '1px solid rgba(255,255,255,0.04)', background: ci % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      {col.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Rows ── */}
            <div style={{ position: 'relative' }}>
              {/* Today line */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: `calc(340px + ${todayPct}%)`, background: 'var(--warn)', opacity: 0.7, zIndex: 5, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: 0, left: -18, background: 'var(--warn)', color: '#000', fontSize: 8, fontWeight: 900, borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', letterSpacing: '0.06em' }}>TODAY</div>
              </div>
              {/* Alternating column bands */}
              {zc.cols.map((col, ci) => ci % 2 === 0 && (
                <div key={ci} style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(340px + ${(col.idx / TOTAL_MONTHS) * 100}%)`, width: `${(col.span / TOTAL_MONTHS) * 100}%`, background: 'rgba(255,255,255,0.008)', pointerEvents: 'none', zIndex: 0 }} />
              ))}

              {items.map(item => {
                const isSection = item.section;
                const isCrit = criticalIds.has(item.id);
                return (
                  <div key={item.id}
                    style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border)', background: isSection ? 'rgba(59,130,246,0.04)' : hoveredRow === item.id ? 'var(--hover)' : 'transparent', transition: 'background 0.1s', position: 'relative', zIndex: 1 }}
                    onMouseEnter={() => setHoveredRow(item.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Activity */}
                    <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', padding: isSection ? '10px 16px' : '7px 16px 7px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      {isSection ? (
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 3, height: 12, background: 'var(--accent)', borderRadius: 2, flexShrink: 0 }} />
                          {item.description}
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, color: isCrit ? 'var(--err)' : 'var(--txt)', fontWeight: isCrit ? 600 : 400, lineHeight: 1.3 }}>{item.description}</div>
                          {item.start && <div style={{ fontSize: 9, color: 'var(--txt-d)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>{item.start} → {item.end}</div>}
                        </>
                      )}
                    </div>
                    {/* Status */}
                    <div style={{ width: 80, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px 6px' }}>
                      {!isSection && <span className={`badge badge-${statusBadge(item.status)}`} style={{ fontSize: 9, padding: '0 6px' }}>{item.status === 'in-progress' ? 'Active' : item.status === 'completed' ? 'Done' : 'Pending'}</span>}
                    </div>
                    {/* Gantt */}
                    <div style={{ flex: 1, padding: isSection ? '0 12px' : '2px 12px', display: 'flex', alignItems: 'center', position: 'relative', minHeight: isSection ? 28 : 40 }}>
                      {isSection
                        ? <div style={{ width: '100%', height: 1, background: 'var(--border)', opacity: 0.4 }} />
                        : <div style={{ width: '100%', position: 'relative' }}>
                            <GanttBar item={item} />
                            {isCrit && hoveredRow === item.id && (
                              <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: 'var(--err)', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                                {I.warn_tri} Critical
                              </div>
                            )}
                          </div>
                      }
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.015)' }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                {statsRow.map(s => (
                  <div key={s.label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--txt-d)' }}>{s.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: s.color || 'var(--txt)', fontFamily: 'JetBrains Mono' }}>{s.val}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--txt-d)' }}>Jan 2024 – Dec 2026 · Drag bars to reschedule · Resize handles appear on hover</div>
            </div>
          </div>
        </div>
      </div>
    </ModuleShell>
  );
}

/* ══════════════════════════════════
   Correspondence Module
══════════════════════════════════ */
function CorrespondenceModule({ project, toast }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = DEMO_CORRESPONDENCE.filter(c => filter === 'all' || c.status === filter);
  return (
    <ModuleShell eyebrow="Correspondence Register" title="Correspondence" sub="Letters, RFIs, NCRs, and site instructions."
      actions={<>
        <div style={{ display:'flex', gap:4 }}>
          {['all','open','pending-approval','closed'].map(f => (
            <button key={f} className={`btn btn-sm ${filter===f?'btn-primary':''}`} onClick={() => setFilter(f)}>{f==='all'?'All':f==='pending-approval'?'Pending':f.charAt(0).toUpperCase()+f.slice(1)}</button>
          ))}
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => toast('New record created.')}>{I.plus} New Record</button>
      </>}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, overflow:'hidden' }}>
        <table className="data-table">
          <thead><tr><th>Reference</th><th>Type</th><th>Subject</th><th>From</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map(rec => (
              <tr key={rec.id}>
                <td><span style={{ fontFamily:'JetBrains Mono', fontSize:11, color:'var(--accent)' }}>{rec.ref}</span></td>
                <td><span className="badge badge-neutral">{rec.type}</span></td>
                <td style={{ color:'var(--txt)', fontWeight:500, maxWidth:280 }}><div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:260 }}>{rec.subject}</div></td>
                <td style={{ fontSize:11, color:'var(--txt-m)' }}>{rec.from}</td>
                <td style={{ fontSize:11, color:'var(--txt-d)', fontFamily:'JetBrains Mono' }}>{new Date(rec.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</td>
                <td><span className={`badge badge-${statusBadge(rec.status)}`}>{rec.status.replace('-',' ')}</span></td>
                <td><button className="btn btn-sm" onClick={() => toast(`Opened ${rec.ref}.`)}>{I.edit}</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7}><div className="empty-state"><div className="empty-state-icon">{I.mail}</div><div className="empty-state-title">No records match</div></div></td></tr>}
          </tbody>
        </table>
      </div>
    </ModuleShell>
  );
}

/* ══════════════════════════════════
   Documents Module
══════════════════════════════════ */
function DocumentsModule({ project, toast }) {
  return (
    <ModuleShell eyebrow="Document Registry" title="Generated Documents" sub="Progress reports, payment certificates, and contract documents."
      actions={<button className="btn btn-sm btn-primary" onClick={() => toast('Generating…')}>{I.plus} Generate</button>}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
        {DEMO_DOCUMENTS.map(doc => (
          <div key={doc.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:18, display:'flex', alignItems:'flex-start', gap:14 }}>
            <div style={{ width:40, height:48, background:'var(--raised)', border:'1px solid var(--border)', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--accent)' }}>
              {I.pdf}<div style={{ fontSize:8, color:'var(--txt-d)', marginTop:2, textTransform:'uppercase' }}>PDF</div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--txt)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
              <div style={{ fontSize:11, color:'var(--txt-d)', marginTop:3 }}>{doc.type} · {new Date(doc.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
              <div style={{ marginTop:8, display:'flex', gap:6 }}>
                <span className={`badge badge-${statusBadge(doc.status)}`}>{doc.status}</span>
                <button className="btn btn-sm" onClick={() => toast(`Downloading ${doc.name}…`)}>{I.download} Download</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ModuleShell>
  );
}

/* ══════════════════════════════════
   Meetings Module — Full interactive
   · List view with click-to-open
   · Detail view: attendees, agenda, action items
   · New meeting modal
   · Action item status toggle
══════════════════════════════════ */
function MeetingsModule({ project, toast }) {
  const [meetings, setMeetings] = React.useState(DEMO_MEETINGS);
  const [activeMeeting, setActiveMeeting] = React.useState(null);
  const [showNewModal, setShowNewModal] = React.useState(false);
  const [actionFilter, setActionFilter] = React.useState('all');

  /* ── New meeting form state ── */
  const blankForm = () => ({ title: '', date: '', time: '09:00', location: '', chairperson: '', notes: '', attendees: '', agenda: '' });
  const [form, setForm] = React.useState(blankForm());
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const meeting = activeMeeting ? meetings.find(m => m.id === activeMeeting) : null;

  /* ── Toggle action item status ── */
  const toggleAction = (meetingId, actionId) => {
    setMeetings(ms => ms.map(m => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        actionItems: m.actionItems.map(a =>
          a.id === actionId ? { ...a, status: a.status === 'closed' ? 'open' : 'closed' } : a
        ),
      };
    }));
  };

  /* ── Create new meeting ── */
  const createMeeting = () => {
    if (!form.title.trim() || !form.date) { toast('Please fill in title and date.'); return; }
    const newMeeting = {
      id: `mm${Date.now()}`,
      title: form.title.trim(),
      date: form.date,
      time: form.time,
      location: form.location.trim() || 'TBC',
      chairperson: form.chairperson.trim(),
      preparedBy: form.chairperson.trim(),
      attendeeList: form.attendees.split('\n').filter(Boolean).map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { name: parts[0] || line, company: parts[1] || '', role: parts[2] || '' };
      }),
      agenda: form.agenda.split('\n').filter(Boolean).map((item, i) => ({ id: `ag${i}`, item: `${i+1}. ${item}` })),
      actionItems: [],
      notes: form.notes.trim(),
      nextMeeting: '',
    };
    setMeetings(ms => [newMeeting, ...ms]);
    setActiveMeeting(newMeeting.id);
    setShowNewModal(false);
    setForm(blankForm());
    toast(`"${newMeeting.title}" created.`);
  };

  const priorityColor = p => p === 'high' ? 'var(--err)' : p === 'medium' ? 'var(--warn)' : 'var(--txt-d)';

  /* ── List view ── */
  const ListView = () => (
    <ModuleShell eyebrow="Meeting Minutes" title="Meeting Minutes & Action Items"
      sub="Click a meeting to open it · Manage attendees, agenda and action items"
      actions={
        <button className="btn btn-sm btn-primary" onClick={() => setShowNewModal(true)}>{I.plus} New Meeting</button>
      }>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Meeting cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meetings.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">{I.chat}</div>
              <div className="empty-state-title">No meetings yet</div>
              <div className="empty-state-sub">Create your first meeting minute to get started.</div>
              <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>{I.plus} New Meeting</button>
            </div>
          )}
          {meetings.map(m => {
            const openActions = m.actionItems.filter(a => a.status === 'open').length;
            const overdueActions = m.actionItems.filter(a => a.status === 'open' && a.deadline < '2026-04-26').length;
            return (
              <div key={m.id}
                onClick={() => setActiveMeeting(m.id)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', gap: 16, alignItems: 'flex-start' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--raised)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)'; }}
              >
                {/* Date block */}
                <div style={{ width: 52, flexShrink: 0, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)' }}>{new Date(m.date).toLocaleDateString('en-GB', { month: 'short' })}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--txt)', lineHeight: 1.1 }}>{new Date(m.date).getDate()}</div>
                  <div style={{ fontSize: 9, color: 'var(--txt-d)', fontFamily: 'JetBrains Mono' }}>{new Date(m.date).getFullYear()}</div>
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--txt-d)', marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>{m.time} · {m.location}</span>
                    <span>{m.attendeeList.length} attendees</span>
                    <span>{m.agenda.length} agenda items</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral">{m.actionItems.length} actions</span>
                    {openActions > 0 && <span className="badge badge-warn">{openActions} open</span>}
                    {overdueActions > 0 && <span className="badge badge-err">{overdueActions} overdue</span>}
                    {openActions === 0 && m.actionItems.length > 0 && <span className="badge badge-ok">All closed</span>}
                  </div>
                </div>
                {/* Arrow */}
                <div style={{ color: 'var(--txt-d)', alignSelf: 'center', flexShrink: 0 }}>{I.arrow_r}</div>
              </div>
            );
          })}
        </div>

        {/* Summary sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Overall action items */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 14 }}>All Action Items</div>
            {[
              { label: 'Total',   val: meetings.reduce((s,m) => s + m.actionItems.length, 0),                               color: 'var(--txt)' },
              { label: 'Open',    val: meetings.reduce((s,m) => s + m.actionItems.filter(a=>a.status==='open').length, 0),   color: 'var(--warn)' },
              { label: 'Closed',  val: meetings.reduce((s,m) => s + m.actionItems.filter(a=>a.status==='closed').length, 0), color: 'var(--ok)' },
              { label: 'Overdue', val: meetings.reduce((s,m) => s + m.actionItems.filter(a=>a.status==='open'&&a.deadline<'2026-04-26').length, 0), color: 'var(--err)' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--txt-m)' }}>{s.label}</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: 'JetBrains Mono' }}>{s.val}</span>
              </div>
            ))}
          </div>
          {/* Open action items list */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 12 }}>Open Actions</div>
            {meetings.flatMap(m => m.actionItems.filter(a => a.status === 'open').map(a => ({ ...a, meetingTitle: m.title }))).slice(0, 6).map(a => (
              <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--txt)', lineHeight: 1.4, marginBottom: 3 }}>{a.description}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt-d)' }}>
                  <span>{a.assignee}</span>
                  <span style={{ color: a.deadline < '2026-04-26' ? 'var(--err)' : 'var(--txt-d)', fontFamily: 'JetBrains Mono' }}>{a.deadline}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModuleShell>
  );

  /* ── Detail view ── */
  const DetailView = () => {
    if (!meeting) return null;
    const filtered = actionFilter === 'all' ? meeting.actionItems : meeting.actionItems.filter(a => a.status === actionFilter);

    return (
      <div className="animate-in" style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div className="page-header">
          <div className="page-header-left">
            <button className="btn btn-sm" onClick={() => setActiveMeeting(null)} style={{ marginBottom: 8 }}>{I.arrow_l} All meetings</button>
            <div className="page-eyebrow">{new Date(meeting.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {meeting.time}</div>
            <div className="page-title">{meeting.title}</div>
            <div className="page-sub">{meeting.location} · Chair: {meeting.chairperson}</div>
          </div>
          <div className="page-header-right">
            <button className="btn btn-sm" onClick={() => toast('PDF generated.')}>{I.pdf} Export PDF</button>
            <button className="btn btn-sm btn-primary" onClick={() => toast('New action item added.')}>{I.plus} Add Action</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', gap: 20 }}>
          {/* Left col */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Notes */}
            {meeting.notes && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)', marginBottom: 10 }}>Summary / Minutes</div>
                <div style={{ fontSize: 13, color: 'var(--txt-m)', lineHeight: 1.8 }}>{meeting.notes}</div>
              </div>
            )}

            {/* Agenda */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)' }}>Agenda</div>
              </div>
              {meeting.agenda.map((ag, i) => (
                <div key={ag.id} style={{ display: 'flex', gap: 14, padding: '11px 16px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--raised)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--txt-d)', flexShrink: 0, fontFamily: 'JetBrains Mono' }}>{i + 1}</div>
                  <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5, paddingTop: 2 }}>{ag.item.replace(/^\d+\.\s*/, '')}</div>
                </div>
              ))}
            </div>

            {/* Action items */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)' }}>Action Items</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['all','open','closed'].map(f => (
                    <button key={f} className={`btn btn-sm ${actionFilter === f ? 'btn-primary' : ''}`} style={{ height: 24, padding: '0 10px', fontSize: 10 }} onClick={() => setActionFilter(f)}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Action</th>
                    <th style={{ width: 140 }}>Assignee</th>
                    <th style={{ width: 100 }}>Deadline</th>
                    <th style={{ width: 80 }}>Priority</th>
                    <th style={{ width: 90 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => {
                    const isOverdue = a.status === 'open' && a.deadline < '2026-04-26';
                    return (
                      <tr key={a.id} style={{ opacity: a.status === 'closed' ? 0.6 : 1 }}>
                        <td style={{ textAlign: 'center', padding: '8px' }}>
                          <input type="checkbox" checked={a.status === 'closed'}
                            onChange={() => toggleAction(meeting.id, a.id)}
                            style={{ accentColor: 'var(--ok)', width: 14, height: 14, cursor: 'pointer' }}
                            title={a.status === 'closed' ? 'Mark as open' : 'Mark as closed'} />
                        </td>
                        <td style={{ color: 'var(--txt)', fontWeight: 500, textDecoration: a.status === 'closed' ? 'line-through' : 'none' }}>
                          {a.description}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--txt-m)' }}>{a.assignee}</td>
                        <td style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: isOverdue ? 'var(--err)' : 'var(--txt-d)', fontWeight: isOverdue ? 700 : 400 }}>
                          {a.deadline}{isOverdue && ' ⚠'}
                        </td>
                        <td>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor(a.priority), display: 'inline-block', marginRight: 5 }} />
                          <span style={{ fontSize: 11, color: priorityColor(a.priority) }}>{a.priority}</span>
                        </td>
                        <td>
                          <button onClick={() => toggleAction(meeting.id, a.id)}
                            className={`badge badge-${a.status === 'closed' ? 'ok' : 'warn'}`}
                            style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 10 }}>
                            {a.status === 'closed' ? 'Closed' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-state" style={{ padding: '20px 0' }}><div style={{ color: 'var(--txt-d)', fontSize: 12 }}>No action items match the filter.</div></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Next meeting */}
            {meeting.nextMeeting && (
              <div style={{ background: 'var(--accent-s)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: '12px 16px', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 10 }}>
                {I.cal} <strong>Next meeting:</strong> {meeting.nextMeeting}
              </div>
            )}
          </div>

          {/* Right col — attendees */}
          <div style={{ width: 260, flexShrink: 0 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)' }}>Attendees ({meeting.attendeeList.length})</div>
              </div>
              {meeting.attendeeList.map((att, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-s)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                    {att.name.split(' ').slice(0,2).map(n=>n[0]).join('')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt-d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.role}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt-d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.company}</div>
                  </div>
                </div>
              ))}
              <div style={{ padding: '10px 14px' }}>
                <button className="btn btn-sm btn-full" onClick={() => toast('Attendee added.')}>{I.plus} Add Attendee</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── New Meeting Modal ── */
  const NewMeetingModal = () => (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNewModal(false)}>
      <div className="modal-box" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <div className="modal-title">New Meeting Minute</div>
          <button className="btn btn-sm btn-icon" onClick={() => setShowNewModal(false)}>{I.x}</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Meeting Title *</label>
            <input className="field-input" value={form.title} onChange={e => setF('title', e.target.value)} placeholder="Monthly Progress Meeting #19" />
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">Date *</label><input className="field-input" type="date" value={form.date} onChange={e => setF('date', e.target.value)} /></div>
            <div className="field"><label className="field-label">Time</label><input className="field-input" type="time" value={form.time} onChange={e => setF('time', e.target.value)} /></div>
          </div>
          <div className="field">
            <label className="field-label">Location</label>
            <input className="field-input" value={form.location} onChange={e => setF('location', e.target.value)} placeholder="Site Office — Conference Room A" />
          </div>
          <div className="field">
            <label className="field-label">Chairperson</label>
            <input className="field-input" value={form.chairperson} onChange={e => setF('chairperson', e.target.value)} placeholder="James Chen" />
          </div>
          <div className="field">
            <label className="field-label">Attendees (one per line: Name, Company, Role)</label>
            <textarea className="field-textarea" style={{ minHeight: 90 }} value={form.attendees} onChange={e => setF('attendees', e.target.value)} placeholder={"James Chen, Apex Engineering, Supervision Engineer\nMike O'Brien, BuildCo, Project Manager"} />
          </div>
          <div className="field">
            <label className="field-label">Agenda (one item per line)</label>
            <textarea className="field-textarea" style={{ minHeight: 90 }} value={form.agenda} onChange={e => setF('agenda', e.target.value)} placeholder={"Review of previous minutes\nProgress update\nAOB"} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Summary Notes</label>
            <textarea className="field-textarea" value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Key discussion points, decisions made…" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={() => setShowNewModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={createMeeting}>{I.plus} Create Meeting</button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {activeMeeting ? <DetailView /> : <ListView />}
      {showNewModal && <NewMeetingModal />}
    </>
  );
}

Object.assign(window, { BOQModule, ProgressModule, PaymentModule, WorkPlanModule, CorrespondenceModule, DocumentsModule, MeetingsModule });
