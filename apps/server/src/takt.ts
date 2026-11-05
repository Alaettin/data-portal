/**
 * Je aktivem Endpunkt ein Takt (60 bis 300 s): Feed ab der zuletzt gelesenen Event-ID lesen,
 * Seiten zu 50 ueber `lastEventId` blaettern (wie alleEvents() in pcn-testing), neue Events
 * uebernehmen und den Browsern melden. Ein Fehler beendet nur diesen Abruf, nie den Takt.
 */

import type { CloudEvent, FeedSeite } from "@datenportal/core";
import type { EndpunktZeile } from "./ansicht.ts";
import { jetzt, type DB } from "./db.ts";
import { AbrufFehler, json } from "./holen.ts";
import type { AssetSchluessel, Strom } from "./strom.ts";
import { anreichern, nachholen, neuerLauf, uebernehmen } from "./verarbeitung.ts";

const SEITE = 50;
const HOECHSTENS_SEITEN = 200;
/** Gleichzeitige Assets beim Anreichern nach dem ersten Nachlesen. */
const GLEICHZEITIG = 6;

export function feedSeitenUrl(feedUrl: string, nach: string | null): string {
  const url = new URL(feedUrl);
  url.searchParams.set("limit", String(SEITE));
  if (nach) url.searchParams.set("lastEventId", nach);
  else url.searchParams.delete("lastEventId");
  return url.toString();
}

export class Takt {
  private readonly wecker = new Map<number, NodeJS.Timeout>();
  private readonly laufend = new Set<number>();

  constructor(
    private readonly db: DB,
    private readonly strom: Strom,
    private readonly holen: typeof fetch = fetch,
  ) {}

  starten() {
    const ids = this.db.prepare("SELECT id FROM endpunkte WHERE aktiv = 1").all() as { id: number }[];
    for (const { id } of ids) this.planen(id, 2_000);
  }

  anhalten() {
    for (const w of this.wecker.values()) clearTimeout(w);
    this.wecker.clear();
  }

  liest(id: number) {
    return this.laufend.has(id);
  }

  /** Naechsten Abruf planen; ein abgeschalteter oder geloeschter Endpunkt wird nur abgemeldet. */
  planen(id: number, inMs?: number) {
    clearTimeout(this.wecker.get(id));
    this.wecker.delete(id);
    const e = this.zeile(id);
    if (!e || e.aktiv !== 1) {
      if (e) this.db.prepare("UPDATE endpunkte SET naechster_abruf=NULL WHERE id=?").run(id);
      this.strom.senden({ typ: "takt", endpunktId: id });
      return;
    }
    const ms = inMs ?? e.intervall_s * 1000;
    this.db.prepare("UPDATE endpunkte SET naechster_abruf=? WHERE id=?").run(new Date(Date.now() + ms).toISOString(), id);
    this.wecker.set(
      id,
      setTimeout(() => void this.lesen(id), ms),
    );
    this.strom.senden({ typ: "takt", endpunktId: id });
  }

  entfernen(id: number) {
    clearTimeout(this.wecker.get(id));
    this.wecker.delete(id);
  }

  /** Liest den Feed jetzt. Laeuft schon ein Abruf, wird kein zweiter gestartet. */
  async lesen(id: number): Promise<number> {
    if (this.laufend.has(id)) return 0;
    this.laufend.add(id);
    clearTimeout(this.wecker.get(id));
    this.strom.senden({ typ: "takt", endpunktId: id });
    let neu = 0;
    try {
      neu = await this.abrufen(id);
      this.db.prepare("UPDATE endpunkte SET letzter_abruf=?, letzter_fehler=NULL WHERE id=?").run(jetzt(), id);
    } catch (f) {
      const text = f instanceof Error ? f.message : String(f);
      this.db.prepare("UPDATE endpunkte SET letzter_abruf=?, letzter_fehler=? WHERE id=?").run(jetzt(), text, id);
    } finally {
      this.laufend.delete(id);
      if (this.zeile(id)) this.planen(id);
    }
    return neu;
  }

  private zeile(id: number) {
    return this.db.prepare("SELECT * FROM endpunkte WHERE id=?").get(id) as EndpunktZeile | undefined;
  }

  private async abrufen(id: number): Promise<number> {
    const e = this.zeile(id);
    if (!e) return 0;
    const erstmals = e.letzte_event_id === null;
    let nach = e.letzte_event_id;
    const lauf = neuerLauf(this.holen);
    const items = new Set<string>();
    let neu = 0;

    for (let seite = 0; seite < HOECHSTENS_SEITEN; seite++) {
      let antwort: FeedSeite;
      try {
        antwort = await json<FeedSeite>(feedSeitenUrl(e.feed_url, nach), this.holen);
      } catch (f) {
        // Unbekannte lastEventId (z. B. nach Ruecksetzen des Feeds): von vorn lesen,
        // bekannte Events werden ueber (endpunkt, event_id) erkannt.
        if (f instanceof AbrufFehler && f.status === 404 && nach !== null) {
          nach = null;
          continue;
        }
        throw f;
      }
      const records: CloudEvent[] = Array.isArray(antwort.records) ? antwort.records : [];
      if (records.length === 0) break;

      let anzahl = 0;
      const registriert: AssetSchluessel[] = [];
      for (const ev of records) {
        // Ein geloeschter Endpunkt beendet den Lauf, statt in verwaiste Zeilen zu schreiben.
        if (!this.zeile(id)) return neu;
        const z = await uebernehmen(this.db, lauf, id, ev, !erstmals);
        if (!z) continue;
        anzahl++;
        items.add(z.item_id);
        if (z.art === "registriert") registriert.push({ endpunktId: id, itemId: z.item_id });
      }
      nach = records.at(-1)!.id;
      this.db.prepare("UPDATE endpunkte SET letzte_event_id=? WHERE id=?").run(nach, id);
      if (anzahl > 0) {
        neu += anzahl;
        this.strom.senden({ typ: "events", anzahl, registriert });
      }
      if (records.length < SEITE) break;
    }

    if (erstmals && items.size > 0) {
      const warteschlange = [...items];
      const arbeiter = async () => {
        for (let item = warteschlange.shift(); item; item = warteschlange.shift()) {
          if (!this.zeile(id)) return;
          await anreichern(this.db, lauf, id, item);
          // Je fertigem Asset melden: Namen, Logos und Bilder erscheinen nacheinander.
          this.strom.senden({ typ: "bestand" });
        }
      };
      await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter));
    }

    // Was in diesem oder frueheren Laeufen nicht kam, jetzt nachholen; auch ohne neue Events.
    if (this.zeile(id) && (await nachholen(this.db, lauf, id)) > 0) this.strom.senden({ typ: "bestand" });
    return neu;
  }
}
