// Only Web Crypto; no plaintext is sent to a server or persistent browser storage.
export type Envelope = { ciphertext: string; initialization_vector: string; encryption_version: 1 };
export type VaultConfig = {
  encrypted_data_key: Envelope;
  kdf_parameters: { algorithm: 'PBKDF2-SHA256'; iterations: number; salt: string };
  encryption_version: 1;
};
const enc = new TextEncoder(),
  dec = new TextDecoder();
const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (a: ArrayBuffer | Uint8Array) => {
  let s = '';
  for (const n of new Uint8Array(a)) s += String.fromCharCode(n);
  return btoa(s);
};
async function derive(password: string, salt: string, iterations: number) {
  if (iterations < 600000 || iterations > 2000000) throw new Error('Parâmetros inválidos.');
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encrypt(
  key: CryptoKey,
  data: Uint8Array,
  context: string,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode('central:v1:' + context), tagLength: 128 },
    key,
    new Uint8Array(data),
  );
  return { ciphertext: b64(result), initialization_vector: b64(iv), encryption_version: 1 };
}
export async function decrypt(key: CryptoKey, item: Envelope, context: string) {
  if (item.encryption_version !== 1 || bytes(item.initialization_vector).length !== 12)
    throw new Error('Formato inválido.');
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bytes(item.initialization_vector),
        additionalData: enc.encode('central:v1:' + context),
        tagLength: 128,
      },
      key,
      bytes(item.ciphertext),
    ),
  );
}
export async function createVault(password: string, userId: string) {
  if (password.length < 12) throw new Error('Use pelo menos 12 caracteres.');
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const iterations = 600000;
  const wrapping = await derive(password, salt, iterations);
  const config: VaultConfig = {
    encrypted_data_key: await encrypt(wrapping, raw, userId + ':key'),
    kdf_parameters: { algorithm: 'PBKDF2-SHA256', iterations, salt },
    encryption_version: 1,
  };
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return { config, key };
}
export async function unlockVault(password: string, userId: string, config: VaultConfig) {
  if (config.kdf_parameters.algorithm !== 'PBKDF2-SHA256') throw new Error('KDF inválida.');
  const wrapping = await derive(
    password,
    config.kdf_parameters.salt,
    config.kdf_parameters.iterations,
  );
  const raw = await decrypt(wrapping, config.encrypted_data_key, userId + ':key');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  raw.fill(0);
  return key;
}
export async function changeMaster(
  oldPassword: string,
  newPassword: string,
  userId: string,
  config: VaultConfig,
) {
  if (newPassword.length < 12) throw new Error('Use pelo menos 12 caracteres.');
  const previous = await derive(
    oldPassword,
    config.kdf_parameters.salt,
    config.kdf_parameters.iterations,
  );
  const raw = await decrypt(previous, config.encrypted_data_key, userId + ':key');
  try {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16))),
      iterations = 600000;
    return {
      encrypted_data_key: await encrypt(
        await derive(newPassword, salt, iterations),
        raw,
        userId + ':key',
      ),
      kdf_parameters: { algorithm: 'PBKDF2-SHA256' as const, iterations, salt },
      encryption_version: 1 as const,
    };
  } finally {
    raw.fill(0);
  }
}
export const seal = async (key: CryptoKey, data: unknown, context: string) =>
  encrypt(key, enc.encode(JSON.stringify(data)), context);
export const unseal = async (key: CryptoKey, data: Envelope, context: string) =>
  JSON.parse(dec.decode(await decrypt(key, data, context)));
export function generatePassword(length = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-_';
  let output = '';
  const limit = 256 - (256 % chars.length);
  while (output.length < length) {
    const values = crypto.getRandomValues(new Uint8Array(length));
    for (const n of values)
      if (n < limit && output.length < length) output += chars[n % chars.length];
  }
  return output;
}
