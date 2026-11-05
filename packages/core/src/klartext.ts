/**
 * Ein Event als Satz fuer Nutzer ohne Technikhintergrund (Anforderung "Eventview":
 * nicht die Einzelevents zeigen, sondern die eigentliche Aktion). Erzeugt beim Lesen,
 * nicht gespeichert, damit dieselbe Zeile auf Deutsch und Englisch erscheinen kann.
 */

import { artVon, itemIdVon, semanticIdVon, submodelNameVon, type Art, type CloudEvent } from "./events.ts";
import { zusammenfassen, type PcnRecord } from "./pcn.ts";
import type { Sprache } from "./sprache.ts";
import { submodelAnzeigename, type Aenderung } from "./submodel.ts";

export type Kontext = {
  /** Anzeigename der Organisation, der der Endpunkt gehoert. */
  organisation: string;
  /** Anzeigename des Assets, sonst die Item-ID. */
  artikel?: string | null;
  /** Ergebnis von `vergleichen`, falls das Submodell geladen werden konnte. */
  aenderungen?: Aenderung[] | null;
};

export type Satz = {
  art: Art;
  titel: string;
  zusatz: string | null;
};

export function datum(iso: string, sprache: Sprache = "de"): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(sprache === "en" ? "en-GB" : "de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      });
}

function letztesGlied(pfad: string): string {
  return pfad.split(" / ").at(-1) ?? pfad;
}

function aenderungstext(a: Aenderung[], sprache: Sprache): string | null {
  const en = sprache === "en";
  const leer = en ? "empty" : "leer";
  const echte = a.filter((x) => x.vorher !== null && x.nachher !== null);
  const erste = echte[0];
  if (!erste) return a.length > 0 ? (en ? `${a.length} values added or removed` : `${a.length} Werte neu oder entfernt`) : null;
  const rest = a.length - 1;
  const kopf = `${letztesGlied(erste.pfad)}: ${erste.vorher || leer} → ${erste.nachher || leer}`;
  if (rest <= 0) return kopf;
  return en ? `${kopf} (and ${rest} more)` : `${kopf} (und ${rest} weitere)`;
}

export function satz(event: CloudEvent, k: Kontext, sprache: Sprache = "de"): Satz {
  const en = sprache === "en";
  const art = artVon(event.type);
  const artikel = k.artikel ?? itemIdVon(event.subject);
  const sm = submodelAnzeigename(semanticIdVon(event), submodelNameVon(event.subject), sprache);

  switch (art) {
    case "registriert":
      return en
        ? { art, titel: `${k.organisation} registered ${artikel}`, zusatz: "New digital twin available" }
        : { art, titel: `${k.organisation} hat ${artikel} registriert`, zusatz: "Neuer digitaler Zwilling verfügbar" };
    case "submodel-neu":
      return { art, titel: en ? `${sm} provided for ${artikel}` : `${sm} für ${artikel} bereitgestellt`, zusatz: null };
    case "submodel-geaendert":
      return {
        art,
        titel: en ? `${sm} of ${artikel} changed` : `${sm} zu ${artikel} geändert`,
        zusatz: k.aenderungen ? aenderungstext(k.aenderungen, sprache) : null,
      };
    case "pcn": {
      const p = zusammenfassen((event.data?.["record"] ?? {}) as PcnRecord, sprache);
      const was = p.abkuendigung ? (en ? "Discontinuation" : "Abkündigung") : en ? "Change notice" : "Änderungsmitteilung";
      const wann = p.stichtag ? (en ? ` as of ${datum(p.stichtag, sprache)}` : ` zum ${datum(p.stichtag, sprache)}`) : "";
      return {
        art,
        titel: `${was} ${en ? "for" : "für"} ${p.artikel ?? artikel}${wann}`,
        zusatz: p.titel ?? (p.gruende.length > 0 ? p.gruende.join(", ") : null),
      };
    }
    default:
      return { art, titel: en ? `Unknown event ${event.type}` : `Unbekanntes Ereignis ${event.type}`, zusatz: null };
  }
}
