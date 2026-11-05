export async function disableDevicePush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const sub = await registration?.pushManager?.getSubscription();
  if (!sub) return;
  const r = await fetch('/api/push', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
  if (!r.ok) throw Error('Não foi possível remover o registro remoto deste dispositivo.');
}
export function vapidBytes(value: string) {
  const raw = atob(
    value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4),
  );
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export async function readyPushWorker() {
  await navigator.serviceWorker.register('/sw.js');
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                'O navegador não iniciou as notificações. Atualize a página e tente novamente.',
              ),
            ),
          12000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
