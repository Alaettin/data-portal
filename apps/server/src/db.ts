/**
 * Eine SQLite-Datei unter DATA_DIR. Bewusst ohne ORM: das Schema legt sich beim Start selbst
 * an (CREATE IF NOT EXISTS), die Fassung steht in `user_version`.
 *
 * Fassung 2 (04.11.2026): Organisationen, Nutzer und Endpunkte statt Lieferanten. Der Bestand
 * der Fassung 1 hing an `lieferanten` und wird verworfen, nicht umgezogen (Nutzervorgabe:
 * alle Daten selbst neu anlegen).
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export type DB = Database.Database;

/**
 * Fassung 3 (04.11.2026): `assets.gespeichert`, Zeitpunkt der letzten erfolgreichen Speicherung
 * von Shell, Teilmodell oder Bild. Wird bestehenden DBs angefuegt, nichts wird verworfen.
 */
/**
 * Fassung 4 (04.11.2026): `organisationen.oeffentlich`. Neue Organisationen sind privat,
 * vorhandene waren bis Fassung 3 immer sichtbar und bleiben es.
 */
const FASSUNG = 4;
/** Fassungen darunter hingen an `lieferanten` und werden verworfen. Fest, nicht mitwachsend. */
const VERWERFEN_UNTER = 2;

const ALT = ["pcns", "submodelle", "assets", "events", "lieferanten"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organisationen (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  farbe           TEXT NOT NULL DEFAULT '#00a587',
  logo            BLOB,
  logo_typ        TEXT,
  kurz_de         TEXT,
  kurz_en         TEXT,
  beschreibung_de TEXT,
  beschreibung_en TEXT,
  webseite        TEXT,
  kontakt_email   TEXT,
  oeffentlich     INTEGER NOT NULL DEFAULT 0,
  angelegt        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nutzer (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  passwort_hash    TEXT NOT NULL,
  rolle            TEXT NOT NULL CHECK (rolle IN ('admin', 'organisation')),
  organisation_id  INTEGER REFERENCES organisationen(id) ON DELETE CASCADE,
  aktiv            INTEGER NOT NULL DEFAULT 1,
  angelegt         TEXT NOT NULL,
  letzte_anmeldung TEXT,
  CHECK ((rolle = 'admin') = (organisation_id IS NULL))
);

CREATE TABLE IF NOT EXISTS sitzungen (
  token_hash TEXT PRIMARY KEY,
  nutzer_id  INTEGER NOT NULL REFERENCES nutzer(id) ON DELETE CASCADE,
  ablauf     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS endpunkte (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  organisation_id  INTEGER NOT NULL REFERENCES organisationen(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  feed_url         TEXT NOT NULL,
  intervall_s      INTEGER NOT NULL DEFAULT 60,
  aktiv            INTEGER NOT NULL DEFAULT 1,
  letzte_event_id  TEXT,
  letzter_abruf    TEXT,
  naechster_abruf  TEXT,
  letzter_fehler   TEXT,
  angelegt         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  lfd           INTEGER PRIMARY KEY AUTOINCREMENT,
  endpunkt_id   INTEGER NOT NULL REFERENCES endpunkte(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  typ           TEXT NOT NULL,
  art           TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  zeit          TEXT NOT NULL,
  aenderungen   TEXT,
  abruf_fehler  TEXT,
  roh           TEXT NOT NULL,
  eingegangen   TEXT NOT NULL,
  UNIQUE (endpunkt_id, event_id)
);
CREATE INDEX IF NOT EXISTS events_item ON events (endpunkt_id, item_id);

CREATE TABLE IF NOT EXISTS assets (
  endpunkt_id     INTEGER NOT NULL REFERENCES endpunkte(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL,
  aas_id          TEXT,
  global_asset_id TEXT,
  repo_url        TEXT,
  name            TEXT,
  hersteller      TEXT,
  bestellnummer   TEXT,
  bild            BLOB,
  bild_typ        TEXT,
  logo            BLOB,
  logo_typ        TEXT,
  shell           TEXT,
  registriert     TEXT,
  aktualisiert    TEXT,
  gespeichert     TEXT,
  PRIMARY KEY (endpunkt_id, item_id)
);

CREATE TABLE IF NOT EXISTS submodelle (
  endpunkt_id  INTEGER NOT NULL REFERENCES endpunkte(id) ON DELETE CASCADE,
  submodel_id  TEXT NOT NULL,
  item_id      TEXT NOT NULL,
  semantic_id  TEXT,
  id_short     TEXT,
  inhalt       TEXT,
  abruf_fehler TEXT,
  stand        TEXT NOT NULL,
  PRIMARY KEY (endpunkt_id, submodel_id)
);

CREATE TABLE IF NOT EXISTS pcns (
  lfd          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpunkt_id  INTEGER NOT NULL REFERENCES endpunkte(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  record       TEXT NOT NULL,
  abkuendigung INTEGER NOT NULL DEFAULT 0,
  zeit         TEXT NOT NULL,
  UNIQUE (endpunkt_id, event_id)
);
`;

export function oeffnen(datei?: string): DB {
  const pfad = datei ?? join(resolve(process.env["DATA_DIR"] ?? "./data"), "portal.db");
  if (pfad !== ":memory:") mkdirSync(join(pfad, ".."), { recursive: true });
  const db = new Database(pfad);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const fassung = db.pragma("user_version", { simple: true }) as number;
  // Nur der Bestand der Fassung 1 (Lieferanten) wird verworfen. **Nie an FASSUNG koppeln**:
  // so stand es bis 04.11.2026, und das Anheben auf 3 hat den echten Bestand geloescht.
  if (fassung < VERWERFEN_UNTER) {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      for (const t of ALT) db.exec(`DROP TABLE IF EXISTS ${t}`);
    })();
    db.pragma("foreign_keys = ON");
  }
  db.exec(SCHEMA);
  // CREATE IF NOT EXISTS fuegt einer vorhandenen Tabelle keine Spalte hinzu.
  const spalten = (db.prepare("PRAGMA table_info(assets)").all() as { name: string }[]).map((s) => s.name);
  if (!spalten.includes("gespeichert")) db.exec("ALTER TABLE assets ADD COLUMN gespeichert TEXT");
  const orgSpalten = (db.prepare("PRAGMA table_info(organisationen)").all() as { name: string }[]).map((s) => s.name);
  if (!orgSpalten.includes("oeffentlich")) {
    db.transaction(() => {
      db.exec("ALTER TABLE organisationen ADD COLUMN oeffentlich INTEGER NOT NULL DEFAULT 0");
      // Nur einmal, beim Anfuegen der Spalte: bis Fassung 3 war jede Organisation sichtbar.
      db.exec("UPDATE organisationen SET oeffentlich = 1");
    })();
  }
  db.pragma(`user_version = ${FASSUNG}`);
  return db;
}

export const jetzt = () => new Date().toISOString();
