'use client';
import { useEffect, useRef, useState } from 'react';
import {
  CloudSun,
  CloudRain,
  Sun,
  Moon,
  MapPin,
  LocateFixed,
  Search,
  RefreshCw,
  ArrowUpRight,
  Newspaper,
} from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { weatherLabel, type WeatherLocation, type WeatherData, type NewsItem } from '@/lib/home';
import { schemas } from '@/lib/schemas';
import { responseJson } from '@/lib/http-client';
export function WeatherCard() {
  const { data, save } = useApp();
  const settings = data.settings[0];
  const location = (settings?.weather_location ?? null) as WeatherLocation | null;
  const locationRequest = useRef(0);
  const [weather, setWeather] = useState<WeatherData | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0),
    [choosing, setChoosing] = useState(false),
    [query, setQuery] = useState(''),
    [cities, setCities] = useState<WeatherLocation[]>([]),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [dialogError, setDialogError] = useState('');
  useEffect(() => {
    if (!location) return;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/home/weather?lat=${location.latitude}&lon=${location.longitude}`, {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    })
      .then((r) => responseJson<WeatherData>(r, 'Clima indisponível no momento.'))
      .then((value) => {
        if (!abort.signal.aborted) setWeather(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e.name === 'TimeoutError'
              ? 'A previsão demorou para responder. Tente novamente.'
              : e.message,
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [location?.latitude, location?.longitude, retry]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setRetry((value) => value + 1);
    }, 600000);
    return () => {
      clearInterval(timer);
      locationRequest.current++;
    };
  }, []);
  useEffect(() => {
    if (location?.source !== 'device' || !navigator.permissions || !navigator.geolocation) return;
    let active = true;
    const request = locationRequest.current;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (!active || permission.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!active || request !== locationRequest.current) return;
            const latitude = Number(position.coords.latitude.toFixed(2)),
              longitude = Number(position.coords.longitude.toFixed(2));
            if (latitude !== location.latitude || longitude !== location.longitude)
              void choose({
                label: 'Localização do dispositivo',
                latitude,
                longitude,
                source: 'device',
              }).catch(() => {});
          },
          () => {},
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location?.source, location?.latitude, location?.longitude]);
  async function choose(value: WeatherLocation) {
    const base = schemas.settings.parse({
      display_name: '',
      timezone: 'America/Sao_Paulo',
      theme: 'dark',
      week_starts_on: 1,
      vault_timeout_minutes: 5,
      notification_preferences: { tasks: true, finance: true, goals: true, advance_minutes: 30 },
      ...settings,
      weather_location: value,
    });
    await save('settings', base);
    setWeather(null);
    setRetry((value) => value + 1);
    setChoosing(false);
    setDialogError('');
  }
  function device() {
    setDialogError('');
    if (window.isSecureContext === false) {
      setDialogError(
        'A localização exige HTTPS ou localhost. Neste endereço, escolha uma cidade abaixo.',
      );
      return;
    }
    if (!navigator.geolocation) {
      setDialogError('Localização indisponível. Busque uma cidade.');
      return;
    }
    setLocating(true);
    const request = ++locationRequest.current;
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        if (request !== locationRequest.current) return;
        setBusy(true);
        try {
          await choose({
            label: 'Localização do dispositivo',
            latitude: Number(p.coords.latitude.toFixed(2)),
            longitude: Number(p.coords.longitude.toFixed(2)),
            source: 'device',
          });
        } catch {
          setDialogError('Não foi possível salvar a localização.');
        } finally {
          setBusy(false);
          setLocating(false);
        }
      },
      (failure) => {
        if (request !== locationRequest.current) return;
        setDialogError(
          failure?.code === 2
            ? 'O navegador não conseguiu determinar sua posição. Escolha uma cidade abaixo.'
            : failure?.code === 3
              ? 'A localização demorou para responder. Tente novamente ou escolha uma cidade abaixo.'
              : 'Permita o acesso à localização ou escolha uma cidade.',
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }
  const Icon = weather
    ? weather.code >= 51
      ? CloudRain
      : weather.code === 0
        ? weather.isDay
          ? Sun
          : Moon
        : CloudSun
    : CloudSun;
  return (
    <section className="panel home-weather">
      <div className="home-card-label">
        <span>
          <MapPin size={14} />
          {location?.label || 'Clima'}
        </span>
        <button
          className="icon-button"
          aria-label="Alterar localização do clima"
          onClick={() => {
            locationRequest.current++;
            setChoosing(true);
            setDialogError('');
          }}
        >
          <MapPin size={16} />
        </button>
      </div>
      {weather ? (
        <>
          <div className="weather-current">
            <Icon size={48} strokeWidth={1.3} />
            <strong>{Math.round(weather.temperature)}°</strong>
            <div>
              {weatherLabel(weather.code)}
              <small>Sensação {Math.round(weather.feels)}°</small>
            </div>
          </div>
          <div className="weather-details">
            <span>
              {Math.round(weather.min)}° mín. / {Math.round(weather.max)}° máx.
            </span>
            <span>{weather.rain}% de chuva</span>
          </div>
          <div className="weather-source">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
            <span>{weather.time.slice(11, 16)} · horário local</span>
            <button
              className="icon-button"
              aria-label="Atualizar clima"
              onClick={() => setRetry((v) => v + 1)}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </>
      ) : loading ? (
        <p className="home-widget-message">Atualizando clima…</p>
      ) : location ? (
        <div className="home-widget-message">
          <p>{error}</p>
          <Button variant="ghost" onClick={() => setRetry((v) => v + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="home-widget-message">
          <CloudSun size={34} />
          <p>Veja o clima onde você está.</p>
          <Button
            variant="outline"
            onClick={() => {
              setChoosing(true);
              device();
            }}
          >
            <LocateFixed size={15} /> Usar minha localização
          </Button>
          <button className="text-link" onClick={() => setChoosing(true)}>
            Escolher cidade
          </button>
        </div>
      )}
      {choosing && (
        <Modal
          open
          onClose={() => {
            if (!busy) {
              locationRequest.current++;
              setLocating(false);
              setChoosing(false);
            }
          }}
          title="Localização do clima"
        >
          <Button type="button" variant="outline" onClick={device} disabled={busy || locating}>
            <LocateFixed size={16} />{' '}
            {locating ? 'Localizando…' : 'Usar localização do dispositivo'}
          </Button>
          <form
            className="city-search"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setDialogError('');
              try {
                locationRequest.current++;
                setLocating(false);
                const r = await fetch(`/api/home/cities?q=${encodeURIComponent(query.trim())}`, {
                  signal: AbortSignal.timeout(15000),
                });
                const d = await responseJson<{ cities: WeatherLocation[] }>(
                  r,
                  'Não foi possível buscar cidades.',
                );
                setCities(d.cities);
                if (!d.cities.length) setDialogError('Nenhuma cidade encontrada.');
              } catch (e) {
                setDialogError(
                  (e as Error).name === 'TimeoutError'
                    ? 'A busca demorou para responder. Tente novamente.'
                    : (e as Error).message,
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Cidade
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
                maxLength={100}
                required
                placeholder="Nome da cidade"
              />
            </label>
            <Button type="submit" disabled={busy}>
              <Search size={16} /> Buscar
            </Button>
          </form>
          {cities.map((c) => (
            <button
              className="city-result"
              key={`${c.latitude},${c.longitude}`}
              disabled={busy}
              onClick={async () => {
                locationRequest.current++;
                setLocating(false);
                setBusy(true);
                try {
                  await choose(c);
                } catch {
                  setDialogError('Não foi possível salvar.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <MapPin size={16} />
              {c.label}
            </button>
          ))}
          {dialogError && (
            <p className="notice" role="status">
              {dialogError}
            </p>
          )}
          <p className="small muted">
            Usamos a localização aproximada para consultar a previsão. Você pode trocar de cidade a
            qualquer momento.
          </p>
        </Modal>
      )}
      {weather && error && (
        <p className="notice" role="status">
          {error} A previsão exibida é da última atualização.
        </p>
      )}
    </section>
  );
}
export function NewsCard() {
  const [items, setItems] = useState<NewsItem[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [partial, setPartial] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/home/news', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        setItems(d.items);
        setPartial(d.partial);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError('Notícias indisponíveis.');
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [retry]);
  return (
    <section className="panel home-news">
      <div className="panel-heading">
        <h2>
          <Newspaper size={18} /> Notícias
        </h2>
        <button
          className="icon-button"
          aria-label="Atualizar notícias"
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {loading && !items.length ? (
        <p className="empty-text">Buscando manchetes…</p>
      ) : error ? (
        <div className="empty-text">
          <p>{error}</p>
          <Button variant="ghost" onClick={() => setRetry((v) => v + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        items.map((n) => (
          <a
            className="news-item"
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            key={n.url}
          >
            <div>
              <span>
                {n.source} ·{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(n.published))}
              </span>
              <h3>{n.title}</h3>
            </div>
            <ArrowUpRight size={16} />
          </a>
        ))
      )}
      <div className="panel-footer">
        <span>
          {partial
            ? 'Uma das fontes está temporariamente indisponível.'
            : 'Manchetes de Agência Brasil e g1'}
        </span>
      </div>
    </section>
  );
}
