export type WeatherLocation = {
  label: string;
  latitude: number;
  longitude: number;
  source: 'device' | 'manual';
};
export type WeatherData = {
  temperature: number;
  feels: number;
  code: number;
  isDay: boolean;
  min: number;
  max: number;
  rain: number;
  time: string;
  timezone: string;
};
export type NewsItem = { title: string; url: string; published: string; source: string };
export function weatherLabel(code: number) {
  if (code === 0) return 'Céu limpo';
  if (code <= 3) return 'Parcialmente nublado';
  if (code <= 48) return 'Neblina';
  if (code <= 57) return 'Garoa';
  if (code <= 67) return 'Chuva';
  if (code <= 77) return 'Neve';
  if (code <= 82) return 'Pancadas de chuva';
  if (code <= 86) return 'Pancadas de neve';
  return 'Trovoadas';
}
