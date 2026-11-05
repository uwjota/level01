// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WeatherCard } from '@/components/home-context';
import { PushSettings } from '@/components/push-settings';
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  fetch: vi.fn(),
  settings: [] as Record<string, unknown>[],
}));
vi.mock('@/components/app-provider', () => ({
  useApp: () => ({ data: { settings: mocks.settings }, save: mocks.save }),
}));
beforeEach(() => {
  mocks.settings = [];
  mocks.save.mockReset().mockResolvedValue({ id: 'saved' });
  mocks.fetch.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('Device location and push controls', () => {
  it('asks for location only after a click and saves approximate coordinates', async () => {
    const geo = vi
      .fn()
      .mockImplementation((success) =>
        success({ coords: { latitude: -23.55555, longitude: -46.66666 } }),
      );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: geo },
    });
    render(<WeatherCard />);
    expect(geo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        'settings',
        expect.objectContaining({
          weather_location: {
            label: 'Localização do dispositivo',
            latitude: -23.56,
            longitude: -46.67,
            source: 'device',
          },
        }),
      ),
    );
  });
  it('allows a manual city when device location is denied', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_success: unknown, failure: () => void) => failure() },
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        cities: [
          {
            label: 'Recife, Pernambuco, Brasil',
            latitude: -8.05,
            longitude: -34.88,
            source: 'manual',
          },
        ],
      }),
    });
    render(<WeatherCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }));
    await screen.findByText('Permita o acesso à localização ou escolha uma cidade.');
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Recife' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recife, Pernambuco, Brasil' }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        'settings',
        expect.objectContaining({
          weather_location: expect.objectContaining({
            source: 'manual',
            label: 'Recife, Pernambuco, Brasil',
          }),
        }),
      ),
    );
  });
  it('registers the browser push subscription only after notification permission is granted', async () => {
    const sub = {
      endpoint: 'https://fcm.googleapis.com/wp/test',
      toJSON: () => ({
        endpoint: 'https://fcm.googleapis.com/wp/test',
        keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
      }),
      unsubscribe: vi.fn(),
    };
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const manager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(sub),
    };
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.stubGlobal('PushManager', class {});
    const permission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('Notification', { requestPermission: permission });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({ pushManager: manager }),
        register: vi.fn().mockResolvedValue({ pushManager: manager }),
        ready: Promise.resolve({ pushManager: manager, showNotification }),
      },
    });
    mocks.fetch.mockImplementation(async (_url, opts) =>
      opts?.method === 'POST'
        ? { ok: true, json: async () => ({ ok: true }) }
        : {
            ok: true,
            json: async () => ({
              configured: true,
              publicKey:
                'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              endpoints: [],
            }),
          },
    );
    render(<PushSettings />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Ativar notificações' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    expect(permission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar notificações' }));
    await screen.findByText(
      'Notificações ativadas. Use os testes abaixo para conferir o recebimento.',
    );
    expect(permission).toHaveBeenCalledOnce();
    expect(manager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/push',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(sub.toJSON()) }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Testar neste dispositivo' }));
    await waitFor(() =>
      expect(showNotification).toHaveBeenCalledWith(
        'Level01',
        expect.objectContaining({ tag: 'level01-local-test' }),
      ),
    );
    await screen.findByText(/Teste local solicitado/);
    fireEvent.click(screen.getByRole('button', { name: 'Testar envio em segundo plano' }));
    await screen.findByText(/Teste em segundo plano agendado/);
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/push/test',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('Weather recovery', () => {
  const location = { label: 'Recife', latitude: -8.05, longitude: -34.88, source: 'manual' };
  const weather = {
    temperature: 28,
    feels: 30,
    code: 0,
    isDay: true,
    min: 24,
    max: 31,
    rain: 10,
    time: '2026-11-04T12:00',
    timezone: 'America/Recife',
  };
  it('reloads the forecast when the same city is selected again', async () => {
    mocks.settings = [{ weather_location: location }];
    mocks.fetch.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => (url.includes('/cities') ? { cities: [location] } : weather),
    }));
    render(<WeatherCard />);
    await screen.findByText('28°');
    fireEvent.click(screen.getByRole('button', { name: 'Alterar localização do clima' }));
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Recife' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recife' }));
    await waitFor(() =>
      expect(mocks.fetch.mock.calls.filter(([url]) => url.includes('/weather'))).toHaveLength(2),
    );
    await screen.findByText('28°');
  });
  it('allows manual selection while location is pending and ignores its late result', async () => {
    let located: (position: unknown) => void = () => {};
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: typeof located) => {
          located = success;
        },
      },
    });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ cities: [location] }) });
    render(<WeatherCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }));
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Recife' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recife' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    located({ coords: { latitude: 1, longitude: 1 } });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({ weather_location: location }),
    );
  });
  it('distinguishes unavailable position from denied permission', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_: unknown, fail: (error: unknown) => void) => fail({ code: 2 }),
      },
    });
    render(<WeatherCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar minha localização' }));
    await screen.findByText(
      'O navegador não conseguiu determinar sua posição. Escolha uma cidade abaixo.',
    );
    expect(screen.getByRole('button', { name: 'Buscar' }).hasAttribute('disabled')).toBe(false);
  });
  it('explains expired sessions instead of blaming the weather provider', async () => {
    mocks.settings = [{ weather_location: location }];
    mocks.fetch.mockResolvedValue({ status: 401, ok: false });
    render(<WeatherCard />);
    await screen.findByText('Sua sessão expirou. Entre novamente.');
  });
});
