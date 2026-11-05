'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Send, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { disableDevicePush, readyPushWorker, vapidBytes } from '@/lib/push-client';
import { responseJson } from '@/lib/http-client';
type PushConfig = { configured: boolean; publicKey?: string; endpoints?: string[] };
export function PushSettings() {
  const [config, setConfig] = useState<PushConfig | null>(null),
    [supported, setSupported] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true),
    [permission, setPermission] = useState<NotificationPermission>('default'),
    [message, setMessage] = useState('');
  const check = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    try {
      const supported =
        window.isSecureContext &&
        'PushManager' in window &&
        'serviceWorker' in navigator &&
        'Notification' in window;
      setSupported(supported);
      if ('Notification' in window) setPermission(Notification.permission);
      const response = await fetch('/api/push', {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
          : AbortSignal.timeout(15000),
        cache: 'no-store',
      });
      const config = await responseJson<PushConfig>(
        response,
        'Não foi possível consultar o envio de notificações.',
      );
      if (signal?.aborted) return;
      setConfig(config);
      if (supported) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager?.getSubscription();
        if (!signal?.aborted)
          setEnabled(
            Notification.permission !== 'denied' &&
              Boolean(sub && config.endpoints?.includes(sub.endpoint)),
          );
      }
    } catch (error) {
      if (!signal?.aborted) setMessage((error as Error).message);
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    void check(abort.signal);
    return () => abort.abort();
  }, [check]);
  async function enable() {
    setBusy(true);
    setMessage('');
    try {
      if (!config?.publicKey)
        throw Error('Envio ainda indisponível. Atualize o status e tente novamente.');
      const permission = await Notification.requestPermission();
      setPermission(permission);
      if (permission !== 'granted')
        throw Error('Permita notificações nas configurações do navegador para ativar.');
      const reg = await readyPushWorker();
      let existing = await reg.pushManager.getSubscription();
      const key = vapidBytes(config.publicKey);
      const previousKey = existing?.options?.applicationServerKey;
      if (
        existing &&
        previousKey &&
        Array.from(new Uint8Array(previousKey)).join(',') !== Array.from(key).join(',')
      ) {
        await disableDevicePush();
        existing = null;
      }
      const sub =
        existing ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        if (!existing) await sub.unsubscribe();
        await responseJson(r, 'Não foi possível registrar este navegador.');
      }
      setEnabled(true);
      setMessage('Notificações ativadas. Use os testes abaixo para conferir o recebimento.');
    } catch (error) {
      const e = error as Error;
      setMessage(
        e.name === 'NotAllowedError'
          ? 'O navegador bloqueou as notificações. Libere a permissão nas configurações deste site.'
          : e.name === 'AbortError' || e.name === 'TimeoutError'
            ? 'Não foi possível conectar ao serviço de notificações. Confira sua conexão e tente novamente.'
            : e.message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function test(local: boolean) {
    setBusy(true);
    setMessage('');
    try {
      if (local) {
        const registration = await readyPushWorker();
        await registration.showNotification('Level01', {
          body: 'Teste local de notificações. Se você viu este aviso, o navegador pode exibi-las.',
          icon: '/icon-192.png?v=level01-original-v2',
          tag: 'level01-local-test',
          data: { url: '/configuracoes' },
        });
        setMessage(
          'Teste local solicitado. Se o aviso não aparecer, confira o modo Não Perturbe e as permissões de notificação do sistema.',
        );
      } else {
        const response = await fetch('/api/push/test', {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
        });
        await responseJson(response, 'Não foi possível enviar o teste.');
        setMessage(
          'Teste em segundo plano agendado. Aguarde até um minuto; você pode sair desta tela.',
        );
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="push-settings">
      <div className="push-heading">
        <h3>Notificações neste dispositivo</h3>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || checking}
          onClick={() => {
            setMessage('');
            void check();
          }}
        >
          <RefreshCw size={14} /> Atualizar status
        </Button>
      </div>
      <p className="small muted">
        {checking
          ? 'Verificando este navegador…'
          : config?.configured
            ? enabled
              ? 'Ativas neste dispositivo. Os lembretes são enviados mesmo com o painel fechado.'
              : 'O envio está disponível. Ative as notificações neste navegador.'
            : 'Não foi possível confirmar o envio. Atualize o status para tentar novamente.'}
      </p>
      {!checking && !supported && (
        <p className="notice">
          Use HTTPS ou localhost em um navegador com Web Push. No iPhone/iPad, adicione o app à Tela
          de Início e abra por ela.
        </p>
      )}
      {permission === 'denied' && (
        <p className="notice">
          As notificações estão bloqueadas para este site. Abra as permissões ao lado do endereço,
          permita notificações e atualize o status.
        </p>
      )}
      <div className="flex push-actions">
        {enabled ? (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void test(true)}>
              <Bell size={16} /> Testar neste dispositivo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void test(false)}
            >
              <Send size={16} /> Testar envio em segundo plano
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await disableDevicePush();
                  setEnabled(false);
                  setMessage('Notificações desativadas neste dispositivo.');
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <BellOff size={16} /> Desativar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            disabled={
              busy || checking || !supported || !config?.configured || permission === 'denied'
            }
            onClick={() => void enable()}
          >
            <Bell size={16} /> {busy ? 'Ativando…' : 'Ativar notificações'}
          </Button>
        )}
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <p className="small muted">
        Os lembretes são verificados a cada minuto. Avisos na tela bloqueada não exibem valores ou
        títulos pessoais.
      </p>
    </div>
  );
}
