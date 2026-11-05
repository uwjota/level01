'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, LogOut, Smartphone } from 'lucide-react';
import { browserClient } from '@/lib/supabase/client';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { disableDevicePush } from '@/lib/push-client';
export function AccountSecurity() {
  const { user, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [password, setPassword] = useState(false),
    [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]),
    [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [code, setCode] = useState(''),
    [loaded, setLoaded] = useState(false);
  async function refresh() {
    const { data, error } = await browserClient().auth.mfa.listFactors();
    if (error) throw error;
    setFactors(data.totp.filter((f) => f.status === 'verified'));
    setLoaded(true);
  }
  useEffect(() => {
    void refresh().catch(() => setMessage('Não foi possível consultar a proteção da conta.'));
  }, []);
  async function enroll() {
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await browserClient().auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Level01',
        friendlyName: `Level01 ${new Date().toISOString().slice(0, 19)}`,
      });
      if (error) throw error;
      setCode('');
      setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setMessage('Não foi possível iniciar a configuração. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  async function closeSetup() {
    if (busy) return;
    if (setup) {
      const { error } = await browserClient().auth.mfa.unenroll({ factorId: setup.id });
      if (error) {
        setMessage('Não foi possível cancelar a configuração. Tente novamente.');
        return;
      }
    }
    setSetup(null);
    setCode('');
  }
  async function signOut(all: boolean) {
    if (all && !confirm('Encerrar as sessões em todos os dispositivos?')) return;
    setBusy(true);
    try {
      await disableDevicePush().catch(() => {});
      const { error } = await browserClient().auth.signOut({ scope: all ? 'global' : 'local' });
      if (error) throw error;
      location.href = '/login';
    } catch {
      setMessage('Não foi possível encerrar a sessão.');
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel account-security">
      <h2>
        <ShieldCheck size={19} /> Conta e segurança
      </h2>
      <div className="security-grid">
        <div>
          <h3>
            <KeyRound size={17} /> Senha de acesso
          </h3>
          <p>Altere a senha do login sem modificar a senha mestra do Cofre.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPassword(true);
              setMessage('');
            }}
          >
            Alterar senha
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { error } = await browserClient().auth.resetPasswordForEmail(user.email, {
                redirectTo: location.origin + '/auth/callback?next=/auth/reset',
              });
              setMessage(
                error
                  ? 'Não foi possível enviar o link.'
                  : 'Link de recuperação solicitado. Confira seu e-mail.',
              );
              setBusy(false);
            }}
          >
            Esqueci minha senha
          </Button>
        </div>
        <div>
          <h3>
            <Smartphone size={17} /> Autenticação em duas etapas
          </h3>
          <p>
            {!loaded
              ? 'Verificando proteção…'
              : factors.length
                ? 'Ativa. O código do autenticador será solicitado ao entrar.'
                : 'Adicione um código do autenticador além da senha.'}
          </p>
          {factors.map((f) => (
            <div className="mfa-factor" key={f.id}>
              <span>
                <ShieldCheck size={17} /> Autenticador ativo
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setRemove(f.id);
                  setCode('');
                  setMessage('');
                }}
              >
                Desativar
              </Button>
            </div>
          ))}
          {loaded && !factors.length && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void enroll()}>
              Configurar duas etapas
            </Button>
          )}
        </div>
      </div>
      {message && !setup && !password && !remove && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="security-sessions">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void signOut(false)}>
          <LogOut size={16} /> Sair deste dispositivo
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void signOut(true)}>
          Encerrar todas as sessões
        </Button>
      </div>
      {password && (
        <Modal
          open
          title="Alterar senha de acesso"
          onClose={() => {
            if (!busy) {
              setPassword(false);
              setMessage('');
            }
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (f.get('new') !== f.get('confirmation')) {
                setMessage('As novas senhas não coincidem.');
                return;
              }
              setBusy(true);
              setMessage('');
              try {
                const r = await fetch('/api/account/password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    currentPassword: f.get('current'),
                    password: f.get('new'),
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw Error(d.error);
                setPassword(false);
                notify(
                  d.othersRevoked
                    ? 'Senha alterada. As demais sessões foram revogadas.'
                    : 'Senha alterada. Use “Encerrar todas as sessões” para desconectar os outros dispositivos.',
                );
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Senha atual
              <input
                type="password"
                name="current"
                autoComplete="current-password"
                required
                disabled={busy}
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                name="new"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={1024}
                disabled={busy}
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                name="confirmation"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={1024}
                disabled={busy}
              />
            </label>
            {message && (
              <p className="notice" role="alert">
                {message}
              </p>
            )}
            <div className="form-footer">
              <Button type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar nova senha'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {(setup || remove) && (
        <Modal
          open
          title={setup ? 'Configurar autenticador' : 'Desativar duas etapas'}
          onClose={() => {
            if (setup) void closeSetup();
            else if (!busy) {
              setRemove(null);
              setCode('');
              setMessage('');
            }
          }}
        >
          {setup && (
            <>
              <p className="muted small">
                Escaneie no seu aplicativo autenticador. Guarde a chave de configuração: a
                recuperação sem o autenticador exige acesso administrativo à conta.
              </p>
              <img
                className="mfa-qr"
                alt="QR code de configuração do autenticador"
                src={
                  setup.qr.startsWith('data:')
                    ? setup.qr
                    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr)}`
                }
              />
              <details>
                <summary>Chave para configuração manual</summary>
                <code className="mfa-secret">{setup.secret}</code>
              </details>
            </>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage('');
              try {
                const id = setup?.id ?? remove!;
                const verified = await browserClient().auth.mfa.challengeAndVerify({
                  factorId: id,
                  code,
                });
                if (verified.error) throw verified.error;
                if (remove) {
                  const { error } = await browserClient().auth.mfa.unenroll({ factorId: remove });
                  if (error) throw error;
                }
                await refresh();
                setSetup(null);
                setRemove(null);
                setCode('');
                notify(remove ? 'Duas etapas desativadas.' : 'Duas etapas ativadas.');
              } catch {
                setMessage(
                  'Código inválido ou expirado. Confira o autenticador e tente novamente.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Código do autenticador
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                disabled={busy}
              />
            </label>
            {message && (
              <p className="notice" role="alert">
                {message}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {remove ? 'Confirmar desativação' : 'Confirmar e ativar'}
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
