export async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  if (response.status === 401) throw Error('Sua sessão expirou. Entre novamente.');
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(body?.error || fallback);
  if (body === null) throw Error(fallback);
  return body as T;
}
