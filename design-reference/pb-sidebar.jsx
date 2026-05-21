/* pb-sidebar.jsx — Navigation sidebar */

const NAV_ITEMS_PORTFOLIO = [
  { id: 'dashboard', label: 'Portfolio', icon: 'home' },
  { id: 'meetings',  label: 'Meetings',  icon: 'chat' },
];

const NAV_ITEMS_PROJECT = [
  { id: 'dashboard',      label: 'Overview',        icon: 'home' },
  { id: 'boq',            label: 'BOQ',             icon: 'table' },
  { id: 'progress',       label: 'Progress',        icon: 'activity' },
  { id: 'payment',        label: 'Payments',        icon: 'dollar' },
  { id: 'workplan',       label: 'Work Plan',       icon: 'cal' },
  { id: 'drawings',       label: 'Drawings',        icon: 'pen' },
  { id: 'correspondence', label: 'Correspondence',  icon: 'mail' },
  { id: 'documents',      label: 'Documents',       icon: 'file' },
  { id: 'meetings',       label: 'Meetings',        icon: 'chat' },
];

function Sidebar({ project, activeModule, setModule, clearProject, session, onLogout }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const navItems = project ? NAV_ITEMS_PROJECT : NAV_ITEMS_PORTFOLIO;

  const Avatar = ({ name, size = 28 }) => {
    const initials = name.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase();
    return (
      <div style={{ width: size, height: size, borderRadius: 8, background: 'var(--accent-s)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 800, flexShrink: 0 }}>
        {initials}
      </div>
    );
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : 'expanded'}`}>
      {/* Brand */}
      <div className="sb-brand" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <div className="sb-logo">PB</div>
        {!collapsed && (
          <div className="sb-brand-text">
            <div className="sb-brand-name">ProBuild</div>
            <div className="sb-brand-sub">Project Controls</div>
          </div>
        )}
        {!collapsed && (
          <div style={{ marginLeft: 'auto', color: 'var(--txt-d)', flexShrink: 0 }}>{I.collapse}</div>
        )}
      </div>

      {/* Project block */}
      {project && !collapsed && (
        <div className="sb-proj-block">
          <div className="sb-proj-label">Active Project</div>
          <div className="sb-proj-name">{project.name}</div>
          <div className="sb-proj-meta">{project.code} · {project.role}</div>
          <button className="sb-back-btn" onClick={clearProject}>
            {I.arrow_l} All projects
          </button>
        </div>
      )}

      {!project && !collapsed && (
        <div className="sb-proj-block">
          <div className="sb-proj-label">Mode</div>
          <div className="sb-proj-name">Portfolio Dashboard</div>
          <div className="sb-proj-meta">Select a project to open its workspace</div>
        </div>
      )}

      {/* Nav */}
      <nav className="sb-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sb-nav-item ${activeModule === item.id ? 'active' : ''}`}
            onClick={() => setModule(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sb-nav-icon">{I[item.icon]}</span>
            {!collapsed && <span className="sb-nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        {!collapsed && session && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 6 }}>
            <Avatar name={session.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-d)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.company}</div>
            </div>
          </div>
        )}
        <button className="sb-footer-btn" onClick={onLogout} title={collapsed ? 'Sign out' : undefined}>
          <span style={{ flexShrink: 0 }}>{I.logout}</span>
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
