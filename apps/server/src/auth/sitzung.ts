import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { jetzt, type DB } from "../db.ts";

/**
 * Sitzungen in der Datenbank, nicht im Cookie.
 *
 * Das Cookie traegt nur ein zufaelliges Token, die Tabelle nur dessen SHA-256. Jede Anfrage
 * liest den Nutzer neu: wer gesperrt oder geloescht wird, ist sofort draussen, und ein
 * Neustart des Servers meldet niemanden ab. Verworfen: das zustandslose, signierte Cookie
 * des AXON Connector (kein Entzug moeglich) und die Sitzungen im Speicher der HMI-App
 * (bei jedem Neustart weg).
 */

export const COOKIE = "adp_sitzung";
const DAUER_MS = 12 * 60 * 60 * 1000;

export type Rolle = "admin" | "organisation";

export type Nutzer = {
  id: number;
  email: string;
  name: string;
  rolle: Rolle;
  organisationId: number | null;
};

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function sitzungAnlegen(db: DB, req: FastifyRequest, reply: FastifyReply, nutzerId: number): void {
  const token = crypto.randomBytes(32).toString("base64url");
  const ablauf = new Date(Date.now() + DAUER_MS);
  db.prepare("DELETE FROM sitzungen WHERE ablauf < ?").run(jetzt());
  db.prepare("INSERT INTO sitzungen (token_hash, nutzer_id, ablauf) VALUES (?, ?, ?)").run(hash(token), nutzerId, ablauf.toISOString());
  void reply.setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // An der tatsaechlichen Verbindung, nicht an NODE_ENV: ein Secure-Cookie ueber http
    // legt der Browser nie ab, und die Anmeldung liefe ins Leere.
    secure: req.protocol === "https",
    expires: ablauf,
  });
}

export function sitzungBeenden(db: DB, req: FastifyRequest, reply: FastifyReply): void {
  const token = req.cookies[COOKIE];
  if (token) db.prepare("DELETE FROM sitzungen WHERE token_hash = ?").run(hash(token));
  void reply.clearCookie(COOKIE, { path: "/" });
}

/** Alle Sitzungen eines Nutzers beenden, etwa nach einer Passwortaenderung durch den Admin. */
export function sitzungenEntziehen(db: DB, nutzerId: number, ausser?: FastifyRequest): void {
  const token = ausser?.cookies[COOKIE];
  if (token) db.prepare("DELETE FROM sitzungen WHERE nutzer_id = ? AND token_hash <> ?").run(nutzerId, hash(token));
  else db.prepare("DELETE FROM sitzungen WHERE nutzer_id = ?").run(nutzerId);
}

export function nutzerAusSitzung(db: DB, req: FastifyRequest): Nutzer | null {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  const z = db
    .prepare(
      `SELECT n.id, n.email, n.name, n.rolle, n.organisation_id AS organisationId
       FROM sitzungen s JOIN nutzer n ON n.id = s.nutzer_id
       WHERE s.token_hash = ? AND s.ablauf > ? AND n.aktiv = 1`,
    )
    .get(hash(token), jetzt()) as Nutzer | undefined;
  return z ?? null;
}
