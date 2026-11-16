// Authentication: PIN (PBKDF2-SHA256 hash) + Face ID via WebAuthn platform passkey.
// A random 256-bit "data key" encrypts the password vault. It is stored wrapped:
//   - by a key derived from the PIN (PBKDF2 → AES-GCM)
//   - optionally by a non-extractable device key (unwrapped only after Face ID)
import { db } from './db.js';
import {
  b64, unb64, b64url, randBytes, sha256, hashPin, deriveKey, timingSafeEqual,
  encryptBytes, decryptBytes, importAesKey, generateDeviceKey, derToRaw, PBKDF2_ITER,
} from './crypto.js';

const AUTH_KEY = 'yoman2.auth';
const BIO_KEY = 'yoman2.bio';
const LOCKOUT_KEY = 'yoman2.lockout';

const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const writeLS = (k, v) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)));

export const getAuth = () => readLS(AUTH_KEY);
export const setAuthRecord = (rec) => writeLS(AUTH_KEY, rec);
export const isSetUp = () => !!getAuth()?.pinHash;
export const pinLength = () => getAuth()?.pinLen || 4;

/* ---------------- PIN ---------------- */
export async function setupPin(pin) {
  const raw = randBytes(32); // vault data key
  await writePinRecord(pin, raw);
  writeLS(BIO_KEY, null);
}

async function writePinRecord(pin, rawDataKey) {
  const hashSalt = randBytes(16), wrapSalt = randBytes(16);
  const pinHash = await hashPin(pin, hashSalt);
  const wrapKey = await deriveKey(pin, wrapSalt);
  const wrapped = await encryptBytes(wrapKey, rawDataKey);
  setAuthRecord({ v: 1, pinLen: pin.length, iter: PBKDF2_ITER, hashSalt: b64(hashSalt), pinHash: b64(pinHash), wrapSalt: b64(wrapSalt), wrapped });
}

export function lockoutRemaining() {
  const l = readLS(LOCKOUT_KEY);
  if (!l?.until) return 0;
  return Math.max(0, Math.ceil((l.until - Date.now()) / 1000));
}

export async function verifyPin(pin) {
  const a = getAuth();
  if (!a || lockoutRemaining() > 0) return false;
  const h = await hashPin(pin, unb64(a.hashSalt), a.iter);
  const ok = timingSafeEqual(h, unb64(a.pinHash));
  const l = readLS(LOCKOUT_KEY) || { fails: 0 };
  if (ok) writeLS(LOCKOUT_KEY, null);
  else {
    l.fails = (l.fails || 0) + 1;
    if (l.fails >= 5) l.until = Date.now() + Math.min(300, 30 * 2 ** (l.fails - 5)) * 1000;
    writeLS(LOCKOUT_KEY, l);
  }
  return ok;
}

async function rawDataKeyFromPin(pin) {
  const a = getAuth();
  const wrapKey = await deriveKey(pin, unb64(a.wrapSalt), a.iter);
  return decryptBytes(wrapKey, a.wrapped);
}

/** Verify PIN and return the vault CryptoKey, or null. */
export async function vaultKeyFromPin(pin) {
  if (!(await verifyPin(pin))) return null;
  return importAesKey(await rawDataKeyFromPin(pin));
}

export async function changePin(oldPin, newPin) {
  if (!(await verifyPin(oldPin))) return false;
  const raw = await rawDataKeyFromPin(oldPin);
  await writePinRecord(newPin, raw); // same data key → Face ID wrap stays valid
  return true;
}

/* ---------------- Face ID (WebAuthn) ---------------- */
export async function bioSupported() {
  try {
    return !!(window.PublicKeyCredential && window.isSecureContext &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}
export const bioEnrolled = () => !!readLS(BIO_KEY)?.credId;

export async function enrollBio(pin) {
  if (!(await verifyPin(pin))) throw new Error('קוד שגוי');
  const raw = await rawDataKeyFromPin(pin);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randBytes(32),
      rp: { name: 'יומן 2.0', id: location.hostname },
      user: { id: randBytes(16), name: 'me', displayName: 'יומן 2.0' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('בוטל');
  let pubKey = null, alg = null;
  try {
    const spki = cred.response.getPublicKey?.();
    if (spki) { pubKey = b64(spki); alg = cred.response.getPublicKeyAlgorithm?.() ?? -7; }
  } catch { /* older Safari */ }
  const deviceKey = await generateDeviceKey();
  await db.put('kv', { key: 'deviceKey', value: deviceKey });
  const wrapped = await encryptBytes(deviceKey, raw);
  writeLS(BIO_KEY, { credId: b64(cred.rawId), pubKey, alg, wrapped });
  return true;
}

export function disableBio() {
  writeLS(BIO_KEY, null);
  return db.del('kv', 'deviceKey');
}

/** Ask for Face ID. Resolves true only if the platform verified the user. */
export async function bioAssert() {
  const bio = readLS(BIO_KEY);
  if (!bio) return false;
  const challenge = randBytes(32);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64(bio.credId), transports: ['internal', 'hybrid'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!assertion) return false;
  const r = assertion.response;
  const clientData = JSON.parse(new TextDecoder().decode(r.clientDataJSON));
  if (clientData.type !== 'webauthn.get' || clientData.challenge !== b64url(challenge)) return false;
  const authData = new Uint8Array(r.authenticatorData);
  const flags = authData[32];
  if (!(flags & 0x01) || !(flags & 0x04)) return false; // user present + verified
  if (bio.pubKey) {
    const signed = new Uint8Array(authData.length + 32);
    signed.set(authData, 0);
    signed.set(await sha256(new Uint8Array(r.clientDataJSON)), authData.length);
    const sig = new Uint8Array(r.signature);
    let ok;
    if (bio.alg === -257) {
      const k = await crypto.subtle.importKey('spki', unb64(bio.pubKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, sig, signed);
    } else {
      const k = await crypto.subtle.importKey('spki', unb64(bio.pubKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derToRaw(sig), signed);
    }
    if (!ok) return false;
  }
  return true;
}

export async function vaultKeyFromBio() {
  if (!(await bioAssert())) return null;
  const bio = readLS(BIO_KEY);
  const rec = await db.get('kv', 'deviceKey');
  if (!rec?.value) return null;
  return importAesKey(await decryptBytes(rec.value, bio.wrapped));
}

/* ---------------- backup support ---------------- */
export const exportAuth = () => getAuth();
export function importAuth(rec) {
  setAuthRecord(rec);
  writeLS(BIO_KEY, null); // passkeys are device-bound: re-enroll Face ID after restore
  writeLS(LOCKOUT_KEY, null);
}
