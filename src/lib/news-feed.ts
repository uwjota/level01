import { XMLParser } from 'fast-xml-parser';
import type { NewsItem } from './home';
export const newsSources = [
  { name: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' },
  { name: 'g1', url: 'https://g1.globo.com/rss/g1/' },
];
export function parseHeadlines(xml: string, source: string): NewsItem[] {
  if (xml.length > 600000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Invalid feed');
  const parsed = new XMLParser({
    ignoreAttributes: true,
    processEntities: true,
    parseTagValue: false,
  }).parse(xml);
  const items = parsed?.rss?.channel?.item;
  const rows = Array.isArray(items) ? items : items ? [items] : [];
  return rows.flatMap((item: Record<string, unknown>) => {
    try {
      const url = new URL(String(item.link));
      const title = decodeHeadline(String(item.title ?? ''))
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 300);
      const date = new Date(String(item.pubDate ?? ''));
      if (!['http:', 'https:'].includes(url.protocol) || !title || !Number.isFinite(date.getTime()))
        return [];
      return [{ title, url: url.href, published: date.toISOString(), source }];
    } catch {
      return [];
    }
  });
}

function decodeHeadline(text: string) {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key: string) => {
    const lower = key.toLowerCase();
    if (named[lower]) return named[lower];
    const point = lower.startsWith('#x')
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    return Number.isFinite(point) && point > 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}
