import { describe, expect, it } from "vitest";
import pf from "./fixtures/pf-teilmodelle.json" with { type: "json" };
import { bereinigeIdShort, elementAnPfad, lesbar, submodellAnsicht, type Element, type Gruppe, type Knoten, type Tabelle, type Wert } from "../src/index.ts";

// Echter Ausschnitt vom P+F-Testserver (Asset 181363), gespeichert am 04.11.2026.
const daten = pf as unknown as { dokumentation: Element[]; aenderungen: Element[]; technisch: Element[] };

const suche = (knoten: Knoten[], titel: string): Knoten | undefined => {
  for (const k of knoten) {
    if (k.titel === titel) return k;
    if (k.art === "gruppe") {
      const t = suche(k.kinder, titel);
      if (t) return t;
    }
  }
  return undefined;
};

describe("Bezeichnungen", () => {
  it("entfernt ECLASS-Endungen, Zaehler und Indizes", () => {
    expect(bereinigeIdShort("height_BAA020_v011")).toBe("height");
    expect(bereinigeIdShort("PhysicalAddress__0__")).toBe("PhysicalAddress");
    expect(bereinigeIdShort("ProductImages0")).toBe("ProductImages");
    expect(lesbar("Number_of_inputs_according_to_NAMUR_AAP507_v003")).toBe("Number of inputs according to NAMUR");
    expect(lesbar("ManufacturerProductDesignation")).toBe("Manufacturer Product Designation");
  });

  it("nimmt den displayName in der gewaehlten Sprache und streicht den @-Rest", () => {
    const [de] = submodellAnsicht(daten.dokumentation, "de");
    const [en] = submodellAnsicht(daten.dokumentation, "en");
    expect(de!.titel).toBe("Dokumente (Übergabedokumentation)");
    expect(en!.titel).toBe("Documents (handover documentation)");
    const e: Element & { displayName: unknown } = { idShort: "X", modelType: "Property", value: "1", displayName: [{ language: "de", text: "Wert@de" }] };
    expect(submodellAnsicht([e], "de")[0]!.titel).toBe("Wert");
  });
});

describe("Dokumentation von P+F", () => {
  it("wird zur Tabelle aus Titel und Datei mit gueltigen Pfaden", () => {
    const [doku] = submodellAnsicht(daten.dokumentation, "de");
    expect(doku!.art).toBe("tabelle");
    const t = doku as Tabelle;
    expect(t.spalten).toEqual(["Dokumententitel", "Digitale Dateien"]);
    expect(t.zeilen).toHaveLength(4);
    const titel = t.zeilen.map((z) => z[0]!.wert);
    expect(titel).toContain("Datasheet");
    const datei = t.zeilen[3]![1]!;
    expect(datei).toMatchObject({ typ: "datei", contentType: "application/pdf", pfad: "Documents[3].DocumentVersions[0].DigitalFiles[0]" });
    // Der Pfad fuehrt im Original wirklich auf die Datei.
    expect(elementAnPfad(daten.dokumentation, datei.pfad)).toMatchObject({ modelType: "File", value: datei.wert });
  });
});

describe("Technische Daten von P+F", () => {
  it("zieht Ebenen mit einem Kind zusammen und macht ECLASS-Namen lesbar", () => {
    const k = submodellAnsicht(daten.technisch, "de");
    const bereich = k.find((x) => x.art === "gruppe" && x.kinder.length > 20) as Gruppe | undefined;
    expect(bereich, "die 24 Merkmale stehen direkt in einer Gruppe, ohne Zwischenebene").toBeDefined();
    const hoehe = bereich!.kinder.find((w) => w.titel.toLowerCase() === "height") as Wert;
    expect(hoehe).toMatchObject({ typ: "zahl", wert: "119" });
    const uri = bereich!.kinder.find((w) => w.art === "wert" && w.typ === "url");
    expect(uri).toBeDefined();
  });
});

describe("Aenderungsmitteilungen von P+F", () => {
  it("macht Lebenszyklus-Meilensteine zur Tabelle und Daten zu Datumswerten", () => {
    const k = submodellAnsicht(daten.aenderungen, "de");
    const lc = suche(k, "Life Cycle Data") ?? suche(k, "Lebenszyklusdaten");
    expect(lc?.art).toBe("tabelle");
    const zeile = (lc as Tabelle).zeilen[0]!;
    expect(zeile.some((w) => w?.typ === "datum")).toBe(true);
  });
});

describe("Schluessel fuer Gruppen und Tabellen", () => {
  it("sind in jedem P+F-Teilmodell eindeutig und vorhanden", () => {
    for (const elemente of [daten.dokumentation, daten.aenderungen, daten.technisch]) {
      const pfade: string[] = [];
      const lauf = (knoten: Knoten[]) => {
        for (const k of knoten) {
          if (k.art === "wert") continue;
          pfade.push(k.pfad);
          if (k.art === "gruppe") lauf(k.kinder);
        }
      };
      lauf(submodellAnsicht(elemente, "de"));
      expect(pfade.length).toBeGreaterThan(0);
      expect(pfade.every((p) => p.length > 0)).toBe(true);
      expect(new Set(pfade).size).toBe(pfade.length);
    }
  });
});

describe("elementAnPfad", () => {
  it("findet nichts fuer erfundene Pfade", () => {
    expect(elementAnPfad(daten.dokumentation, "Documents[9].DocumentVersions[0]")).toBeNull();
    expect(elementAnPfad(daten.dokumentation, "Gibtsnicht")).toBeNull();
  });
});
