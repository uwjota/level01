'use client';
import { useState } from 'react';
import {
  Save,
  Download,
  Upload,
  LogOut,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  Database,
} from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { PushSettings } from './push-settings';
import { AccountSecurity } from './account-security';
import { PageHeading } from './dashboard';
import { Modal } from './ui/dialog';
import { browserClient } from '@/lib/supabase/client';
import { backupSchema, schemas } from '@/lib/schemas';
import { download } from '@/lib/data';
import { attachBackupFiles, restoreBackup, verifyBackupFiles } from '@/lib/backup';
import { csv } from '@/lib/domain';
export function Settings() {
  const { data, user, save, notify, refresh } = useApp();
  const s = data.settings[0];
  const [theme, setTheme] = useState(String(s?.theme || 'dark')),
    [busy, setBusy] = useState(false),
    [backup, setBackup] = useState<ReturnType<typeof backupSchema.parse> | null>(null),
    [report, setReport] = useState(''),
    [includeFiles, setIncludeFiles] = useState(false),
    [erase, setErase] = useState(false);
  const prefs = (s?.notification_preferences ?? {
    tasks: true,
    finance: true,
    goals: true,
    advance_minutes: 30,
  }) as Record<string, unknown>;
  async function exportBackup() {
    setBusy(true);
    try {
      const r = await fetch('/api/backup', { cache: 'no-store' });
      if (!r.ok) throw Error();
      let value = backupSchema.parse(await r.json());
      if (includeFiles)
        value = await attachBackupFiles(value, async (id) => {
          const file = await fetch(`/api/attachments?id=${id}`, { cache: 'no-store' });
          if (!file.ok) throw Error();
          return new Uint8Array(await file.arrayBuffer());
        });
      download(
        `level01-backup-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(value),
      );
      notify('Backup exportado. As credenciais continuam criptografadas.');
    } catch {
      notify('Não foi possível exportar o backup.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="Configurações" />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const input = {
            weather_location: s?.weather_location ?? null,
            display_name: String(f.get('display_name')),
            timezone: String(f.get('timezone')),
            theme,
            week_starts_on: Number(f.get('week_starts_on')),
            vault_timeout_minutes: Number(f.get('vault_timeout_minutes')),
            notification_preferences: {
              tasks: f.get('tasks') === 'on',
              finance: f.get('finance') === 'on',
              goals: f.get('goals') === 'on',
              advance_minutes: Number(f.get('advance_minutes')),
            },
          };
          const parsed = schemas.settings.safeParse(input);
          if (!parsed.success) {
            notify('Confira o fuso horário e os campos.');
            setBusy(false);
            return;
          }
          try {
            await save('settings', parsed.data);
            notify('Preferências salvas.');
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="settings-grid">
          <section className="panel settings-panel">
            <h2>Seu perfil</h2>
            <label>
              Nome
              <input
                name="display_name"
                defaultValue={String(s?.display_name ?? '')}
                placeholder="Seu nome"
              />
            </label>
            <label>
              E-mail
              <input value={user.email} disabled />
            </label>
            <div className="form-grid">
              <label>
                Fuso horário
                <input
                  name="timezone"
                  required
                  defaultValue={String(s?.timezone || 'America/Sao_Paulo')}
                />
              </label>
              <label>
                Primeiro dia da semana
                <select name="week_starts_on" defaultValue={String(s?.week_starts_on ?? 1)}>
                  <option value="1">Segunda-feira</option>
                  <option value="0">Domingo</option>
                </select>
              </label>
            </div>
          </section>
          <section className="panel settings-panel">
            <h2>Aparência</h2>
            <div className="theme-options">
              {[
                { id: 'light', label: 'Claro', icon: Sun },
                { id: 'dark', label: 'Escuro', icon: Moon },
                { id: 'system', label: 'Sistema', icon: Monitor },
              ].map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={theme === t.id ? 'selected' : ''}
                  aria-pressed={theme === t.id}
                  onClick={() => setTheme(t.id)}
                >
                  <t.icon size={24} />
                  {t.label}
                </button>
              ))}
            </div>
            <h3>Segurança do Cofre</h3>
            <label>
              Bloquear após inatividade
              <select
                name="vault_timeout_minutes"
                defaultValue={String(s?.vault_timeout_minutes || 5)}
              >
                {[1, 2, 5, 10, 15, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} minutos
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              O Cofre também é bloqueado ao ocultar a aba. A senha mestra é alterada dentro do Cofre
              desbloqueado.
            </p>
          </section>
          <section className="panel settings-panel">
            <h2>Lembretes</h2>
            <p>Escolha o que aparece na central de notificações.</p>
            {[
              ['tasks', 'Tarefas do dia'],
              ['finance', 'Despesas previstas em até 7 dias'],
              ['goals', 'Metas com prazo em até 7 dias'],
            ].map(([id, label]) => (
              <label className="switch-row" key={id}>
                <span>{label}</span>
                <input type="checkbox" name={id} defaultChecked={Boolean(prefs[id])} />
              </label>
            ))}
            <label>
              Antecedência para tarefas com horário (minutos)
              <input
                name="advance_minutes"
                type="number"
                min="0"
                max="10080"
                defaultValue={Number(prefs.advance_minutes ?? 30)}
              />
            </label>
            <PushSettings />
          </section>
        </div>
        <div className="settings-save">
          <Button disabled={busy} type="submit">
            <Save size={17} />
            {busy ? 'Salvando…' : 'Salvar preferências'}
          </Button>
        </div>
      </form>
      <AccountSecurity />
      <section className="panel settings-panel">
        <h2>
          <Database size={19} /> Seus dados continuam seus
        </h2>
        <p>
          Backup JSON versionado com registros e Cofre criptografado. O arquivo contém notas e
          finanças legíveis: guarde-o em um local privado.
        </p>
        <label className="check-label">
          <span>Incluir arquivos no backup (até 50 MB no total)</span>
          <input
            type="checkbox"
            checked={includeFiles}
            onChange={(e) => setIncludeFiles(e.target.checked)}
          />
        </label>
        <div className="backup-actions">
          <Button variant="outline" disabled={busy} onClick={() => void exportBackup()}>
            <Download size={17} /> Exportar backup JSON
          </Button>
          <label className="button outline">
            <Upload size={17} /> Importar backup
            <input
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 75_000_000) throw Error();
                  const parsed = backupSchema.parse(JSON.parse(await file.text()));
                  if (parsed.user_id !== user.id) throw Error();
                  await verifyBackupFiles(parsed);
                  setBackup(parsed);
                } catch {
                  notify('Backup incompatível, grande demais ou de outra conta.');
                }
                e.target.value = '';
              }}
            />
          </label>
          <Button
            variant="ghost"
            onClick={() =>
              download('financeiro.csv', csv(data.transactions), 'text/csv;charset=utf-8')
            }
          >
            Movimentações CSV
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              download(
                'tarefas.json',
                JSON.stringify({ tasks: data.tasks, occurrences: data.task_occurrences }, null, 2),
              )
            }
          >
            Tarefas JSON
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              download(
                'notas-e-metas.json',
                JSON.stringify(
                  { notes: data.notes, goals: data.goals, history: data.goal_updates },
                  null,
                  2,
                ),
              )
            }
          >
            Notas e metas JSON
          </Button>
        </div>
        <p className="small muted">
          Com a opção de arquivos ativada, o JSON inclui os bytes e verificações de integridade.
          Anexos do Cofre permanecem criptografados. A importação preserva registros existentes e
          exige a mesma conta.
        </p>
        {report && (
          <p role="status" className="notice">
            {report}
          </p>
        )}
      </section>
      <section className="panel settings-panel danger-zone">
        <h2>Excluir meus dados</h2>
        <p>
          Apaga tarefas, finanças, notas, metas, arquivos vinculados e o Cofre. Sua conta de login
          permanece. Exporte um backup com arquivos antes de continuar.
        </p>
        <Button variant="destructive" onClick={() => setErase(true)}>
          Excluir todos os meus dados
        </Button>
      </section>
      <Modal
        open={erase}
        onClose={() => setErase(false)}
        title="Excluir todos os dados"
        description="Esta ação é permanente. A exclusão dos arquivos começa antes da transação de registros."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const r = await fetch('/api/account/data', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  confirmation: f.get('confirmation'),
                  password: f.get('password'),
                }),
              });
              const result = await r.json();
              if (!r.ok) throw Error(result.error);
              setErase(false);
              await refresh();
              notify('Dados excluídos. Sua conta de acesso foi preservada.');
            } catch (error) {
              notify((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Digite APAGAR para confirmar
            <input name="confirmation" pattern="APAGAR" required autoComplete="off" />
          </label>
          <label>
            Senha de acesso da conta (não é a senha mestra)
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <Button disabled={busy} variant="destructive" type="submit">
            Apagar permanentemente
          </Button>
        </form>
      </Modal>
      <Modal
        open={!!backup}
        onClose={() => setBackup(null)}
        title="Revisar importação"
        description="Registros já existentes serão preservados. Uma falha cancela toda a importação."
      >
        {backup && (
          <>
            <p>
              Backup de {new Date(backup.exported_at).toLocaleString('pt-BR')} ·{' '}
              {backup.attachments.length} arquivos incluídos
            </p>
            <div className="import-summary">
              {Object.entries(backup.tables).map(([table, rows]) => (
                <div key={table}>
                  <span>{table}</span>
                  <strong>{rows.length} registros</strong>
                </div>
              ))}
            </div>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await restoreBackup(
                    backup,
                    new Set(data.attachments.map((a) => a.id)),
                    setReport,
                  );
                  setReport(
                    `${result.inserted} registros importados; ${result.skipped} duplicados preservados.${result.cleanupPending ? ' Há arquivos temporários aguardando limpeza.' : ''}`,
                  );
                  setBackup(null);
                  await refresh();
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirmar importação
            </Button>
          </>
        )}
      </Modal>
    </>
  );
}
