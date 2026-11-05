/**
 * PCN-Datensatz nach IDTA 02036 (Anhang G), wie er in `data.record` eines `pcn.v1`-Events steht.
 * Feldnamen aus `erwarteterDatensatz()` in pcn-testing, Codes nach VDMA 24903 (IDTA 02036
 * Abschnitt 4.1 und 4.2), hier mit Klartexten auf Deutsch und Englisch fuer Nutzer ohne
 * Technikhintergrund.
 */

import { sprachfolge, text, type Sprache } from "./sprache.ts";

type Mehrsprachig = Record<string, string>[];
type Klartext = { de: string; en: string };

export type PcnRecord = {
  PcnType?: "PCN" | "PDN" | string;
  ManufacturerChangeID?: string;
  DateOfRecord?: string;
  Manufacturer?: { ManufacturerName?: Mehrsprachig };
  ItemOfChange?: {
    ManufacturerProductFamily?: Mehrsprachig;
    ManufacturerProductDesignation?: Mehrsprachig;
    OrderCodeOfManufacturer?: Mehrsprachig;
  };
  ReasonsOfChange?: { ReasonId?: string; ReasonClassificationSystem?: string }[];
  ItemCategories?: { ItemCategory?: string; ItemClassificationSystem?: string }[];
  PcnChangeInformation?: { ChangeTitle?: Mehrsprachig; ChangeDetail?: Mehrsprachig };
  LifeCycleData?: { MilestoneClassification?: string; DateOfValidity?: string }[];
  RecommendedItems?: {
    ManufacturerProductFamily?: Mehrsprachig;
    ManufacturerProductDesignation?: Mehrsprachig;
    OrderCodeOfManufacturer?: Mehrsprachig;
    TechnicalData_Fit?: { TargetEstimate?: number };
    TechnicalData_Form?: { TargetEstimate?: number };
    TechnicalData_Function?: { TargetEstimate?: number };
    TechnicalData_Other?: { TargetEstimate?: number };
  }[];
};

// VDMA 24903, Tabelle 25 (ReasonId).
export const GRUENDE: Record<string, Klartext> = {
  PDN: { de: "Abkündigung", en: "Discontinuation" },
  MANAQ: { de: "Übernahme des Herstellers", en: "Manufacturer acquired" },
  ALERT: { de: "Warnung", en: "Alert" },
  SOFTW: { de: "Software geändert", en: "Software changed" },
  LABEL: { de: "Kennzeichnung geändert", en: "Labelling changed" },
  CHARA: { de: "Eigenschaften geändert", en: "Characteristics changed" },
  DOCUM: { de: "Dokumentation geändert", en: "Documentation changed" },
  NRND: { de: "Nicht mehr für Neuentwicklungen empfohlen", en: "Not recommended for new designs" },
  FIT: { de: "Einbau geändert", en: "Fit changed" },
  FORM: { de: "Form und Aussehen geändert", en: "Form and appearance changed" },
  FUNCT: { de: "Funktion geändert", en: "Function changed" },
  INSOL: { de: "Insolvenz", en: "Insolvency" },
  CORR: { de: "Korrektur", en: "Correction" },
  SHIP: { de: "Lieferung geändert", en: "Shipping changed" },
  MATER: { de: "Material geändert", en: "Material changed" },
  PRODS: { de: "Produktionsstart", en: "Start of production" },
  PPROC: { de: "Fertigungsprozess geändert", en: "Production process changed" },
  PSITE: { de: "Fertigungsstandort geändert", en: "Production site changed" },
  CANCN: { de: "PCN zurückgezogen", en: "PCN withdrawn" },
  CANDN: { de: "Abkündigung zurückgezogen", en: "Discontinuation withdrawn" },
  RECA: { de: "Rückruf", en: "Recall" },
  TESTP: { de: "Prüfprozess geändert", en: "Test process changed" },
  TESTS: { de: "Prüfstandort geändert", en: "Test site changed" },
  ORCOD: { de: "Typschlüssel geändert", en: "Order code changed" },
};

