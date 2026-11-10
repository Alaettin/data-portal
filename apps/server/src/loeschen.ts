/**
 * Bestand loeschen, so dass nichts uebrig bleibt. `events`, `pcns` und `submodelle` haengen
 * am Endpunkt, nicht am Asset: ein Fremdschluessel raeumt sie beim Loeschen eines Assets also
 * nicht mit ab, das passiert hier ausdruecklich.
 */

import type { DB } from "./db.ts";

/** Alle Tabellen mit Zeilen je (Endpunkt, Item). `assets` zuletzt. */
const TABELLEN = ["events", "pcns", "submodelle", "verborgen", "assets"] as const;

/**
 * Loescht ein Asset (mit `item`) oder alle Assets der Endpunkte, in einer Transaktion.
 * Gibt die Zahl der geloeschten Assets zurueck.
 */
export function assetsLoeschen(db: DB, endpunktIds: number[], item?: string): number {
  let assets = 0;
  db.transaction(() => {
    for (const eid of endpunktIds) {
      for (const t of TABELLEN) {
        const r =
          item === undefined
            ? db.prepare(`DELETE FROM ${t} WHERE endpunkt_id=?`).run(eid)
            : db.prepare(`DELETE FROM ${t} WHERE endpunkt_id=? AND item_id=?`).run(eid, item);
        if (t === "assets") assets += r.changes;
      }
    }
  })();
  return assets;
}

/**
 * Nach dem Loeschen auch die Spuren in der Datei beseitigen. `secure_delete` ueberschreibt nur,
 * was mit dem Pragma geloescht wird; aeltere Schreibvorgaenge (vor dem 10.11.2026 oder aus
 * anderen Verbindungen) lassen beim Umschichten von Seiten Kopien im freien Bereich zurueck.
 * Gemessen an einer DB-Kopie: nach dem Loeschen aller Assets 0 Zeilen, aber Rohevents noch auf
 * 48 freien Seiten. `VACUUM` baut die Datei neu auf, der Checkpoint leert danach die WAL-Datei.
 * Bei der Groesse dieser DB (wenige MB) dauert das Millisekunden.
 */
export function rueckstandLeeren(db: DB): void {
  db.exec("VACUUM");
  db.pragma("wal_checkpoint(TRUNCATE)");
}
