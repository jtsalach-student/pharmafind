import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setToken } from '../lib/auth';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setToken(data.token);
      navigate('/search');
    } catch {
      setError('Login failed');
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold">Login</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input aria-label="Username" className="w-full rounded border px-3 py-2" value={username} onChange={(e) => setUsername(e.target.value)} />
        <input aria-label="Password" type="password" className="w-full rounded border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-blue-600 px-4 py-2 text-white" type="submit">Sign in</button>
      </form>
    </main>
  );
}