// VDMA 24903, Tabelle 24 (ItemCategory).
export const KATEGORIEN: Record<string, Klartext> = {
  ACEL: { de: "Aktive Elektronik", en: "Active electronics" },
  DACE: { de: "Daten und Zertifikate", en: "Data and certificates" },
  SERV: { de: "Service", en: "Service" },
  DOCU: { de: "Dokumentation", en: "Documentation" },
  ELME: { de: "Elektromechanik", en: "Electromechanics" },
  FLUI: { de: "Fluidtechnik", en: "Fluid technology" },
  AUXM: { de: "Hilfsstoffe", en: "Auxiliary materials" },
  HYDR: { de: "Hydraulik", en: "Hydraulics" },
  MECH: { de: "Mechanik", en: "Mechanics" },
  MULT: { de: "Mehrere Kategorien", en: "Multiple categories" },
  PAEL: { de: "Passive Elektrik und Elektronik", en: "Passive electrics and electronics" },
  PNEU: { de: "Pneumatik", en: "Pneumatics" },
  RAWM: { de: "Rohstoffe", en: "Raw materials" },
  SWFW: { de: "Software und Firmware", en: "Software and firmware" },
  OTHR: { de: "Sonstiges", en: "Other" },
  CCBL: { de: "Steckverbinder und Kabel", en: "Connectors and cables" },
  ASSY: { de: "Baugruppe", en: "Assembly" },
};

// IDTA 02036, Tabelle 3: Meilensteine im Lebenszyklus.
export const MEILENSTEINE: Record<string, Klartext> = {
  SOP: { de: "Produktionsstart", en: "Start of production" },
  NRND: { de: "Nicht für Neuentwicklungen", en: "Not for new designs" },
  PCN: { de: "Änderung wirksam", en: "Change effective" },
  EOS: { de: "Verkaufsende", en: "End of sale" },
  EOP: { de: "Produktionsende", en: "End of production" },
  LTD: { de: "Letzter Bestelltermin", en: "Last time delivery" },
  EOSR: { de: "Ende Service und Reparatur", en: "End of service and repair" },
};

export type Ersatz = {
  bezeichnung: string | null;
  bestellnummer: string | null;
  /** Kompatibilitaet 0 bis 1 je Merkmal, laut IDTA 02036 TargetEstimate. */
  passung: { einbau?: number; form?: number; funktion?: number; sonstiges?: number };
};

export type PcnZusammenfassung = {
  abkuendigung: boolean;
  titel: string | null;
  detail: string | null;
  hersteller: string | null;
  artikel: string | null;
  familie: string | null;
  bestellnummer: string | null;
  gruende: string[];
  kategorien: string[];
  meilensteine: { name: string; datum: string }[];
  /** Fruehester Stichtag aus LifeCycleData. */
  stichtag: string | null;
  ersatz: Ersatz[];
};

export function istAbkuendigung(record: PcnRecord): boolean {
  return record.PcnType === "PDN" || (record.ReasonsOfChange ?? []).some((g) => g.ReasonId === "PDN");
}

export function zusammenfassen(record: PcnRecord, sprache: Sprache = "de"): PcnZusammenfassung {
  const folge = sprachfolge(sprache);
  const t = (wert: unknown) => text(wert, folge);
  const gruende = (record.ReasonsOfChange ?? [])
    .map((g) => g.ReasonId)
    .filter((id): id is string => typeof id === "string")
    .map((id) => GRUENDE[id]?.[sprache] ?? id);
  const kategorien = (record.ItemCategories ?? [])
    .map((k) => k.ItemCategory)
    .filter((id): id is string => typeof id === "string")
    .map((id) => KATEGORIEN[id]?.[sprache] ?? id);
  const meilensteine = (record.LifeCycleData ?? [])
    .filter((m) => typeof m.DateOfValidity === "string")
    .map((m) => ({
      name:
        MEILENSTEINE[m.MilestoneClassification ?? ""]?.[sprache] ??
        m.MilestoneClassification ??
        (sprache === "en" ? "Due date" : "Stichtag"),
      datum: m.DateOfValidity as string,
    }))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  return {
    abkuendigung: istAbkuendigung(record),
    titel: t(record.PcnChangeInformation?.ChangeTitle),
    detail: t(record.PcnChangeInformation?.ChangeDetail),
    hersteller: t(record.Manufacturer?.ManufacturerName),
    artikel: t(record.ItemOfChange?.ManufacturerProductDesignation),
    familie: t(record.ItemOfChange?.ManufacturerProductFamily),
    bestellnummer: t(record.ItemOfChange?.OrderCodeOfManufacturer),
    gruende,
    kategorien,
    meilensteine,
    stichtag: meilensteine[0]?.datum ?? null,
    ersatz: (record.RecommendedItems ?? []).map((r) => ({
      bezeichnung: t(r.ManufacturerProductDesignation) ?? t(r.ManufacturerProductFamily),
      bestellnummer: t(r.OrderCodeOfManufacturer),
      passung: {
        einbau: r.TechnicalData_Fit?.TargetEstimate,
        form: r.TechnicalData_Form?.TargetEstimate,
        funktion: r.TechnicalData_Function?.TargetEstimate,
        sonstiges: r.TechnicalData_Other?.TargetEstimate,
      },
    })),
  };
}
