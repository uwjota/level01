const configuredLimit = Number(process.env.NEXT_PUBLIC_MAX_ATTACHMENT_BYTES);
export const MAX_ATTACHMENT_BYTES =
  Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.min(configuredLimit, 2 * 1024 * 1024)
    : 2 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export function matchesMime(bytes: Uint8Array, mime: string) {
  const prefix = (values: number[]) => values.every((v, i) => bytes[i] === v);
  if (mime === 'application/pdf') return prefix([37, 80, 68, 70, 45]);
  if (mime === 'image/png') return prefix([137, 80, 78, 71, 13, 10, 26, 10]);
  if (mime === 'image/jpeg') return prefix([255, 216, 255]);
  if (mime === 'image/webp')
    return prefix([82, 73, 70, 70]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (mime === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return !bytes.includes(0);
    } catch {
      return false;
    }
  }
  return false;
}
