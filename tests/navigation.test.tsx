// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
const mock = vi.hoisted(() => ({ list: vi.fn(), mutate: vi.fn(), push: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/data', () => ({ list: mock.list, mutate: mock.mutate }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mock.push }),
}));
vi.mock('@/components/entity-form', () => ({ EntityForm: () => null }));
vi.mock('@/components/navigation-hint', () => ({ NavigationHint: () => null }));
import { AppProvider, useApp } from '@/components/app-provider';
function Fixture() {
  const { data, save } = useApp();
  return (
    <>
      <span>{String(data.settings[0]?.display_name ?? 'Vazio')}</span>
      <button onClick={() => void save('settings', { display_name: 'Atualizado' })}>
        Salvar preferência
      </button>
    </>
  );
}
beforeEach(() => {
  mock.list.mockReset().mockResolvedValue([]);
  mock.mutate.mockReset().mockResolvedValue({ id: 'owner', display_name: 'Atualizado' });
  mock.fetch.mockReset().mockResolvedValue({ ok: true });
  mock.push.mockReset();
  vi.stubGlobal('fetch', mock.fetch);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('App navigation and updates', () => {
  it('applies a confirmed preference without reloading every table', async () => {
    render(
      <AppProvider user={{ id: 'owner', email: 'test@example.test' }}>
        <Fixture />
      </AppProvider>,
    );
    await screen.findByRole('button', { name: 'Salvar preferência' });
    await waitFor(() => expect(mock.list).toHaveBeenCalledWith('notifications'));
    mock.list.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferência' }));
    await screen.findAllByText('Atualizado');
    expect(mock.mutate).toHaveBeenCalledOnce();
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('uses client navigation for account shortcuts', async () => {
    render(
      <AppProvider user={{ id: 'owner', email: 'test@example.test' }}>
        <Fixture />
      </AppProvider>,
    );
    await screen.findByRole('button', { name: 'Salvar preferência' });
    expect(screen.getByRole('link', { name: 'Configurações da conta' }).getAttribute('href')).toBe(
      '/configuracoes',
    );
    expect(screen.getByRole('link', { name: /Minha conta/ }).getAttribute('href')).toBe(
      '/configuracoes',
    );
  });
});
