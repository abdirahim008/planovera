/* pb-auth.jsx — Auth screen */
function AuthScreen({ onLogin }) {
  const [tab, setTab] = React.useState('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [notice, setNotice] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const submit = e => {
    e.preventDefault();
    if (!email || !password) { setNotice({ type: 'err', msg: 'Please fill in all required fields.' }); return; }
    setBusy(true);
    setNotice({ type: 'ok', msg: 'Signing in…' });
    setTimeout(() => {
      onLogin({
        name: name || email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        company: company || 'ProBuild Workspace',
        email,
        role: email.includes('admin') ? 'admin' : 'supervision',
      });
      setBusy(false);
    }, 700);
  };

  const demoLogin = user => {
    onLogin(user);
  };

  return (
    <div className="auth-wrap">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(59,130,246,0.07), transparent)', pointerEvents: 'none' }} />
      <div className="auth-card animate-in">
        <div className="auth-logo">PB</div>
        <div className="auth-title">ProBuild</div>
        <div className="auth-sub">Construction project control platform. Sign in to access your workspace.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'signin' ? 'active' : ''}`} onClick={() => setTab('signin')}>Sign in</button>
          <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>Create account</button>
        </div>
        {notice && <div className={`auth-notice ${notice.type}`}>{notice.msg}</div>}
        <form onSubmit={submit}>
          {tab === 'signup' && <>
            <div className="field">
              <label className="field-label">Full name</label>
              <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="James Chen" />
            </div>
            <div className="field">
              <label className="field-label">Company</label>
              <input className="field-input" value={company} onChange={e => setCompany(e.target.value)} placeholder="Apex Engineering Ltd." />
            </div>
          </>}
          <div className="field">
            <label className="field-label">Email address</label>
            <input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
          <div className="field" style={{ marginBottom: 20 }}>
            <label className="field-label">Password</label>
            <input className="field-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : tab === 'signin' ? 'Sign in to workspace' : 'Create account'}
          </button>
        </form>
        <div className="auth-divider">— or jump straight in —</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {DEMO_USERS.map(u => (
            <button key={u.email} className="btn btn-full" style={{ justifyContent: 'flex-start', gap: 10 }} onClick={() => demoLogin(u)}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent-s)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                {u.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                <div style={{ fontSize: 10, color: 'var(--txt-d)' }}>{u.company} · {u.role}</div>
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--txt-d)', textAlign: 'center', lineHeight: 1.8 }}>
          Powered by Supabase · Multi-sheet PDF export · Real-time collaboration
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen });
