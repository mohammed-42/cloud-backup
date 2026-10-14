import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) {
          setNotice('Account created. If email confirmation is enabled in Supabase, confirm your email, then log in.');
          setMode('login');
        }
      }
    } catch (err) {
      const msg = err?.message || 'Something went wrong.';
      setError(/failed to fetch/i.test(msg) ? 'Network error. Check your connection and try again.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="auth-wrap">
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true" />
          <span>Vaultline</span>
        </div>
        <p className="tagline">Back up files to the cloud, keep every version, and bring any of them back.</p>

        <form className="panel" onSubmit={submit} noValidate>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={isLogin} className={isLogin ? 'tab active' : 'tab'} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
            <button type="button" role="tab" aria-selected={!isLogin} className={!isLogin ? 'tab active' : 'tab'} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
          </div>

          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && <p className="msg error" role="alert">{error}</p>}
          {notice && <p className="msg ok" role="status">{notice}</p>}

          <button className="btn primary full" disabled={busy}>
            {busy ? 'Please wait...' : isLogin ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
