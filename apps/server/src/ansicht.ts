/**
 * Zeilen aus der DB in die Form, die die Oberflaeche braucht. Eine Stelle fuer API und Strom,
 * damit ein Event live und beim Nachladen gleich aussieht. Texte entstehen hier je Sprache.
 */

import {
  satz,
  semanticIdVon,
  submodelAnzeigename,
  submodelNameVon,
  zusammenfassen,
  type Aenderung,
  type CloudEvent,
  type PcnRecord,
  type Sprache,
} from "@datenportal/core";
import type { DB } from "./db.ts";
import type { EventZeile } from "./verarbeitung.ts";

export type EndpunktZeile = {
  id: number;
  organisation_id: number;
  name: string;
  feed_url: string;
  intervall_s: number;
  aktiv: number;
  letzte_event_id: string | null;
  letzter_abruf: string | null;
  naechster_abruf: string | null;
  letzter_fehler: string | null;
  angelegt: string;
};

export function endpunktAnsicht(db: DB, e: EndpunktZeile, liest = false) {
  const zahl = (sql: string) => (db.prepare(sql).get(e.id) as { n: number }).n;
  return {
    id: e.id,
    organisationId: e.organisation_id,
    name: e.name,
    feedUrl: e.feed_url,
    intervallS: e.intervall_s,
    aktiv: e.aktiv === 1,
    letzterAbruf: e.letzter_abruf,
    naechsterAbruf: e.aktiv === 1 ? e.naechster_abruf : null,
    letzterFehler: e.letzter_fehler,
    angelegt: e.angelegt,
    liest,
    events: zahl("SELECT COUNT(*) AS n FROM events WHERE endpunkt_id = ?"),
    assets: zahl("SELECT COUNT(*) AS n FROM assets WHERE endpunkt_id = ?"),
  };
}

/** Event mit Organisation und Asset-Namen, fuer die Saetze. */
export const EVENT_SQL = `
  SELECT e.*, o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.farbe AS org_farbe, a.name AS asset_name
  FROM events e
  JOIN endpunkte ep ON ep.id = e.endpunkt_id
  JOIN organisationen o ON o.id = ep.organisation_id
  LEFT JOIN assets a ON a.endpunkt_id = e.endpunkt_id AND a.item_id = e.item_id`;

export type EventMitKontext = EventZeile & {
  org_id: number;
  org_name: string;
  org_slug: string;
  org_farbe: string;
  asset_name: string | null;
};

export function eventAnsicht(e: EventMitKontext, sprache: Sprache, mitRoh = false) {
  const roh = JSON.parse(e.roh) as CloudEvent;
  const aenderungen = e.aenderungen ? (JSON.parse(e.aenderungen) as Aenderung[]) : null;
  const s = satz(roh, { organisation: e.org_name, artikel: e.asset_name, aenderungen }, sprache);
  const pcn = e.art === "pcn" ? zusammenfassen((roh.data?.["record"] ?? {}) as PcnRecord, sprache) : null;
  return {
    lfd: e.lfd,
    endpunktId: e.endpunkt_id,
    organisation: { id: e.org_id, name: e.org_name, slug: e.org_slug, farbe: e.org_farbe },
    art: e.art,
    itemId: e.item_id,
    assetName: e.asset_name,
    submodel: e.art.startsWith("submodel") ? submodelAnzeigename(semanticIdVon(roh), submodelNameVon(roh.subject), sprache) : null,
    zeit: e.zeit,
    titel: s.titel,
    zusatz: s.zusatz,
    aenderungen,
    abrufFehler: e.abruf_fehler,
    pcn,
    ...(mitRoh ? { roh } : {}),
  };
}

export function eventsLesen(db: DB, wo: string, werte: unknown[], sprache: Sprache, nachher = "") {
  return (db.prepare(`${EVENT_SQL} ${wo} ${nachher}`).all(...werte) as EventMitKontext[]).map((z) => eventAnsicht(z, sprache));
}

/** Kurzform eines Assets fuer Listen, mit Organisation. `a`, `ep`, `o` als Tabellenkuerzel. */
export const ASSET_SQL = `
  SELECT a.endpunkt_id AS endpunktId, a.item_id AS itemId, a.name, a.hersteller, a.bestellnummer,
         a.bild IS NOT NULL AS hatBild, a.logo IS NOT NULL AS hatLogo, a.registriert, a.aktualisiert, a.gespeichert,
         o.id AS organisationId, o.name AS organisation, o.slug AS organisationSlug, o.farbe AS organisationFarbe,
         o.oeffentlich AS organisationOeffentlich,
         (SELECT COUNT(*) FROM events e WHERE e.endpunkt_id = a.endpunkt_id AND e.item_id = a.item_id AND e.art = 'submodel-geaendert') AS anzahlUpdates,
         (SELECT COUNT(*) FROM pcns p WHERE p.endpunkt_id = a.endpunkt_id AND p.item_id = a.item_id) AS anzahlPcns,
         EXISTS (SELECT 1 FROM pcns p WHERE p.endpunkt_id = a.endpunkt_id AND p.item_id = a.item_id AND p.abkuendigung = 1) AS abgekuendigt
  FROM assets a
  JOIN endpunkte ep ON ep.id = a.endpunkt_id
  JOIN organisationen o ON o.id = ep.organisation_id`;

