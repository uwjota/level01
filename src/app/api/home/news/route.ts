import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { newsSources, parseHeadlines } from '@/lib/news-feed';
export async function GET() {
  const db = await serverClient();
  if (!(await db.auth.getUser()).data.user) return new Response(null, { status: 401 });
  const results = await Promise.allSettled(
    newsSources.map(async (source) => {
      const r = await fetch(source.url, {
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/rss+xml,application/xml,text/xml' },
      });
      if (!r.ok) throw Error();
      return parseHeadlines(await r.text(), source.name);
    }),
  );
  const all = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter(
      (n) =>
        Date.parse(n.published) > Date.now() - 3 * 86400000 &&
        Date.parse(n.published) <= Date.now() + 3600000,
    )
    .sort((a, b) => b.published.localeCompare(a.published));
  const seen = new Set<string>();
  const items = all
    .filter((n) => {
      const key = n.title.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
  return NextResponse.json(
    {
      items,
      partial: results.some((r) => r.status === 'rejected'),
      checkedAt: new Date().toISOString(),
      ...(!items.length ? { error: 'Nenhuma notícia recente disponível.' } : {}),
    },
    { status: items.length ? 200 : 502, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
