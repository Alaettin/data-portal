import { jetzt, type DB } from "../db.ts";
import { hashePasswort, MIN_PASSWORTLAENGE, normalisiereEmail } from "./passwort.ts";

/**
 * Den Hauptadmin anlegen, falls es noch keinen gibt. Zugangsdaten kommen aus der Umgebung
 * (`.env`, nie im Repo). Ein vorhandener Admin wird nicht angefasst: wer sein Passwort in
 * der Oberflaeche geaendert hat, soll es beim naechsten Start nicht zurueckgesetzt bekommen.
 */
export async function hauptadminSicherstellen(db: DB, email: string | undefined, passwort: string | undefined): Promise<"angelegt" | "vorhanden" | "fehlt"> {
  const vorhanden = db.prepare("SELECT 1 FROM nutzer WHERE rolle = 'admin' LIMIT 1").get();
  if (vorhanden) return "vorhanden";
  if (!email || !passwort) return "fehlt";
  if (passwort.length < MIN_PASSWORTLAENGE) {
    throw new Error(`ADMIN_PASSWORT braucht mindestens ${MIN_PASSWORTLAENGE} Zeichen`);
  }
  db.prepare("INSERT INTO nutzer (email, name, passwort_hash, rolle, organisation_id, angelegt) VALUES (?, ?, ?, 'admin', NULL, ?)").run(
    normalisiereEmail(email),
    "Administrator",
    await hashePasswort(passwort),
    jetzt(),
  );
  return "angelegt";
}
