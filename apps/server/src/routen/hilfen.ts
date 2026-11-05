import { spracheVon, type Sprache } from "@datenportal/core";
import type { FastifyRequest } from "fastify";
import type { DB } from "../db.ts";

/** Fehler mit einem festen Code; die Oberflaeche uebersetzt den Code, nicht den Text. */
export class Eingabefehler extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function sprache(req: FastifyRequest): Sprache {
  return spracheVon((req.query as { sprache?: string } | undefined)?.sprache);
}

const FARBE = /^#[0-9a-fA-F]{6}$/;
export function farbe(wert: unknown, ersatz: string): string {
  return typeof wert === "string" && FARBE.test(wert) ? wert.toLowerCase() : ersatz;
}

/** Nur http(s): ein `file:`- oder `data:`-Endpunkt hat im Takt nichts verloren. */
export function webadresse(wert: unknown, code = "url-ungueltig"): string {
  try {
    const u = new URL(String(wert ?? "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new Eingabefehler(code);
  }
}

/** Leerer Text wird null, damit "geloescht" und "nie gesetzt" gleich aussehen. */
export function textOderNull(wert: unknown, hoechstens = 4000): string | null {
  if (typeof wert !== "string") return null;
  const t = wert.trim();
  return t.length === 0 ? null : t.slice(0, hoechstens);
}

export function pflichttext(wert: unknown, code: string, hoechstens = 200): string {
  const t = textOderNull(wert, hoechstens);
  if (t === null) throw new Eingabefehler(code);
  return t;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function email(wert: unknown): string {
  const t = String(wert ?? "").trim().toLowerCase();
  if (!EMAIL.test(t)) throw new Eingabefehler("email-ungueltig");
  return t;
}

/** Abfragetakt in Sekunden, frei zwischen 30 s und 24 h (Nutzervorgabe 04.11.2026). */
export const TAKT_MIN_S = 30;
export const TAKT_MAX_S = 24 * 60 * 60;
export function intervall(wert: unknown): number {
  const n = Number(wert);
  return Number.isFinite(n) ? Math.min(TAKT_MAX_S, Math.max(TAKT_MIN_S, Math.round(n))) : 60;
}

const BILDTYPEN = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"]);
const HOECHSTENS_LOGO = 1024 * 1024;

/** Logo als Data-URL aus dem Formular. `null` heisst entfernen, `undefined` unveraendert. */
export function logo(wert: unknown): { daten: Buffer; typ: string } | null | undefined {
  if (wert === undefined) return undefined;
  if (wert === null) return null;
  const t = typeof wert === "string" ? /^data:([a-z+./-]+);base64,(.+)$/i.exec(wert) : null;
  if (!t || !BILDTYPEN.has(t[1]!.toLowerCase())) throw new Eingabefehler("logo-ungueltig");
  const daten = Buffer.from(t[2]!, "base64");
  if (daten.length > HOECHSTENS_LOGO) throw new Eingabefehler("logo-zu-gross");
  return { daten, typ: t[1]!.toLowerCase() };
}

/** Adresskuerzel aus dem Namen, eindeutig gemacht mit -2, -3 … */
export function slugVon(db: DB, name: string, ausserId?: number): string {
  const basis =
    name
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "organisation";
  const belegt = (s: string) =>
    !!db.prepare("SELECT 1 FROM organisationen WHERE slug = ? AND id IS NOT ?").get(s, ausserId ?? null);
  let s = basis;
  for (let i = 2; belegt(s); i++) s = `${basis}-${i}`;
  return s;
}
