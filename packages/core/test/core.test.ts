import { describe, expect, it } from "vitest";
import seite from "./fixtures/rc-feed-seite1.json" with { type: "json" };
import {
  TYP,
  anzeigewert,
  artVon,
  submodelAnzeigename,
  decodeIdentifier,
  encodeIdentifier,
  itemIdVon,
  satz,
  submodelNameVon,
  text,
  vergleichen,
  zusammenfassen,
  type CloudEvent,
  type PcnRecord,
  type Submodel,
} from "../src/index.ts";

const events = (seite as { records: CloudEvent[] }).records;
const ersterVom = (typ: string) => {
  const e = events.find((x) => x.type === typ);
  if (!e) throw new Error(`Kein ${typ} in der Testseite`);
  return e;
};

describe("base64url", () => {
  it("kodiert ohne Auffuellzeichen und mit - und _", () => {
    const id = "https://viewer-lapp.dti.neoception.dev/aas?itemId=PCN-TEST-CT-A";
    const kodiert = encodeIdentifier(id);
    expect(kodiert).not.toMatch(/[=+/]/);
    expect(kodiert).toBe(Buffer.from(id).toString("base64url"));
    expect(decodeIdentifier(kodiert)).toBe(id);
  });
});

describe("text", () => {
  it("liest die Feed-Form und bevorzugt Deutsch", () => {
    expect(text([{ en: "Teststreet" }, { de: "Teststraße" }])).toBe("Teststraße");
  });
  it("liest die AAS-Form", () => {
    expect(text([{ language: "en-US", text: "Cable" }])).toBe("Cable");
  });
  it("faellt auf irgendeine Sprache zurueck und ignoriert Leeres", () => {
    expect(text([{ de: "" }, { fr: "câble" }])).toBe("câble");
    expect(text(undefined)).toBeNull();
  });
});

describe("Events aus dem RC-Feed", () => {
  it("kennt alle Typen der Testseite", () => {
    expect(events.length).toBe(50);
    expect(events.filter((e) => artVon(e.type) === "unbekannt")).toEqual([]);
  });

  it("liest Item-ID aus AAS-, Submodel- und Asset-ID", () => {
    const aas = ersterVom(TYP.aasCreated);
    expect(itemIdVon(aas.subject)).toBe("PCN-TEST-CT-A");
    expect(itemIdVon(aas.data?.["globalAssetId"] as string)).toBe("PCN-TEST-CT-A");
    expect(submodelNameVon(ersterVom(TYP.submodelCreated).subject)).toBe("ProductChangeNotifications");
  });
});

describe("PCN", () => {
  const record = ersterVom(TYP.pcn).data?.["record"] as PcnRecord;

  it("fasst den Datensatz auf Deutsch zusammen", () => {
    const p = zusammenfassen(record);
    expect(p.abkuendigung).toBe(false);
    expect(p.hersteller).toBe("pcn-test Hersteller GmbH");
    expect(p.artikel).toBe("pcn-test Bezeichnung");
    expect(p.gruende).toEqual(["Kennzeichnung geändert", "Dokumentation geändert"]);
    expect(p.kategorien).toEqual(["Dokumentation", "Software und Firmware"]);
    expect(p.stichtag).toBe("2026-11-27T00:00:00+00:00");
    expect(p.ersatz[0]).toMatchObject({ bestellnummer: "CT-R1-BESTELL", passung: { einbau: 0.8, funktion: 1 } });
  });

  it("fasst denselben Datensatz auf Englisch zusammen", () => {
    const p = zusammenfassen(record, "en");
    expect(p.gruende).toEqual(["Labelling changed", "Documentation changed"]);
    expect(p.kategorien).toEqual(["Documentation", "Software and firmware"]);
  });

  it("erkennt eine Abkuendigung am Typ PDN", () => {
    expect(zusammenfassen({ ...record, PcnType: "PDN" }).abkuendigung).toBe(true);
  });
});

