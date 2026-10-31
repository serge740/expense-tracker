import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseBackup, Loader2 } from 'lucide-react';
import { useITAdminAuth } from '../context/ITAdminAuthContext';
import Button from '../components/Button';

export default function Login() {
  const { login } = useITAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/it-support/data-export', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-2xl border border-border bg-panel p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
            <DatabaseBackup size={22} />
          </span>
          <h1 className="font-display text-[19px] font-bold text-fg">IT Support Portal</h1>
          <p className="mt-1 text-[12.5px] text-fg-3">AbyEx data export &amp; restore</p>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-fg-3">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-border px-3.5 py-2.5 text-[13.5px] text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </label>
        <label className="mb-5 block">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-fg-3">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-border px-3.5 py-2.5 text-[13.5px] text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </label>

        {error && <div className="mb-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">{error}</div>}

        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
