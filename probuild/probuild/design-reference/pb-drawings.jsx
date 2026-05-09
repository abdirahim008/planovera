/* pb-drawings.jsx — SVG Canvas Editor embedded as a module */

const PAPER_SIZES = ['A0','A1','A2','A3','A4','Letter'];
const DRAWING_TOOLS = [
  { id: 'select',    icon: 'cursor',    label: 'Select',    kbd: 'V' },
  { id: 'pan',       icon: 'hand',      label: 'Pan',       kbd: 'H' },
  { id: 'line',      icon: 'line_tool', label: 'Line',      kbd: 'L' },
  { id: 'dimension', icon: 'dim',       label: 'Dimension', kbd: 'D' },
  { id: 'trim',      icon: 'trim',      label: 'Trim',      kbd: 'T' },
];

function DrawingsModule({ project, toast }) {
  const [tool, setTool] = React.useState('select');
  const [zoom, setZoom] = React.useState(0.68);
  const [panelTab, setPanelTab] = React.useState('library');
  const [paperSize, setPaperSize] = React.useState('A1');
  const [orientation, setOrientation] = React.useState('landscape');
  const [selectedCount, setSelectedCount] = React.useState(0);
  const [sheets, setSheets] = React.useState([
    { id: 's1', name: 'Ground Floor Plan' },
    { id: 's2', name: 'Site Plan' },
    { id: 's3', name: 'Sections' },
  ]);
  const [activeSheet, setActiveSheet] = React.useState(0);
  const [libQuery, setLibQuery] = React.useState('');
  const [libCat, setLibCat] = React.useState('all');
  const [svgText, setSvgText] = React.useState('');
  const [strokeColor, setStrokeColor] = React.useState('#0f172a');
  const [strokeWidth, setStrokeWidth] = React.useState(1.2);
  const [titleBlock, setTitleBlock] = React.useState({
    projectTitle: project?.name || 'Riverside Commercial Tower',
    drawingTitle: 'Ground Floor Plan',
    drawingNo: 'RCT-DWG-001',
    revision: 'A',
    scale: '1:100',
    drawnBy: 'J. Chen',
    checkedBy: 'M. Park',
    date: new Date().toISOString().slice(0,10),
  });

  const paperW = Math.round((orientation === 'landscape' ? 1122 : 793) * zoom);
  const paperH = Math.round((orientation === 'landscape' ? 793  : 1122) * zoom);

  const filteredLib = DEMO_LIBRARY.filter(item => {
    const catOk = libCat === 'all' || item.category === libCat;
    const q = libQuery.toLowerCase();
    return catOk && (!q || (item.name + item.desc + item.tags.join(' ')).toLowerCase().includes(q));
  });

  const toolHints = {
    select: 'Click to select · Shift+click multi-select · Drag to move',
    pan: 'Drag to pan canvas · Scroll to zoom',
    line: 'Click start → click end · Shift = constrain angle',
    dimension: 'Click p1 → p2 → drag offset',
    trim: 'Click near line end to trim to nearest intersection',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Drawings Toolbar ── */}
      <div className="drawings-toolbar">
        {/* Tool groups */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 10, borderRight: '1px solid var(--border)' }}>
          {DRAWING_TOOLS.map(t => (
            <button key={t.id} className={`tb-btn ${tool === t.id ? 'active' : ''}`} title={`${t.label} (${t.kbd})`} onClick={() => setTool(t.id)}>
              {I[t.icon]}<span style={{ fontSize: 11 }}>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="drawings-toolbar" style={{ gap: 2, paddingLeft: 8, paddingRight: 10, borderRight: '1px solid var(--border)', height: '100%', border: 'none' }}>
          <button className="tb-btn" title="Rectangle" onClick={() => toast('Rectangle added.')}>{I.rect}<span style={{fontSize:11}}>Rect</span></button>
          <button className="tb-btn" title="Circle" onClick={() => toast('Circle added.')}>{I.circle_t}<span style={{fontSize:11}}>Circle</span></button>
          <button className="tb-btn" title="Text label" onClick={() => toast('Label added.')}>{I.text_t}<span style={{fontSize:11}}>Label</span></button>
        </div>
        <div className="drawings-toolbar" style={{ gap: 2, paddingLeft: 8, paddingRight: 10, borderRight: '1px solid var(--border)', height: '100%', border: 'none' }}>
          <button className="tb-btn" title="Copy" disabled={!selectedCount}>{I.copy}</button>
          <button className="tb-btn" title="Paste">{I.paste}</button>
          <button className="tb-btn" title="Bring to Front" disabled={!selectedCount}>{I.front}</button>
          <button className="tb-btn" title="Send to Back" disabled={!selectedCount}>{I.back}</button>
          <button className="tb-btn" title="Delete" disabled={!selectedCount} style={{ color: selectedCount ? 'var(--err)' : undefined }}>{I.delete_t}</button>
        </div>
        <div className="drawings-toolbar" style={{ gap: 2, paddingLeft: 8, paddingRight: 10, borderRight: '1px solid var(--border)', height: '100%', border: 'none' }}>
          <button className="tb-btn" title="Zoom Out" onClick={() => setZoom(z => Math.max(0.15, +(z-0.1).toFixed(2)))}>{I.zoom_out}</button>
          <button className="tb-btn" style={{ fontFamily: 'JetBrains Mono', minWidth: 44, fontSize: 11 }} onClick={() => setZoom(1)} title="Reset 100%">{Math.round(zoom*100)}%</button>
          <button className="tb-btn" title="Zoom In" onClick={() => setZoom(z => Math.min(4, +(z+0.1).toFixed(2)))}>{I.zoom_in}</button>
          <button className="tb-btn" title="Fit sheet" onClick={() => setZoom(0.68)}>{I.fit}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 10, borderRight: '1px solid var(--border)' }}>
          <select style={{ height: 26, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--txt-m)', fontFamily: 'inherit', fontSize: 11, padding: '0 8px', outline: 'none' }} value={paperSize} onChange={e => setPaperSize(e.target.value)}>
            {PAPER_SIZES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select style={{ height: 26, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--txt-m)', fontFamily: 'inherit', fontSize: 11, padding: '0 8px', outline: 'none' }} value={orientation} onChange={e => setOrientation(e.target.value)}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </div>
        <div style={{ flex: 1 }} />
        {selectedCount > 0 && <span className="badge badge-accent" style={{ marginRight: 8 }}>{selectedCount} selected</span>}
        <button className="tb-btn" onClick={() => toast('Project saved.')}>{I.save}<span style={{fontSize:11}}>Save</span></button>
        <button className="tb-btn active" style={{ background: 'var(--accent)', color: '#fff', marginLeft: 4 }} onClick={() => toast('Exporting sheets to PDF…')}>{I.pdf}<span style={{fontSize:11}}>Export PDF</span></button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel icon rail */}
        <div style={{ width: 44, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 2, flexShrink: 0 }}>
          {[
            { id: 'library',  icon: 'layers', label: 'Library'  },
            { id: 'drafting', icon: 'tool',   label: 'Drafting' },
            { id: 'projects', icon: 'folder', label: 'Sheets'   },
          ].map(t => (
            <button key={t.id} title={t.label} onClick={() => setPanelTab(panelTab === t.id ? null : t.id)}
              style={{ width: 32, height: 32, borderRadius: 8, background: panelTab === t.id ? 'var(--accent-s)' : 'transparent', color: panelTab === t.id ? 'var(--accent)' : 'var(--txt-d)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', position: 'relative' }}
            >
              {panelTab === t.id && <div style={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', width: 3, height: 16, background: 'var(--accent)', borderRadius: '0 3px 3px 0' }} />}
              {I[t.icon]}
            </button>
          ))}
        </div>

        {/* Slide panel */}
        {panelTab && (
          <div style={{ width: 280, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt-d)' }}>
                {panelTab === 'library' ? 'Symbol Library' : panelTab === 'drafting' ? 'Drafting Tools' : 'Sheets'}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {panelTab === 'library' && (
                <div>
                  <div className="field" style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-d)' }}>{I.search}</span>
                    <input className="field-input" style={{ paddingLeft: 28, fontSize: 11 }} placeholder="Search symbols…" value={libQuery} onChange={e => setLibQuery(e.target.value)} />
                  </div>
                  <div className="field">
                    <select className="field-select" style={{ fontSize: 11 }} value={libCat} onChange={e => setLibCat(e.target.value)}>
                      <option value="all">All categories</option>
                      {['structural','mechanical','electrical','civil','details'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                    </select>
                  </div>
                  {filteredLib.map(item => (
                    <div key={item.id} style={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 8, cursor: 'pointer', transition: 'all 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{item.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt-d)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 1 }}>{item.category}</div>
                        </div>
                        <button className="btn btn-sm btn-primary" style={{ fontSize: 10, height: 24, padding: '0 8px' }} onClick={() => toast(`"${item.name}" inserted on canvas.`)}>Insert</button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--txt-m)', marginTop: 6, lineHeight: 1.5 }}>{item.desc}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {item.tags.map(t => <span key={t} style={{ fontSize: 10, background: 'var(--hover)', borderRadius: 4, padding: '2px 6px', color: 'var(--txt-d)' }}>{t}</span>)}
                      </div>
                    </div>
                  ))}
                  {filteredLib.length === 0 && <div style={{ textAlign: 'center', color: 'var(--txt-d)', fontSize: 12, padding: '24px 0' }}>No matching blocks found.</div>}
                </div>
              )}
              {panelTab === 'drafting' && (
                <div>
                  {/* SVG import */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', marginBottom: 8 }}>SVG Import</div>
                    <textarea className="field-textarea" style={{ fontSize: 11, minHeight: 90 }} value={svgText} onChange={e => setSvgText(e.target.value)} placeholder={'<svg xmlns="…" viewBox="0 0 300 200">…</svg>'} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => { if (svgText.trim()) toast('SVG inserted on canvas.'); }}>Insert SVG</button>
                      <button className="btn btn-sm" onClick={() => setSvgText('')}>Clear</button>
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
                  {/* Stroke */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', marginBottom: 8 }}>Stroke</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', padding: 2 }} />
                      <input className="field-input" style={{ flex: 1, fontSize: 11, fontFamily: 'JetBrains Mono' }} value={strokeColor} onChange={e => setStrokeColor(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt-d)', marginBottom: 4 }}>
                      <span>Width</span><span style={{ fontFamily: 'JetBrains Mono' }}>{strokeWidth.toFixed(1)}px</span>
                    </div>
                    <input type="range" min="0.5" max="12" step="0.5" value={strokeWidth} onChange={e => setStrokeWidth(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                  </div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
                  {/* Title block */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', marginBottom: 8 }}>Title Block</div>
                    {[['drawingTitle','Drawing Title'],['drawingNo','Drawing No.'],['revision','Rev.'],['scale','Scale'],['drawnBy','Drawn By']].map(([k,l]) => (
                      <div key={k} style={{ marginBottom: 8 }}>
                        <label style={{ display: 'block', fontSize: 10, color: 'var(--txt-d)', marginBottom: 3 }}>{l}</label>
                        <input className="field-input" style={{ fontSize: 11 }} value={titleBlock[k]||''} onChange={e => setTitleBlock(t => ({...t, [k]: e.target.value}))} />
                      </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => toast('Title block applied.')}>Apply</button>
                      <button className="btn btn-sm btn-danger" onClick={() => toast('Title block removed.')}>Remove</button>
                    </div>
                  </div>
                </div>
              )}
              {panelTab === 'projects' && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt-d)', marginBottom: 8 }}>Drawing Sheets</div>
                  {sheets.map((s, i) => (
                    <div key={s.id} onClick={() => setActiveSheet(i)}
                      style={{ background: activeSheet === i ? 'var(--accent-s)' : 'var(--raised)', border: `1px solid ${activeSheet === i ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: activeSheet === i ? 'var(--accent)' : 'var(--txt)' }}>{i+1}. {s.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--txt-d)', marginTop: 1 }}>{paperSize} · {orientation}</div>
                      </div>
                      {sheets.length > 1 && <button className="btn btn-sm" style={{ padding: '0 6px', height: 22, fontSize: 10 }} onClick={e => { e.stopPropagation(); if (sheets.length > 1) { setSheets(sh => sh.filter((_,idx) => idx !== i)); if (activeSheet >= i && activeSheet > 0) setActiveSheet(a => a-1); } }}>{I.x}</button>}
                    </div>
                  ))}
                  <button className="btn btn-sm btn-full" style={{ marginTop: 4 }} onClick={() => { const n = sheets.length+1; setSheets(s => [...s, { id: `s${Date.now()}`, name: `Sheet ${n}` }]); setActiveSheet(sheets.length); toast('New sheet added.'); }}>
                    {I.plus} Add Sheet
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="drawings-canvas" style={{ flex: 1, position: 'relative' }}>
          <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, paddingBottom: 52 }}>
            {/* Paper sheet */}
            <div style={{ width: paperW, height: paperH, background: '#fff', position: 'relative', flexShrink: 0, boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.12)', borderRadius: 2, cursor: tool === 'pan' ? 'grab' : tool === 'line' || tool === 'dimension' ? 'crosshair' : 'default' }}
              onClick={() => tool === 'select' && selectedCount === 0 && setSelectedCount(0)}
            >
              {/* Simulated drawing content */}
              <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                {/* Border */}
                <rect x={20*zoom} y={20*zoom} width={paperW - 40*zoom} height={paperH - 80*zoom} fill="none" stroke="#94a3b8" strokeWidth={0.5*zoom} strokeDasharray={`${4*zoom} ${4*zoom}`} />
                {/* Grid lines */}
                {[0.2,0.4,0.6,0.8].map((f,i) => (
                  <line key={`v${i}`} x1={paperW*f} y1={20*zoom} x2={paperW*f} y2={paperH - 80*zoom} stroke="#cbd5e1" strokeWidth={0.4*zoom} strokeDasharray={`${2*zoom} ${6*zoom}`} />
                ))}
                {[0.25,0.5,0.75].map((f,i) => (
                  <line key={`h${i}`} x1={20*zoom} y1={(paperH - 80*zoom)*f + 20*zoom} x2={paperW - 20*zoom} y2={(paperH - 80*zoom)*f + 20*zoom} stroke="#cbd5e1" strokeWidth={0.4*zoom} strokeDasharray={`${2*zoom} ${6*zoom}`} />
                ))}
                {/* Column markers */}
                {[0.2,0.4,0.6,0.8].map((f,i) => (
                  <g key={`cm${i}`}>
                    <circle cx={paperW*f} cy={28*zoom} r={8*zoom} fill="none" stroke="#64748b" strokeWidth={0.6*zoom} />
                    <text x={paperW*f} y={31*zoom} textAnchor="middle" fontSize={7*zoom} fill="#64748b" fontFamily="DM Sans">{String.fromCharCode(65+i)}</text>
                  </g>
                ))}
                {/* Row markers */}
                {[0.25,0.5,0.75].map((f,i) => (
                  <g key={`rm${i}`}>
                    <circle cx={28*zoom} cy={(paperH - 80*zoom)*f + 20*zoom} r={8*zoom} fill="none" stroke="#64748b" strokeWidth={0.6*zoom} />
                    <text x={28*zoom} y={(paperH - 80*zoom)*f + 23*zoom} textAnchor="middle" fontSize={7*zoom} fill="#64748b" fontFamily="DM Sans">{i+1}</text>
                  </g>
                ))}
                {/* Title block */}
                <rect x={paperW - 260*zoom} y={paperH - 72*zoom} width={240*zoom} height={52*zoom} fill="white" stroke="#64748b" strokeWidth={0.8*zoom} />
                <line x1={paperW - 260*zoom} y1={paperH - 50*zoom} x2={paperW - 20*zoom} y2={paperH - 50*zoom} stroke="#64748b" strokeWidth={0.5*zoom} />
                <line x1={paperW - 150*zoom} y1={paperH - 72*zoom} x2={paperW - 150*zoom} y2={paperH - 20*zoom} stroke="#64748b" strokeWidth={0.5*zoom} />
                <text x={paperW - 253*zoom} y={paperH - 58*zoom} fontSize={Math.max(6, 7*zoom)} fill="#334155" fontFamily="DM Sans" fontWeight="600">{titleBlock.projectTitle || project?.name || 'Project'}</text>
                <text x={paperW - 253*zoom} y={paperH - 40*zoom} fontSize={Math.max(5, 6*zoom)} fill="#64748b" fontFamily="DM Sans">{titleBlock.drawingTitle}</text>
                <text x={paperW - 253*zoom} y={paperH - 28*zoom} fontSize={Math.max(5, 6*zoom)} fill="#94a3b8" fontFamily="JetBrains Mono">{titleBlock.drawingNo} · Rev {titleBlock.revision}</text>
                <text x={paperW - 143*zoom} y={paperH - 58*zoom} fontSize={Math.max(5, 6*zoom)} fill="#64748b" fontFamily="DM Sans">Sheet {activeSheet+1} of {sheets.length}</text>
                <text x={paperW - 143*zoom} y={paperH - 44*zoom} fontSize={Math.max(5, 6*zoom)} fill="#94a3b8" fontFamily="DM Sans">Scale: {titleBlock.scale}</text>
                <text x={paperW - 143*zoom} y={paperH - 30*zoom} fontSize={Math.max(5, 6*zoom)} fill="#94a3b8" fontFamily="DM Sans">{new Date(titleBlock.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</text>
                {/* Simulated plan elements */}
                <rect x={paperW*0.2 + 4*zoom} y={40*zoom} width={paperW*0.18} height={paperW*0.12} fill="none" stroke="#475569" strokeWidth={1.2*zoom} />
                <rect x={paperW*0.4 + 4*zoom} y={40*zoom} width={paperW*0.18} height={paperW*0.12} fill="none" stroke="#475569" strokeWidth={1.2*zoom} />
                <rect x={paperW*0.2 + 4*zoom} y={40*zoom + paperW*0.14} width={paperW*0.36} height={paperW*0.12} fill="rgba(241,245,249,0.5)" stroke="#475569" strokeWidth={0.8*zoom} />
                <text x={paperW*0.29} y={paperH*0.22} fontSize={Math.max(7, 9*zoom)} fill="#334155" fontFamily="DM Sans" textAnchor="middle">Office A</text>
                <text x={paperW*0.49} y={paperH*0.22} fontSize={Math.max(7, 9*zoom)} fill="#334155" fontFamily="DM Sans" textAnchor="middle">Office B</text>
                <text x={paperW*0.38} y={paperH*0.38} fontSize={Math.max(7, 9*zoom)} fill="#64748b" fontFamily="DM Sans" textAnchor="middle">Corridor</text>
                {/* North arrow */}
                <g transform={`translate(${paperW - 50*zoom}, ${50*zoom})`}>
                  <circle cx="0" cy="0" r={14*zoom} fill="none" stroke="#64748b" strokeWidth={0.6*zoom} />
                  <path d={`M 0 ${-11*zoom} L ${4*zoom} ${6*zoom} L 0 ${3*zoom} L ${-4*zoom} ${6*zoom} Z`} fill="#334155" />
                  <text y={-14*zoom} textAnchor="middle" fontSize={8*zoom} fill="#334155" fontFamily="DM Sans" fontWeight="700">N</text>
                </g>
              </svg>
            </div>
          </div>

          {/* Sheet tabs */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 1, padding: '0 12px', overflow: 'hidden' }}>
            {sheets.map((s, i) => (
              <button key={s.id} onClick={() => setActiveSheet(i)}
                style={{ height: 26, padding: '0 12px', borderRadius: 5, border: 'none', background: activeSheet === i ? 'var(--raised)' : 'transparent', color: activeSheet === i ? 'var(--txt)' : 'var(--txt-d)', fontSize: 11, fontWeight: activeSheet === i ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.1s' }}>
                {i+1}. {s.name}
              </button>
            ))}
            <button onClick={() => { const n = sheets.length+1; setSheets(s => [...s, { id:`s${Date.now()}`, name:`Sheet ${n}` }]); setActiveSheet(sheets.length); }}
              style={{ height: 26, padding: '0 8px', borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              {I.plus} Add
            </button>
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="drawings-statusbar">
        <div className="dsb-item"><span style={{ color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />Ready</span></div>
        <div className="dsb-item" style={{ flex: 1, color: 'var(--txt-d)' }}>{toolHints[tool]}</div>
        {selectedCount > 0 && <div className="dsb-item" style={{ color: 'var(--accent)' }}>{selectedCount} selected</div>}
        <div className="dsb-item">Sheet {activeSheet+1}/{sheets.length}</div>
        <div className="dsb-item">{paperSize} {orientation.slice(0,1).toUpperCase()}</div>
        <div className="dsb-item" style={{ fontFamily: 'JetBrains Mono' }}>{Math.round(zoom*100)}%</div>
      </div>
    </div>
  );
}

Object.assign(window, { DrawingsModule });
