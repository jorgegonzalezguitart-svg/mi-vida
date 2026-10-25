// Cifrado en el propio dispositivo (Web Crypto del navegador).
// - La clave maestra se convierte en una llave AES-256 con PBKDF2 (600.000 vueltas).
// - Cada dato se cifra con AES-GCM y un IV aleatorio de 12 bytes delante.
// - La clave maestra nunca se guarda ni se envía.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERACIONES = 600000;

export function aBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function deBase64(texto) {
  const bin = atob(texto);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

export function nuevaSal() {
  return aBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derivarClave(claveMaestra, salBase64, iteraciones = ITERACIONES) {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(claveMaestra.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: deBase64(salBase64), iterations: iteraciones, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function cifrarBytes(llave, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, llave, bytes));
  const salida = new Uint8Array(12 + cifrado.length);
  salida.set(iv);
  salida.set(cifrado, 12);
  return salida;
}

export async function descifrarBytes(llave, datos) {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) }, llave, b.subarray(12));
  return new Uint8Array(claro);
}

export async function cifrarJSON(llave, objeto) {
  return aBase64(await cifrarBytes(llave, enc.encode(JSON.stringify(objeto))));
}

export async function descifrarJSON(llave, texto) {
  return JSON.parse(dec.decode(await descifrarBytes(llave, deBase64(texto))));
}

// Contraseña aleatoria sin caracteres que se confunden (0/O, 1/l/I).
export function generarContrasena(longitud = 20) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_+=';
  const limite = 256 - (256 % letras.length);
  let res = '';
  while (res.length < longitud) {
    for (const n of crypto.getRandomValues(new Uint8Array(longitud * 2))) {
      if (n < limite && res.length < longitud) res += letras[n % letras.length];
    }
  }
  return res;
}
