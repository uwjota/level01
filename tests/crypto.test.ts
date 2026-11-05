import { describe, it, expect } from 'vitest';
import {
  createVault,
  unlockVault,
  seal,
  unseal,
  encrypt,
  decrypt,
  changeMaster,
  generatePassword,
  type Envelope,
} from '../src/lib/crypto';
const user = '11111111-1111-4111-8111-111111111111';
describe('Client-side encrypted vault', () => {
  it('encrypts before transport and supports encrypted backup roundtrip', async () => {
    const { config, key } = await createVault('master password original', user);
    const item = await seal(
      key,
      { password: 'third-party-secret', username: 'private@email.com' },
      user + ':item:abc',
    );
    const exported = JSON.stringify({ config, item });
    expect(exported).not.toContain('third-party-secret');
    expect(exported).not.toContain('private@email.com');
    expect(exported).not.toContain('master password');
    const restored = JSON.parse(exported);
    const recovered = await unlockVault('master password original', user, restored.config);
    expect(await unseal(recovered, restored.item, user + ':item:abc')).toEqual({
      password: 'third-party-secret',
      username: 'private@email.com',
    });
    expect(key.extractable).toBe(false);
  });
  it('rejects wrong master passwords, tampering and cross-item swaps', async () => {
    const { config, key } = await createVault('a strong password here', user);
    await expect(unlockVault('wrong password here', user, config)).rejects.toThrow();
    const payload = await seal(key, { secret: 's' }, user + ':item:abc');
    await expect(unseal(key, payload, user + ':item:xyz')).rejects.toThrow();
    const corrupt: Envelope = {
      ...payload,
      ciphertext: (payload.ciphertext[0] === 'A' ? 'B' : 'A') + payload.ciphertext.slice(1),
    };
    await expect(unseal(key, corrupt, user + ':item:abc')).rejects.toThrow();
  });
  it('uses new IVs and authenticates attachment bytes', async () => {
    const { key } = await createVault('a strong password here', user);
    const raw = new Uint8Array([0, 1, 2, 128, 255]);
    const a = await encrypt(key, raw, user + ':attachment:abc'),
      b = await encrypt(key, raw, user + ':attachment:abc');
    expect(a.initialization_vector).not.toBe(b.initialization_vector);
    expect(await decrypt(key, a, user + ':attachment:abc')).toEqual(raw);
    await expect(decrypt(key, a, user + ':attachment:another')).rejects.toThrow();
  });
  it('changes the master password without reencrypting stored items', async () => {
    const { key, config } = await createVault('old secure password', user);
    const item = await seal(key, { password: 'unchanged secret' }, user + ':item:abc');
    const updated = await changeMaster('old secure password', 'new secure password', user, config);
    await expect(unlockVault('old secure password', user, updated)).rejects.toThrow();
    const newKey = await unlockVault('new secure password', user, updated);
    expect(await unseal(newKey, item, user + ':item:abc')).toEqual({
      password: 'unchanged secret',
    });
  });
  it('rejects weak KDF parameters and generates strong random passwords', async () => {
    const { config } = await createVault('long master password', user);
    config.kdf_parameters.iterations = 1;
    await expect(unlockVault('long master password', user, config)).rejects.toThrow();
    const a = generatePassword();
    expect(a).toHaveLength(24);
    expect(generatePassword()).not.toBe(a);
  });
});
