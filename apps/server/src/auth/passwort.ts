import crypto from "node:crypto";

/**
 * Passwoerter mit scrypt aus Node selbst, uebernommen aus der HMI-App
 * (messeapp/server/src/auth/passwort.ts). Kein natives Modul noetig.
 *
 * Gespeichert wird `scrypt$<salt>$<hash>`, beides base64url.
 */

const KEYLEN = 64;
export const MIN_PASSWORTLAENGE = 12;

function scrypt(klartext: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(klartext, salt, KEYLEN, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashePasswort(klartext: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(klartext, salt);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function pruefePasswort(hashWert: string, klartext: string): Promise<boolean> {
  const [verfahren, salt, hash] = hashWert.split("$");
  if (verfahren !== "scrypt" || !salt || !hash) return false;
  const erwartet = Buffer.from(hash, "base64url");
  const key = await scrypt(klartext, Buffer.from(salt, "base64url"));
  return key.length === erwartet.length && crypto.timingSafeEqual(key, erwartet);
}

let blindHash: Promise<string> | null = null;

/**
 * Bei unbekannter E-Mail trotzdem einmal rechnen. Sonst verraet die kuerzere Antwortzeit,
 * welche Adressen ein Konto haben.
 */
export async function pruefeInsLeere(klartext: string): Promise<false> {
  blindHash ??= hashePasswort(crypto.randomBytes(32).toString("base64url"));
  await pruefePasswort(await blindHash, klartext);
  return false;
}

/** 16 Zeichen base64url, also ueber der Mindestlaenge. */
export function erzeugeStartpasswort(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export function normalisiereEmail(email: string): string {
  return email.trim().toLowerCase();
}