type AssetRoh = {
  endpunktId: number;
  itemId: string;
  name: string | null;
  hersteller: string | null;
  bestellnummer: string | null;
  hatBild: number;
  hatLogo: number;
  registriert: string | null;
  aktualisiert: string | null;
  gespeichert: string | null;
  organisationId: number;
  organisation: string;
  organisationSlug: string;
  organisationFarbe: string;
  organisationOeffentlich: number;
  anzahlUpdates: number;
  anzahlPcns: number;
  abgekuendigt: number;
};

export function assetAnsicht(a: AssetRoh) {
  return {
    ...a,
    hatBild: a.hatBild === 1,
    hatLogo: a.hatLogo === 1,
    abgekuendigt: a.abgekuendigt === 1,
    organisationOeffentlich: a.organisationOeffentlich === 1,
  };
}

export function assetsLesen(db: DB, wo: string, werte: unknown[], nachher = "") {
  return (db.prepare(`${ASSET_SQL} ${wo} ${nachher}`).all(...werte) as AssetRoh[]).map(assetAnsicht);
}

export type OrganisationZeile = {
  id: number;
  slug: string;
  name: string;
  farbe: string;
  logo_typ: string | null;
  kurz_de: string | null;
  kurz_en: string | null;
  beschreibung_de: string | null;
  beschreibung_en: string | null;
  webseite: string | null;
  kontakt_email: string | null;
  oeffentlich: number;
  angelegt: string;
};

/**
 * Profil einer Organisation; mit `beideSprachen` fuer das Backoffice, das beide Texte bearbeitet.
 * Die Kurztexte (`kurz_de`, `kurz_en`) sind seit dem 04.11.2026 aus der Oberflaeche entfernt
 * und bleiben ungenutzt in der Tabelle.
 */
export function organisationAnsicht(o: OrganisationZeile, sprache: Sprache, beideSprachen = false) {
  const beschreibung = sprache === "en" ? (o.beschreibung_en ?? o.beschreibung_de) : (o.beschreibung_de ?? o.beschreibung_en);
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    farbe: o.farbe,
    hatLogo: !!o.logo_typ,
    beschreibung,
    webseite: o.webseite,
    kontaktEmail: o.kontakt_email,
    oeffentlich: o.oeffentlich === 1,
    angelegt: o.angelegt,
    ...(beideSprachen ? { beschreibungDe: o.beschreibung_de, beschreibungEn: o.beschreibung_en } : {}),
  };
}

/** Kennzahlen einer Organisation oder (ohne id) aller oeffentlichen Organisationen. */
export function kennzahlen(db: DB, organisationId: number | null) {
  const filter =
    organisationId === null
      ? "AND ep.organisation_id IN (SELECT id FROM organisationen WHERE oeffentlich = 1)"
      : "AND ep.organisation_id = ?";
  const werte = organisationId === null ? [] : [organisationId];
  const zahl = (sql: string, ...mehr: unknown[]) => (db.prepare(sql).get(...werte, ...mehr) as { n: number }).n;
  const heute = new Date().toISOString().slice(0, 10);
  return {
    assets: zahl(`SELECT COUNT(*) AS n FROM assets a JOIN endpunkte ep ON ep.id = a.endpunkt_id WHERE 1 ${filter}`),
    neuHeute: zahl(`SELECT COUNT(*) AS n FROM assets a JOIN endpunkte ep ON ep.id = a.endpunkt_id WHERE 1 ${filter} AND a.registriert >= ?`, heute),
    updates: zahl(`SELECT COUNT(*) AS n FROM events e JOIN endpunkte ep ON ep.id = e.endpunkt_id WHERE 1 ${filter} AND e.art LIKE 'submodel-%'`),
    pcns: zahl(`SELECT COUNT(*) AS n FROM pcns p JOIN endpunkte ep ON ep.id = p.endpunkt_id WHERE 1 ${filter}`),
    abkuendigungen: zahl(`SELECT COUNT(*) AS n FROM pcns p JOIN endpunkte ep ON ep.id = p.endpunkt_id WHERE 1 ${filter} AND p.abkuendigung = 1`),
    events: zahl(`SELECT COUNT(*) AS n FROM events e JOIN endpunkte ep ON ep.id = e.endpunkt_id WHERE 1 ${filter}`),
  };
}
