'use client';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/client';
import { Brand } from './brand';
import { Button } from './ui/button';
export function MfaChallenge({ next = '/' }: { next?: string }) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]),
    [factor, setFactor] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    browserClient()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (error) {
          setError('Não foi possível consultar o autenticador.');
          return;
        }
        const list = data.totp.filter((f) => f.status === 'verified');
        if (!list.length) {
          location.href = next;
          return;
        }
        setFactors(list);
        setFactor(list[0].id);
      });
  }, [next]);
  return (
    <main className="auth-page">
      <div className="brand auth-brand">
        <Brand />
      </div>
      <section className="auth-content">
        <div className="auth-card">
          <h1>Verificar acesso</h1>
          <p>Digite o código de seis dígitos do seu autenticador.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const { error } = await browserClient().auth.mfa.challengeAndVerify({
                factorId: factor,
                code,
              });
              if (error) {
                setError('Código inválido ou expirado.');
                setBusy(false);
              } else location.href = next;
            }}
          >
            {factors.length > 1 && (
              <label>
                Autenticador
                <select value={factor} onChange={(e) => setFactor(e.target.value)}>
                  {factors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.friendly_name || 'Autenticador'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Código
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                autoFocus
                disabled={busy}
              />
            </label>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || !factor}>
              Verificar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await browserClient().auth.signOut({ scope: 'local' });
                location.href = '/login';
              }}
            >
              Sair
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
