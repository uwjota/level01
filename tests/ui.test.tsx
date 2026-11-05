// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { EntityForm } from '../src/components/entity-form';
import { Vault } from '../src/components/vault';
import { createVault, seal } from '../src/lib/crypto';
import { Tasks } from '../src/components/tasks';
const state = vi.hoisted(() => ({
  app: {} as Record<string, unknown>,
  list: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('../src/components/app-provider', () => ({ useApp: () => state.app }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('../src/lib/data', () => ({ list: state.list, mutate: state.mutate, download: vi.fn() }));
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.test' };
const account = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  state.app = {
    user,
    data: {
      settings: [],
      tasks: [],
      task_occurrences: [],
      financial_accounts: [{ id: account, name: 'Conta de teste' }],
      financial_categories: [],
      notes: [],
      attachments: [],
    },
    save: vi.fn().mockResolvedValue({ id: 'saved' }),
    notify: vi.fn(),
    refresh: vi.fn(),
    edit: vi.fn(),
    remove: vi.fn(),
    registerVaultSearch: vi.fn(),
  };
  state.list.mockReset();
  state.mutate.mockReset().mockResolvedValue({ id: 'saved' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('User flows rendered in DOM', () => {
  it('submits a real task payload from the form and waits for persistence before closing', async () => {
    const close = vi.fn();
    render(<EntityForm editor={{ entity: 'tasks' }} onClose={close} />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Estudar programação' } });
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-11-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(state.app.save).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({
        title: 'Estudar programação',
        scheduled_on: '2026-11-04',
        recurrence: null,
        status: 'pending',
      }),
      'POST',
    );
  });
  it('submits cents rather than a floating point monetary value', async () => {
    render(<EntityForm editor={{ entity: 'transactions' }} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Livro' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '29,90' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'), { target: { value: account } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(state.app.save).toHaveBeenCalledWith(
        'transactions',
        expect.objectContaining({ amount_minor: 2990, type: 'expense', status: 'confirmed' }),
        'POST',
      ),
    );
  });
  it('shows persistence errors and keeps the form open', async () => {
    const save = vi.fn().mockRejectedValue(Error('Sem conexão'));
    state.app.save = save;
    const close = vi.fn();
    render(<EntityForm editor={{ entity: 'tasks' }} onClose={close} />);
    fireEvent.change(screen.getByLabelText('Título'), {
      target: { value: 'Não perder esta tarefa' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('Sem conexão');
    expect(close).not.toHaveBeenCalled();
  });
  it('keeps empty task views actionable without fabricated records', () => {
    render(<Tasks />);
    expect(screen.getByText('Nenhuma tarefa encontrada neste período.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));
    expect(state.app.edit).toHaveBeenCalledWith(expect.objectContaining({ entity: 'tasks' }));
  });
  it('sends only an encrypted envelope when saving a credential', async () => {
    const { config } = await createVault('secure test master', user.id);
    state.list.mockImplementation(async (entity: string) =>
      entity === 'vault_configs' ? [config] : [],
    );
    render(<Vault />);
    fireEvent.click(screen.getByRole('button', { name: 'Credenciais' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Desbloquear meu Cofre' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Senha mestra'), {
      target: { value: 'secure test master' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear meu Cofre' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nova credencial' }));
    fireEvent.change(screen.getByLabelText('Nome do serviço'), {
      target: { value: 'My private service' },
    });
    fireEvent.change(screen.getByLabelText('Usuário ou e-mail'), {
      target: { value: 'private@test.example' },
    });
    fireEvent.change(screen.getByLabelText('Senha', { exact: true }), {
      target: { value: 'third-party-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar credencial' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalled());
    const [table, payload] = state.mutate.mock.calls[0];
    expect(table).toBe('vault_items');
    expect(payload.ciphertext).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain('My private service');
    expect(JSON.stringify(payload)).not.toContain('third-party-password-123');
    expect(JSON.stringify(payload)).not.toContain('private@test.example');
  });
  it('locks an unlocked vault after inactivity and clears visible credential data', async () => {
    const { config, key } = await createVault('secure test master', user.id);
    const envelope = await seal(
      key,
      {
        name: 'Secret service',
        username: 'secret@example.test',
        password: 'private-password',
        url: '',
        notes: '',
        category: 'Pessoal',
      },
      user.id + ':item:cred',
    );
    state.list.mockImplementation(async (entity: string) =>
      entity === 'vault_configs' ? [config] : [{ id: 'cred', ...envelope }],
    );
    const view = render(<Vault />);
    fireEvent.click(screen.getByRole('button', { name: 'Credenciais' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Desbloquear meu Cofre' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText('Senha mestra'), {
      target: { value: 'secure test master' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear meu Cofre' }));
    await screen.findByText('Secret service');
    expect(screen.queryByText('private-password')).toBeNull();
    vi.useFakeTimers();
    state.app.data = { ...(state.app.data as object), settings: [{ vault_timeout_minutes: 1 }] };
    view.rerender(<Vault />);
    await act(() => vi.advanceTimersByTimeAsync(60001));
    expect(screen.getByText('Seu Cofre está bloqueado.')).toBeTruthy();
    expect(screen.queryByText('Secret service')).toBeNull();
    expect(screen.queryByText('secret@example.test')).toBeNull();
    expect(state.app.registerVaultSearch).toHaveBeenLastCalledWith(null);
    expect(localStorage.length).toBe(0);
  });
});
