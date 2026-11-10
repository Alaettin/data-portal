/**
 * Zugriff auf die eigene API und die Formen, die sie liefert. Fehler kommen als Code
 * (`{ fehler: "name-fehlt" }`); uebersetzt wird in der Oberflaeche, nicht hier.
 */

import type { Aenderung, PcnZusammenfassung } from "@datenportal/core";
import type { Uebersetzer } from "./i18n/sprache.tsx";

export class ApiFehler extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly grund: string | null = null,
  ) {
    super(code);
  }
}

export async function api<T>(pfad: string, optionen: { methode?: string; koerper?: unknown } = {}): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(pfad, {
      method: optionen.methode ?? "GET",
      credentials: "same-origin",
      headers: optionen.koerper === undefined ? undefined : { "content-type": "application/json" },
      body: optionen.koerper === undefined ? undefined : JSON.stringify(optionen.koerper),
    });
  } catch {
    throw new ApiFehler("verbindung", 0);
  }
  const text = await antwort.text();
  const daten = text ? (JSON.parse(text) as unknown) : null;
  if (!antwort.ok) {
    const f = (daten ?? {}) as { fehler?: string; grund?: string };
    // 429 kommt von der Anmeldedrossel, ohne eigenen Code.
    throw new ApiFehler(f.fehler ?? (antwort.status === 429 ? "zu-viele" : String(antwort.status)), antwort.status, f.grund ?? null);
  }
  return daten as T;
}

/** Fehler einer Aktion als Klartext in der aktuellen Sprache. */
export function fehlertext(f: unknown, u: Uebersetzer): string {
  if (f instanceof ApiFehler) return u.fehler(f.code, { grund: f.grund ?? "", status: f.status });
  return u.fehler("verbindung");
}

/** Haengt die Sprache an, damit Saetze und Klartexte passend vom Server kommen. */
export function mitSprache(pfad: string, sprache: string): string {
  return `${pfad}${pfad.includes("?") ? "&" : "?"}sprache=${sprache}`;
}

export type Art = "registriert" | "submodel-neu" | "submodel-geaendert" | "pcn" | "unbekannt";

export type OrganisationKurz = { id: number; name: string; slug: string; farbe: string };

export type Ereignis = {
  lfd: number;
  endpunktId: number;
  organisation: OrganisationKurz;
  art: Art;
  itemId: string;
  assetName: string | null;
  submodel: string | null;
  zeit: string;
  titel: string;
  zusatz: string | null;
  aenderungen: Aenderung[] | null;
  pcn: PcnZusammenfassung | null;
  roh?: unknown;
};

export type AssetKurz = {
  endpunktId: number;
  itemId: string;
  name: string | null;
  hersteller: string | null;
  bestellnummer: string | null;
  hatBild: boolean;
  hatLogo: boolean;
  registriert: string | null;
  aktualisiert: string | null;
  /** Zuletzt erfolgreich gespeichert: Shell, Teilmodell oder Bild. */
  gespeichert: string | null;
  organisationId: number;
  organisation: string;
  organisationSlug: string;
  organisationFarbe: string;
  organisationOeffentlich: boolean;
  /** Von der Organisation aus der oeffentlichen Ansicht ausgeblendet; nur das Backoffice sieht es. */
  verborgen: boolean;
  anzahlUpdates: number;
  anzahlPcns: number;
  abgekuendigt: boolean;
};

export type AssetListe = {
  eintraege: AssetKurz[];
  gesamt: number;
  seite: number;
  proSeite: number;
  facetten: { organisationen: { id: number; name: string; anzahl: number }[] };
};

export type Submodell = {
  id: string;
  semanticId: string | null;
  name: string;
  inhalt: { submodelElements?: unknown[] } | null;
  nichtGeladen: boolean;
  stand: string;
};

export type PcnEintrag = PcnZusammenfassung & { eventId: string; zeit: string };

export type AssetDetail = AssetKurz & {
  aasId: string | null;
  globalAssetId: string | null;
  submodelle: Submodell[];
  pcns: PcnEintrag[];
  verlauf: Ereignis[];
};

export type Kennzahlen = { assets: number; neuHeute: number; updates: number; pcns: number; abkuendigungen: number; events: number };

export type Organisation = {
  id: number;
  slug: string;
  name: string;
  farbe: string;
  hatLogo: boolean;
  beschreibung: string | null;
  webseite: string | null;
  kontaktEmail: string | null;
  oeffentlich: boolean;
  angelegt: string;
};

export type OrganisationProfil = Organisation & {
  beschreibungDe: string | null;
  beschreibungEn: string | null;
};

export type Endpunkt = {
  id: number;
  organisationId: number;
  name: string;
  feedUrl: string;
  intervallS: number;
  aktiv: boolean;
  letzterAbruf: string | null;
  naechsterAbruf: string | null;
  letzterFehler: string | null;
  angelegt: string;
  liest: boolean;
  events: number;
  assets: number;
};

export type Nutzer = { id: number; email: string; name: string; rolle: "admin" | "organisation"; organisationId: number | null };

export const bildUrl = (a: { endpunktId: number; itemId: string }) =>
  `/api/assets/${a.endpunktId}/${encodeURIComponent(a.itemId)}/bild`;
export const orgLogoUrl = (id: number) => `/api/organisationen/${id}/logo`;
/** Detailseite eines Assets; `basis` ist `/assets` im Besucherbereich, `/backoffice/:orgId/assets` im Backoffice. */
export const assetPfad = (a: { endpunktId: number; itemId: string }, basis = "/assets") => `${basis}/${a.endpunktId}/${encodeURIComponent(a.itemId)}`;
export const dateiUrl = (a: { endpunktId: number; itemId: string }, submodelId: string, pfad: string) =>
  `/api/assets/${a.endpunktId}/${encodeURIComponent(a.itemId)}/datei?sm=${encodeURIComponent(submodelId)}&pfad=${encodeURIComponent(pfad)}`;
