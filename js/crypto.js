// Web Crypto helpers: PBKDF2-SHA256 PIN hashing, AES-GCM encryption.
const te = new TextEncoder();
const td = new TextDecoder();
export const PBKDF2_ITER = 210000;

export function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : data));
}

async function pbkdf2Base(secret) {
  return crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
}
export async function hashPin(pin, salt, iterations = PBKDF2_ITER) {
  const base = await pbkdf2Base(pin);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, 256));
}
export async function deriveKey(secret, salt, iterations = PBKDF2_ITER) {
  const base = await pbkdf2Base(secret);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

export async function encryptBytes(key, bytes) {
  const iv = randBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64(iv), ct: b64(ct) };
}
export async function decryptBytes(key, { iv, ct }) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)));
}
export const encryptJSON = (key, obj) => encryptBytes(key, te.encode(JSON.stringify(obj)));
export const decryptJSON = async (key, payload) => JSON.parse(td.decode(await decryptBytes(key, payload)));

export const importAesKey = (raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
/** Non-extractable key that can be stored in IndexedDB but never read out as bytes. */
export const generateDeviceKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/** Convert a DER-encoded ECDSA signature to raw r||s (64 bytes) for WebCrypto verify. */
export function derToRaw(der) {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => {
    if (der[i++] !== 0x02) throw new Error('bad DER');
    let len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read(), s = read();
  const raw = new Uint8Array(64);
  raw.set(r, 0); raw.set(s, 32);
  return raw;
}
