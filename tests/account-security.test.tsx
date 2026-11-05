// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AccountSecurity } from '@/components/account-security';
const state = vi.hoisted(() => ({
  notify: vi.fn(),
  enroll: vi.fn(),
  verify: vi.fn(),
  list: vi.fn(),
  unenroll: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/components/app-provider', () => ({
  useApp: () => ({ user: { id: 'owner', email: 'test@example.test' }, notify: state.notify }),
}));
vi.mock('@/lib/supabase/client', () => ({
  browserClient: () => ({
    auth: {
      mfa: {
        listFactors: state.list,
        enroll: state.enroll,
        challengeAndVerify: state.verify,
        unenroll: state.unenroll,
      },
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.list.mockResolvedValue({ data: { totp: [] }, error: null });
  state.enroll.mockResolvedValue({
    data: { id: 'factor', totp: { qr_code: 'data:image/svg+xml,%3Csvg/%3E', secret: 'TESTONLY' } },
    error: null,
  });
  state.verify.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal('fetch', state.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('Account security controls', () => {
  it('does not enable MFA until the user enrolls and supplies an authenticator code', async () => {
    render(<AccountSecurity />);
    await screen.findByRole('button', { name: 'Configurar duas etapas' });
    expect(state.enroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Configurar duas etapas' }));
    await screen.findByLabelText('Código do autenticador');
    expect(state.verify).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Código do autenticador'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }));
    await waitFor(() =>
      expect(state.verify).toHaveBeenCalledWith({ factorId: 'factor', code: '123456' }),
    );
    await waitFor(() => expect(state.notify).toHaveBeenCalledWith('Duas etapas ativadas.'));
  });
  it('keeps MFA inactive and shows an error if the code is refused', async () => {
    state.verify.mockResolvedValue({ error: Error('invalid code') });
    render(<AccountSecurity />);
    fireEvent.click(await screen.findByRole('button', { name: 'Configurar duas etapas' }));
    fireEvent.change(await screen.findByLabelText('Código do autenticador'), {
      target: { value: '999999' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e ativar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Código inválido');
    expect(state.notify).not.toHaveBeenCalledWith('Duas etapas ativadas.');
  });
  it('rejects mismatched passwords before sending a change request', async () => {
    render(<AccountSecurity />);
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'old password' } });
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'new password 12345' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'different 123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    expect((await screen.findByRole('alert')).textContent).toContain('não coincidem');
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
