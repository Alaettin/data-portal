/**
 * Ein Teilmodell als Ansichtsmodell fuer Menschen.
 *
 * Teilmodelle sind tief verschachtelt, oft mit Ebenen, die genau ein Element enthalten
 * (Dokument → Versionen(1) → Version → Dateien(1) → Datei). Hier wird daraus:
 * - `wert`: Bezeichnung und Wert mit Typ (Text, URL, Datei, Datum, Zahl, ja/nein),
 * - `gruppe`: eine Sammlung mit Kopf,
 * - `tabelle`: eine Liste gleichartiger flacher Eintraege (Dokumente, Meilensteine).
 *
 * Jeder Wert traegt seinen idShortPath (`Documents[3].DocumentVersions[0].DigitalFiles[0]`),
 * damit eine Datei beim Hersteller abgerufen werden kann.
 */

import { sprachfolge, text, type Sprache } from "./sprache.ts";
import { anzeigewert, kinder, type Element } from "./submodel.ts";

export type Werttyp = "text" | "url" | "datei" | "datum" | "zahl" | "ja-nein";

export type Wert = {
  art: "wert";
  titel: string;
  wert: string;
  typ: Werttyp;
  pfad: string;
  contentType?: string;
};
/** `pfad` ist der idShortPath des Containers: eindeutiger Schluessel, etwa fuer Ein- und Ausklappen. */
export type Gruppe = { art: "gruppe"; titel: string; pfad: string; kinder: Knoten[] };
export type Tabelle = { art: "tabelle"; titel: string; pfad: string; spalten: string[]; zeilen: (Wert | null)[][] };
export type Knoten = Wert | Gruppe | Tabelle;

/** Mit Bezeichnung vom Element selbst (idShort oder displayName) oder nur vom Platz in der Liste. */
type Roh = Knoten & { eigenerName: boolean };

/** `height_BAA020_v011` → `height`, `PhysicalAddress__0__` → `PhysicalAddress`, `ProductImages0` → `ProductImages`. */
export function bereinigeIdShort(idShort: string): string {
  return idShort
    .replace(/_?[A-Z]{3}\d{3}(_v\d{3})?$/, "")
    .replace(/__\d+__$/, "")
    .replace(/(?<=[A-Za-z])\d+$/, "");
}

/** Lesbare Bezeichnung: Unterstriche und CamelCase aufloesen, erster Buchstabe gross. */
export function lesbar(idShort: string): string {
  const s = bereinigeIdShort(idShort)
    .replace(/_+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function bezeichnung(e: Element & { displayName?: unknown }, sprache: Sprache): string | null {
  const anzeige = text(e.displayName, sprachfolge(sprache));
  // Manche Hersteller schreiben die Sprache in den Text ("…@de").
  if (anzeige) return anzeige.replace(/@[a-z]{2}(-[A-Za-z]{2})?$/, "").trim();
  return e.idShort ? lesbar(e.idShort) : null;
}

const ZAHL = /^xs:(float|double|decimal|int|integer|long|short|byte|unsigned\w*|nonNegativeInteger|positiveInteger)$/;

function werttyp(e: Element, wert: string): Werttyp {
  if (e.modelType === "File" || e.modelType === "Blob") return "datei";
  if (/^https?:\/\/\S+$/i.test(wert)) return "url";
  const vt = e.valueType ?? "";
  if (vt === "xs:date" || vt === "xs:dateTime") return "datum";
  if (vt === "xs:boolean") return "ja-nein";
  if (ZAHL.test(vt) && wert !== "" && !Number.isNaN(Number(wert))) return "zahl";
  return "text";
}

/** `1.00` → `1`, `0.50` → `0.5`; alles andere unveraendert. */
function zahlText(wert: string): string {
  return /^-?\d+\.\d*?0+$/.test(wert) ? wert.replace(/\.?0+$/, "") : wert;
}

function baue(e: Element, pfad: string, sprache: Sprache, listenNummer: number | null): Roh {
  const eigene = bezeichnung(e, sprache);
  const titel = eigene ?? (listenNummer !== null ? String(listenNummer + 1) : "");
  // Eigener Name heisst eigener idShort. Listeneintraege tragen bei P+F zwar einen
  // displayName, aber einen allgemeinen ("Name der spezifischen digitalen Datei"); beim
  // Zusammenziehen soll dort der Name der Liste stehen ("Digitale Dateien").
  const eigenerName = !!e.idShort;
  const wert = anzeigewert(e, sprache);

  if (wert !== null) {
    const typ = werttyp(e, wert);
    return {
      art: "wert",
      titel,
      wert: typ === "zahl" ? zahlText(wert) : wert,
      typ,
      pfad,
      ...(e.contentType ? { contentType: e.contentType } : {}),
      eigenerName,
    };
  }

  const istListe = e.modelType === "SubmodelElementList";
  const unter = kinder(e).map((k, i) =>
    baue(k, istListe ? `${pfad}[${i}]` : `${pfad}.${k.idShort ?? i}`, sprache, istListe ? i : null),
  );

  // Eine Ebene mit genau einem Kind zusammenziehen. Hat das Kind keinen eigenen Namen
  // (Listeneintrag), traegt es den Namen des Containers.
  if (unter.length === 1) {
    const kind = unter[0]!;
    return kind.eigenerName ? kind : { ...kind, titel, eigenerName };
  }

  if (istListe && unter.length >= 2 && unter.every((k) => k.art === "gruppe" && k.kinder.every((w) => w.art === "wert"))) {
    const spalten: string[] = [];
    for (const k of unter as Gruppe[]) for (const w of k.kinder) if (!spalten.includes(w.titel)) spalten.push(w.titel);
    const zeilen = (unter as Gruppe[]).map((k) => spalten.map((s) => (k.kinder as Wert[]).find((w) => w.titel === s) ?? null));
    return { art: "tabelle", titel, pfad, spalten, zeilen, eigenerName };
  }

  return { art: "gruppe", titel, pfad, kinder: unter.map(ohneHilfsfeld), eigenerName };
}

function ohneHilfsfeld(k: Roh): Knoten {
  const { eigenerName: _weg, ...rest } = k;
  return rest as Knoten;
}

export function submodellAnsicht(elemente: Element[], sprache: Sprache = "de"): Knoten[] {
  return elemente.map((e, i) => ohneHilfsfeld(baue(e, e.idShort ?? String(i), sprache, null)));
}

/** Das Element an einem idShortPath, oder null. Fuer die Pruefung vor dem Datei-Abruf. */
export function elementAnPfad(elemente: Element[], pfad: string): Element | null {
  const teile = pfad.match(/[^.[\]]+|\[\d+\]/g);
  if (!teile) return null;
  let ebene: Element[] = elemente;
  let treffer: Element | null = null;
  for (const teil of teile) {
    const index = /^\[(\d+)\]$/.exec(teil);
    treffer = index ? (ebene[Number(index[1])] ?? null) : (ebene.find((e) => e.idShort === teil) ?? null);
    if (!treffer) return null;
    ebene = kinder(treffer);
  }
  return treffer;
}