describe("Klartext", () => {
  const k = { organisation: "Musterwerk" };

  it("formuliert jede Art als Satz", () => {
    expect(satz(ersterVom(TYP.aasCreated), k).titel).toBe("Musterwerk hat PCN-TEST-CT-A registriert");
    expect(satz(ersterVom(TYP.submodelCreated), k).titel).toBe(
      "Änderungsmitteilungen für PCN-TEST-CT-A bereitgestellt",
    );
    expect(satz(ersterVom(TYP.pcn), k).titel).toBe("Änderungsmitteilung für pcn-test Bezeichnung zum 27.11.2026");
  });

  it("formuliert dieselben Saetze auf Englisch", () => {
    expect(satz(ersterVom(TYP.aasCreated), k, "en").titel).toBe("Musterwerk registered PCN-TEST-CT-A");
    expect(satz(ersterVom(TYP.submodelCreated), k, "en").titel).toBe("Change notifications provided for PCN-TEST-CT-A");
    expect(satz(ersterVom(TYP.pcn), k, "en").titel).toMatch(/^Change notice for .+ as of 27\/11\/2026$/);
  });

  it("nennt die erste Aenderung eines Updates", () => {
    const aenderungen = [
      { pfad: "Technische Daten / Querschnitt", vorher: "1,5", nachher: "2,5" },
      { pfad: "Technische Daten / Farbe", vorher: null, nachher: "grau" },
    ];
    const s = satz(ersterVom(TYP.submodelUpdated), { ...k, artikel: "ÖLFLEX 0815", aenderungen });
    expect(s.titel).toBe("Änderungsmitteilungen zu ÖLFLEX 0815 geändert");
    expect(s.zusatz).toBe("Querschnitt: 1,5 → 2,5 (und 1 weitere)");
    expect(satz(ersterVom(TYP.submodelUpdated), { ...k, artikel: "ÖLFLEX 0815", aenderungen }, "en").zusatz).toBe(
      "Querschnitt: 1,5 → 2,5 (and 1 more)",
    );
  });
});

describe("Submodell-Namen", () => {
  it("benennt bekannte Teilmodelle je Sprache, auch ohne semanticId", () => {
    expect(submodelAnzeigename(null, "AssetInterfacesDescription", "de")).toBe("Schnittstellenbeschreibung");
    expect(submodelAnzeigename(null, "AssetInterfacesDescription", "en")).toBe("Asset interfaces description");
    expect(submodelAnzeigename(null, "SoftwareNameplate", "de")).toBe("Software-Typenschild");
    expect(submodelAnzeigename(null, "Nameplate", "de")).toBe("Typenschild");
    expect(submodelAnzeigename(null, "Unbekannt", "de")).toBe("Unbekannt");
  });

  it("zeigt Mehrsprachiges in der gewaehlten Sprache", () => {
    const e = { modelType: "MultiLanguageProperty", value: [{ language: "de", text: "Kabel" }, { language: "en", text: "Cable" }] };
    expect(anzeigewert(e, "de")).toBe("Kabel");
    expect(anzeigewert(e, "en")).toBe("Cable");
  });
});

describe("Submodell-Vergleich", () => {
  const stand = (querschnitt: string, mitFarbe: boolean): Submodel => ({
    submodelElements: [
      {
        idShort: "Allgemein",
        modelType: "SubmodelElementCollection",
        value: [
          { idShort: "Querschnitt", modelType: "Property", value: querschnitt },
          ...(mitFarbe
            ? [{ idShort: "Farbe", modelType: "MultiLanguageProperty", value: [{ language: "de", text: "grau" }] }]
            : []),
        ],
      },
      { idShort: "Normen", modelType: "SubmodelElementList", value: [{ modelType: "Property", value: "IEC 60228" }] },
    ],
  });

  it("findet geaenderte, neue und entfernte Werte", () => {
    expect(vergleichen(stand("1,5", true), stand("2,5", false))).toEqual([
      { pfad: "Allgemein / Querschnitt", vorher: "1,5", nachher: "2,5" },
      { pfad: "Allgemein / Farbe", vorher: "grau", nachher: null },
    ]);
  });

  it("meldet ohne Vorstand alles als neu und bei Gleichstand nichts", () => {
    expect(vergleichen(null, stand("1,5", false)).map((a) => a.pfad)).toEqual([
      "Allgemein / Querschnitt",
      "Normen / [0]",
    ]);
    expect(vergleichen(stand("1,5", true), stand("1,5", true))).toEqual([]);
  });
});
