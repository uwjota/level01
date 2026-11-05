'use client';
import { useState } from 'react';
import { ArrowRight, ShieldCheck, LoaderCircle } from 'lucide-react';
import { browserClient } from '@/lib/supabase/client';
import { Brand } from './brand';
import { Button } from './ui/button';
export function AuthForm({ configured, reset = false }: { configured: boolean; reset?: boolean }) {
  const [mode, setMode] = useState(reset ? 'reset' : 'login'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(e.currentTarget),
      db = browserClient();
    try {
      if (mode === 'recover') {
        const { error } = await db.auth.resetPasswordForEmail(String(form.get('email')), {
          redirectTo: location.origin + '/auth/callback?next=/auth/reset',
        });
        if (error) throw error;
        setMessage('Se este e-mail estiver cadastrado, você receberá um link de recuperação.');
      } else if (mode === 'reset') {
        const { error } = await db.auth.updateUser({ password: String(form.get('password')) });
        if (error) throw error;
        await db.auth.signOut({ scope: 'global' });
        location.href = '/login';
      } else {
        const { error } = await db.auth.signInWithPassword({
          email: String(form.get('email')),
          password: String(form.get('password')),
        });
        if (error) throw error;
        location.href = '/';
      }
    } catch {
      setMessage('Não foi possível continuar. Confira seus dados e a conexão.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-brand brand" aria-label="Level01">
        <Brand />
      </div>
      <section className="auth-content">
        <div className="auth-card">
          <h1>
            {mode === 'login'
              ? 'Entrar'
              : mode === 'recover'
                ? 'Recuperar acesso'
                : 'Nova senha de acesso'}
          </h1>
          {mode !== 'login' && <p>A recuperação do login não desbloqueia o Cofre.</p>}
          {!configured ? (
            <div className="notice">
              <strong>Conexão ainda não configurada</strong>
              <p>
                Configure a URL e a chave pública do Supabase no ambiente e aplique as migrações.
                Nenhum dado de demonstração será exibido.
              </p>
              <code>.env.example → .env.local</code>
            </div>
          ) : (
            <form onSubmit={submit}>
              {mode !== 'reset' && (
                <label>
                  E-mail
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    placeholder="voce@exemplo.com"
                  />
                </label>
              )}
              {mode !== 'recover' && (
                <label>
                  Senha
                  <input
                    type="password"
                    name="password"
                    autoComplete={reset ? 'new-password' : 'current-password'}
                    minLength={reset ? 12 : 1}
                    required
                    placeholder="Sua senha de acesso"
                  />
                </label>
              )}
              {message && (
                <p role="status" className="notice">
                  {message}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{' '}
                {mode === 'login'
                  ? 'Entrar'
                  : mode === 'recover'
                    ? 'Enviar link de recuperação'
                    : 'Salvar nova senha'}
              </Button>
              {mode !== 'reset' && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMode(mode === 'login' ? 'recover' : 'login');
                    setMessage('');
                  }}
                >
                  {mode === 'login' ? 'Esqueci minha senha' : 'Voltar para o login'}
                </Button>
              )}
            </form>
          )}
          <div className="auth-foot">
            <ShieldCheck size={16} /> Acesso privado
          </div>
        </div>
      </section>
    </main>
  );
}
