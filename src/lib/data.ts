'use client';
import { type Row } from './domain';
export async function list(entity: string): Promise<Row[]> {
  let page = 0;
  const rows: Row[] = [];
  while (true) {
    const response = await fetch(`/api/data/${entity}?page=${page}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    rows.push(...result.data);
    if (rows.length >= result.count || !result.data.length) break;
    page++;
  }
  return rows;
}
export async function mutate(
  entity: string,
  data: Record<string, unknown>,
  method = 'POST',
): Promise<Row> {
  const response = await fetch(
    `/api/data/${entity}${method === 'DELETE' ? `?id=${data.id}` : ''}`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'DELETE' ? undefined : JSON.stringify(data),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.data;
}
export function download(name: string, data: Blob | string, type = 'application/json') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
