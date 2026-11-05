/**
 * Submodelle (AAS v3 JSON) lesen und zwei Staende vergleichen.
 *
 * Fuer die Anzeige "Was hat sich geaendert" wird ein Submodell zu einer flachen Liste von
 * Blattwerten mit Pfad aus idShorts. Listen-Elemente ohne idShort bekommen ihren Index.
 */

import { sprachfolge, text, type Sprache } from "./sprache.ts";

export type Element = {
  idShort?: string;
  modelType?: string;
  value?: unknown;
  valueType?: string;
  min?: unknown;
  max?: unknown;
  contentType?: string;
  semanticId?: unknown;
};

export type Submodel = {
  id?: string;
  idShort?: string;
  semanticId?: { keys?: { value?: string }[] };
  submodelElements?: Element[];
};

export type Blatt = { pfad: string; wert: string };

export type Aenderung = {
  pfad: string;
  vorher: string | null;
  nachher: string | null;
};

/** Anzeigewert eines Elements ohne Kinder, oder null fuer Container. Mehrsprachiges in `sprache`. */
export function anzeigewert(e: Element, sprache: Sprache = "de"): string | null {
  switch (e.modelType) {
    case "Property":
      return e.value === undefined || e.value === null ? "" : String(e.value);
    case "MultiLanguageProperty":
      return text(e.value, sprachfolge(sprache)) ?? "";
    case "Range":
      return `${e.min ?? ""} … ${e.max ?? ""}`;
    case "File":
    case "Blob":
      return typeof e.value === "string" ? e.value : "";
    case "ReferenceElement": {
      const keys = (e.value as { keys?: { value?: string }[] } | undefined)?.keys;
      return keys?.map((k) => k.value).join(" / ") ?? "";
    }
    case "SubmodelElementCollection":
    case "SubmodelElementList":
    case "Entity":
      return null;
    default:
      return e.value === undefined ? null : JSON.stringify(e.value);
  }
}

export function kinder(e: Element): Element[] {
  if (e.modelType === "Entity") {
    const st = (e as { statements?: unknown }).statements;
    return Array.isArray(st) ? (st as Element[]) : [];
  }
  return Array.isArray(e.value) && (e.modelType === "SubmodelElementCollection" || e.modelType === "SubmodelElementList")
    ? (e.value as Element[])
    : [];
}

export function blaetter(sm: Submodel): Blatt[] {
  const aus: Blatt[] = [];
  const lauf = (elemente: Element[], prefix: string) => {
    elemente.forEach((e, i) => {
      const name = e.idShort && e.idShort.length > 0 ? e.idShort : `[${i}]`;
      const pfad = prefix ? `${prefix} / ${name}` : name;
      const wert = anzeigewert(e);
      if (wert !== null) aus.push({ pfad, wert });
      lauf(kinder(e), pfad);
    });
  };
  lauf(sm.submodelElements ?? [], "");
  return aus;
}

export function vergleichen(vorher: Submodel | null, nachher: Submodel): Aenderung[] {
  const alt = new Map((vorher ? blaetter(vorher) : []).map((b) => [b.pfad, b.wert]));
  const neu = new Map(blaetter(nachher).map((b) => [b.pfad, b.wert]));
  const aus: Aenderung[] = [];
  for (const [pfad, wert] of neu) {
    const war = alt.get(pfad);
    if (war === undefined) aus.push({ pfad, vorher: null, nachher: wert });
    else if (war !== wert) aus.push({ pfad, vorher: war, nachher: wert });
  }
  for (const [pfad, war] of alt) {
    if (!neu.has(pfad)) aus.push({ pfad, vorher: war, nachher: null });
  }
  return aus;
}

/** Bekannte Submodelle mit Anzeigenamen je Sprache, erkannt an der semanticId. */
const BEKANNT: { muster: RegExp; name: Record<Sprache, string> }[] = [
  // Vor "nameplate", sonst traefe das allgemeinere Muster zuerst.
  { muster: /SoftwareNameplate/i, name: { de: "Software-Typenschild", en: "Software nameplate" } },
  { muster: /nameplate/i, name: { de: "Typenschild", en: "Nameplate" } },
  { muster: /0173-1#01-AHE582/, name: { de: "Änderungsmitteilungen", en: "Change notifications" } },
  { muster: /ProductChangeNotifications/i, name: { de: "Änderungsmitteilungen", en: "Change notifications" } },
  { muster: /TechnicalData/i, name: { de: "Technische Daten", en: "Technical data" } },
  { muster: /HandoverDocumentation|Documentation/i, name: { de: "Dokumentation", en: "Documentation" } },
  { muster: /CarbonFootprint/i, name: { de: "CO₂-Fußabdruck", en: "Carbon footprint" } },
  { muster: /ContactInformation/i, name: { de: "Kontakt", en: "Contact" } },
  { muster: /AssetInterfaces?Description/i, name: { de: "Schnittstellenbeschreibung", en: "Asset interfaces description" } },
  { muster: /HierarchicalStructures|BillOfMaterial/i, name: { de: "Stückliste", en: "Bill of material" } },
];

export function submodelAnzeigename(semanticId: string | null, fallback: string | null, sprache: Sprache = "de"): string {
  const quelle = `${semanticId ?? ""} ${fallback ?? ""}`;
  return BEKANNT.find((b) => b.muster.test(quelle))?.name[sprache] ?? fallback ?? (sprache === "en" ? "Submodel" : "Submodell");
}
