import { useEffect, useState } from 'react';
import { supabase, isConfigured } from './lib/supabase';
import Auth from './components/Auth.jsx';
import Dashboard from './components/Dashboard.jsx';

function SetupNotice() {
  return (
    <div className="center-screen">
      <div className="panel narrow">
        <h1>Supabase is not connected yet</h1>
        <p>Create a file named <code>.env</code> in the project folder (copy <code>.env.example</code>) and set:</p>
        <pre className="code-block">{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key`}</pre>
        <p>Then stop the dev server and run <code>npm run dev</code> again. See the README for the full setup.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isConfigured) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setChecking(false); }
    }).catch(() => active && setChecking(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  if (!isConfigured) return <SetupNotice />;
  if (checking) return <div className="center-screen"><div className="spinner" aria-label="Loading" /></div>;
  return session ? <Dashboard user={session.user} /> : <Auth />;
}
