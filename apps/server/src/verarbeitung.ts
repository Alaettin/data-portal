/**
 * Ein Event des Feeds in den Bestand uebernehmen: Rohevent, Asset, Submodell-Stand, PCN.
 * Abruffehler beim Nachladen aus dem Repository halten nichts auf, sie werden am Event
 * gespeichert und angezeigt (RC liefert fuer PCN-Submodelle 503, siehe Akte).
 *
 * Saetze und Anzeigenamen entstehen erst beim Lesen (`ansicht.ts`), je Sprache.
 */

import {
  artVon,
  encodeIdentifier,
  istAbkuendigung,
  itemIdVon,
  semanticIdVon,
  submodelNameVon,
  text,
  vergleichen,
  zusammenfassen,
  type Aenderung,
  type CloudEvent,
  type Element,
  type PcnRecord,
  type Submodel,
} from "@datenportal/core";
import { jetzt, type DB } from "./db.ts";
import { AbrufFehler, anhang, datei, json } from "./holen.ts";

type Geladen = { inhalt: Submodel | null; fehler: string | null };

/** Je Lauf ein Puffer, damit ein Nachlesen dasselbe Submodell nicht fuenfzigmal holt. */
export type Lauf = { submodelle: Map<string, Promise<Geladen>>; holen: typeof fetch };

export function neuerLauf(holen: typeof fetch = fetch): Lauf {
  return { submodelle: new Map(), holen };
}

/** Repository-Basis aus `source` (endet auf /shells oder /submodels). */
export function repoBasis(source: string): string {
  return source.replace(/\/+$/, "").replace(/\/(shells|submodels)$/, "");
}

function fehlertext(f: unknown): string {
  return f instanceof AbrufFehler || f instanceof Error ? f.message : String(f);
}

function submodelLaden(lauf: Lauf, repo: string, id: string): Promise<Geladen> {
  const schluessel = `${repo}\n${id}`;
  let p = lauf.submodelle.get(schluessel);
  if (!p) {
    p = json<Submodel>(`${repo}/submodels/${encodeIdentifier(id)}`, lauf.holen).then(
      (inhalt) => ({ inhalt, fehler: null }),
      (f: unknown) => ({ inhalt: null, fehler: fehlertext(f) }),
    );
    lauf.submodelle.set(schluessel, p);
  }
  return p;
}

const BILD = /image|picture|photo|bild|foto|thumbnail/i;
const LOGO = /logo/i;

/** File-Elemente mit Pfad aus idShorts, fuer den Anhang-Abruf. */
function dateien(sm: Submodel): { pfad: string; idShort: string; typ: string }[] {
  const aus: { pfad: string; idShort: string; typ: string }[] = [];
  const lauf = (els: Element[] | undefined, prefix: string) => {
    for (const e of els ?? []) {
      if (!e.idShort) continue;
      const pfad = prefix ? `${prefix}.${e.idShort}` : e.idShort;
      if (e.modelType === "File") aus.push({ pfad, idShort: e.idShort, typ: e.contentType ?? "" });
      if (e.modelType === "SubmodelElementCollection" && Array.isArray(e.value)) lauf(e.value as Element[], pfad);
    }
  };
  lauf(sm.submodelElements, "");
  return aus;
}

function wertVon(sm: Submodel, idShort: string): string | null {
  const e = sm.submodelElements?.find((x) => x.idShort === idShort);
  if (!e) return null;
  return e.modelType === "MultiLanguageProperty" ? text(e.value) : typeof e.value === "string" ? e.value : null;
}

/** Stammdaten und Bilder aus einem frisch geladenen Submodell ins Asset uebernehmen. */
async function assetAnreichern(db: DB, lauf: Lauf, eid: number, item: string, repo: string, smId: string, sm: Submodel) {
  const asset = db
    .prepare("SELECT bild IS NOT NULL AS hatBild, logo IS NOT NULL AS hatLogo FROM assets WHERE endpunkt_id=? AND item_id=?")
    .get(eid, item) as { hatBild: number; hatLogo: number } | undefined;
  if (!asset) return;

  const name = wertVon(sm, "ManufacturerProductDesignation") ?? wertVon(sm, "ManufacturerProductType");
  const hersteller = wertVon(sm, "ManufacturerName");
  const bestell = wertVon(sm, "OrderCodeOfManufacturer") ?? wertVon(sm, "ManufacturerArticleNumber");
  db.prepare(
    "UPDATE assets SET name=COALESCE(name, ?), hersteller=COALESCE(hersteller, ?), bestellnummer=COALESCE(bestellnummer, ?) WHERE endpunkt_id=? AND item_id=?",
  ).run(name, hersteller, bestell, eid, item);

  for (const d of dateien(sm)) {
    const ziel = LOGO.test(d.idShort) ? "logo" : BILD.test(d.idShort) ? "bild" : null;
    if (!ziel || (ziel === "logo" ? asset.hatLogo : asset.hatBild)) continue;
    const anhang = await datei(
      `${repo}/submodels/${encodeIdentifier(smId)}/submodel-elements/${encodeURIComponent(d.pfad)}/attachment`,
      lauf.holen,
    );
    if (!anhang) continue;
    db.prepare(`UPDATE assets SET ${ziel}=?, ${ziel}_typ=?, gespeichert=? WHERE endpunkt_id=? AND item_id=?`).run(anhang.daten, anhang.typ, jetzt(), eid, item);
    if (ziel === "logo") asset.hatLogo = 1;
    else asset.hatBild = 1;
  }
}

async function submodelUebernehmen(
  db: DB,
  lauf: Lauf,
  eid: number,
  item: string,
  repo: string,
  smId: string,
  semanticId: string | null,
  vergleich: boolean,
): Promise<{ aenderungen: Aenderung[] | null; fehler: string | null }> {
  const vorher = db.prepare("SELECT inhalt FROM submodelle WHERE endpunkt_id=? AND submodel_id=?").get(eid, smId) as
    | { inhalt: string | null }
    | undefined;
  const geladen = await submodelLaden(lauf, repo, smId);
  const semId = semanticId ?? geladen.inhalt?.semanticId?.keys?.[0]?.value ?? null;
  const idShort = submodelNameVon(smId) ?? geladen.inhalt?.idShort ?? null;

  db.prepare(
    `INSERT INTO submodelle (endpunkt_id, submodel_id, item_id, semantic_id, id_short, inhalt, abruf_fehler, stand)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpunkt_id, submodel_id) DO UPDATE SET
       inhalt = COALESCE(excluded.inhalt, submodelle.inhalt),
       abruf_fehler = excluded.abruf_fehler,
       semantic_id = COALESCE(excluded.semantic_id, submodelle.semantic_id),
       id_short = COALESCE(excluded.id_short, submodelle.id_short),
       stand = excluded.stand`,
  ).run(eid, smId, item, semId, idShort, geladen.inhalt ? JSON.stringify(geladen.inhalt) : null, geladen.fehler, jetzt());

  if (!geladen.inhalt) return { aenderungen: null, fehler: geladen.fehler };
  db.prepare("UPDATE assets SET gespeichert=? WHERE endpunkt_id=? AND item_id=?").run(jetzt(), eid, item);
  await assetAnreichern(db, lauf, eid, item, repo, smId, geladen.inhalt);

  const alt = vorher?.inhalt ? (JSON.parse(vorher.inhalt) as Submodel) : null;
  return { aenderungen: vergleich && alt ? vergleichen(alt, geladen.inhalt) : null, fehler: null };
}

function registrieren(db: DB, eid: number, item: string, event: CloudEvent): string {
  const aasId = (event.data?.["aasId"] as string | undefined) ?? event.subject;
  db.prepare(
    "UPDATE assets SET aas_id=?, global_asset_id=COALESCE(?, global_asset_id), registriert=COALESCE(registriert, ?) WHERE endpunkt_id=? AND item_id=?",
  ).run(aasId, (event.data?.["globalAssetId"] as string | undefined) ?? null, event.time, eid, item);
  return aasId;
}

type Shell = {
  submodels?: { keys?: { value?: string }[] }[];
  assetInformation?: { defaultThumbnail?: { path?: string } };
};

function submodelIds(shell: Shell): string[] {
  return (shell.submodels ?? []).map((r) => r.keys?.at(-1)?.value).filter((v): v is string => !!v);
}

/** Nur abrufen, was die Shell auch anbietet; ohne `defaultThumbnail` gibt es kein Bild zu holen. */
function nenntThumbnail(shell: Shell): boolean {
  return !!shell.assetInformation?.defaultThumbnail?.path;
}

/** Thumbnail holen und speichern. Gibt null bei Erfolg zurueck, sonst den Grund. */
async function thumbnailLaden(db: DB, lauf: Lauf, eid: number, item: string, repo: string, aasId: string): Promise<string | null> {
  let bild: { daten: Buffer; typ: string };
  try {
    bild = await anhang(`${repo}/shells/${encodeIdentifier(aasId)}/asset-information/thumbnail`, lauf.holen);
  } catch (f) {
    return fehlertext(f);
  }
  if (!bild.typ.startsWith("image/")) return `Kein Bild (${bild.typ})`;
  db.prepare("UPDATE assets SET bild=?, bild_typ=?, gespeichert=? WHERE endpunkt_id=? AND item_id=?").run(bild.daten, bild.typ, jetzt(), eid, item);
  return null;
}

/** Was ein Abruf des ganzen Assets ergeben hat, je Teil mit Grund. `null` heisst: nicht versucht. */
export type AbrufBericht = {
  shell: string | null | undefined;
  bild: string | null | undefined;
  teilmodelle: { id: string; fehler: string | null }[];
};

/**
 * Shell, Thumbnail (wenn die Shell eins nennt) und alle Teilmodelle der Shell laden.
 * `shell` im Bericht ist null bei Erfolg, sonst der Grund; `bild` ist undefined, wenn die
 * Shell kein Thumbnail nennt.
 */
async function shellLaden(db: DB, lauf: Lauf, eid: number, item: string, repo: string, aasId: string): Promise<AbrufBericht> {
  let shell: Shell;
  try {
    shell = await json(`${repo}/shells/${encodeIdentifier(aasId)}`, lauf.holen);
  } catch (f) {
    return { shell: fehlertext(f), bild: undefined, teilmodelle: [] };
  }
  db.prepare("UPDATE assets SET shell=?, gespeichert=? WHERE endpunkt_id=? AND item_id=?").run(JSON.stringify(shell), jetzt(), eid, item);

  const bild = nenntThumbnail(shell) ? await thumbnailLaden(db, lauf, eid, item, repo, aasId) : undefined;

  // Alle Submodelle der Shell einmal laden, damit das Asset-Detail vollstaendig ist.
  const teilmodelle = await Promise.all(
    submodelIds(shell).map(async (id) => ({ id, fehler: (await submodelUebernehmen(db, lauf, eid, item, repo, id, null, false)).fehler })),
  );
  return { shell: null, bild, teilmodelle };
}

export type EventZeile = {
  lfd: number;
  endpunkt_id: number;
  event_id: string;
  typ: string;
  art: string;
  item_id: string;
  zeit: string;
  aenderungen: string | null;
  abruf_fehler: string | null;
  roh: string;
  eingegangen: string;
};

/**
 * Das ganze Asset neu abrufen: Shell, Thumbnail und alle Teilmodelle, oder ohne `aas.created`
 * die Teilmodelle aus den Events. Laeuft nach einem schnellen Nachlesen (`anreichern`) und auf
 * Knopfdruck im Backoffice. Ein gescheiterter Abruf ueberschreibt keinen vorhandenen Inhalt.
 * Gibt null zurueck, wenn das Asset nicht existiert oder keine Repository-Adresse hat.
 */
export async function assetNeuAbrufen(db: DB, lauf: Lauf, eid: number, item: string): Promise<AbrufBericht | null> {
  const a = db.prepare("SELECT aas_id, repo_url FROM assets WHERE endpunkt_id=? AND item_id=?").get(eid, item) as
    | { aas_id: string | null; repo_url: string | null }
    | undefined;
  if (!a?.repo_url) return null;
  if (a.aas_id) return shellLaden(db, lauf, eid, item, a.repo_url, a.aas_id);

  // Ohne aas.created: wenigstens die Submodelle aus den Events laden.
  const zeilen = db.prepare("SELECT DISTINCT roh FROM events WHERE endpunkt_id=? AND item_id=? AND art LIKE 'submodel-%'").all(eid, item) as { roh: string }[];
  const gesehen = new Set<string>();
  const teilmodelle: AbrufBericht["teilmodelle"] = [];
  for (const { roh } of zeilen) {
    const e = JSON.parse(roh) as CloudEvent;
    const id = (e.data?.["submodelId"] as string | undefined) ?? e.subject;
    if (gesehen.has(id)) continue;
    gesehen.add(id);
    teilmodelle.push({ id, fehler: (await submodelUebernehmen(db, lauf, eid, item, a.repo_url, id, semanticIdVon(e), false)).fehler });
  }
  return { shell: undefined, bild: undefined, teilmodelle };
}

export async function anreichern(db: DB, lauf: Lauf, eid: number, item: string): Promise<void> {
  await assetNeuAbrufen(db, lauf, eid, item);
}

/** Ein Teilmodell neu abrufen. Null, wenn es zu diesem Asset kein solches Teilmodell gibt. */
export async function teilmodellNeuAbrufen(db: DB, lauf: Lauf, eid: number, item: string, smId: string): Promise<{ fehler: string | null } | null> {
  const z = db
    .prepare(
      `SELECT s.semantic_id, a.repo_url FROM submodelle s JOIN assets a ON a.endpunkt_id = s.endpunkt_id AND a.item_id = s.item_id
       WHERE s.endpunkt_id=? AND s.item_id=? AND s.submodel_id=?`,
    )
    .get(eid, item, smId) as { semantic_id: string | null; repo_url: string | null } | undefined;
  if (!z?.repo_url) return null;
  const r = await submodelUebernehmen(db, lauf, eid, item, z.repo_url, smId, z.semantic_id, false);
  return { fehler: r.fehler };
}

/**
 * Holt nach, was beim ersten Abruf fehlte: Shell, Thumbnail (wenn die Shell eins nennt) und
 * Teilmodelle ohne Inhalt. Laeuft am Ende jedes Takts, damit jedes Asset am Ende vollstaendig
 * in der App liegt, auch wenn das Repository langsam ist oder zeitweise ausfaellt.
 *
 * Hoechstens `hoechstens` Abrufe je Lauf, damit ein langsamer Server nicht ueberrannt wird;
 * der Rest kommt im naechsten Takt. Gibt die Zahl erfolgreich nachgeholter Teile zurueck.
 */
export async function nachholen(db: DB, lauf: Lauf, eid: number, hoechstens = 20): Promise<number> {
  let rest = hoechstens;
  let geholt = 0;

  const assets = db
    .prepare("SELECT item_id, aas_id, repo_url, shell, bild IS NOT NULL AS hatBild FROM assets WHERE endpunkt_id=? AND repo_url IS NOT NULL")
    .all(eid) as { item_id: string; aas_id: string | null; repo_url: string; shell: string | null; hatBild: number }[];
  for (const a of assets) {
    if (rest <= 0) return geholt;
    if (a.aas_id && !a.shell) {
      rest--;
      if ((await shellLaden(db, lauf, eid, a.item_id, a.repo_url, a.aas_id)).shell === null) geholt++;
    } else if (a.aas_id && a.shell && !a.hatBild && nenntThumbnail(JSON.parse(a.shell) as Shell)) {
      rest--;
      if ((await thumbnailLaden(db, lauf, eid, a.item_id, a.repo_url, a.aas_id)) === null) geholt++;
    }
  }

  // Soll ist die Teilmodell-Liste der gespeicherten Shell, nicht nur, was schon eine Zeile hat:
  // Bricht ein Lauf nach der Shell ab (Neustart, Absturz), gibt es fuer die Teilmodelle noch
  // gar keine Zeile, und sie wuerden sonst nie geholt.
  const fehlend: { item_id: string; submodel_id: string; semantic_id: string | null; repo_url: string }[] = [];
  const vorhanden = db.prepare("SELECT submodel_id, inhalt IS NOT NULL AS geladen, semantic_id FROM submodelle WHERE endpunkt_id=? AND item_id=?");
  for (const a of db.prepare("SELECT item_id, repo_url, shell FROM assets WHERE endpunkt_id=? AND repo_url IS NOT NULL").all(eid) as {
    item_id: string;
    repo_url: string;
    shell: string | null;
  }[]) {
    const stand = new Map(
      (vorhanden.all(eid, a.item_id) as { submodel_id: string; geladen: number; semantic_id: string | null }[]).map((z) => [z.submodel_id, z]),
    );
    const soll = new Set(a.shell ? submodelIds(JSON.parse(a.shell) as Shell) : []);
    for (const id of stand.keys()) soll.add(id);
    for (const id of soll) {
      const z = stand.get(id);
      if (!z?.geladen) fehlend.push({ item_id: a.item_id, submodel_id: id, semantic_id: z?.semantic_id ?? null, repo_url: a.repo_url });
    }
  }
  for (const s of fehlend) {
    if (rest-- <= 0) break;
    const r = await submodelUebernehmen(db, lauf, eid, s.item_id, s.repo_url, s.submodel_id, s.semantic_id, false);
    if (r.fehler === null) geholt++;
  }
  return geholt;
}

/**
 * Uebernimmt ein Event. Gibt die neue Zeile zurueck oder null, wenn es schon bekannt war.
 * `abrufen: false` speichert nur (schnelles Nachlesen); das Laden macht danach `anreichern`.
 */
export async function uebernehmen(db: DB, lauf: Lauf, eid: number, event: CloudEvent, abrufen = true): Promise<EventZeile | null> {
  const bekannt = db.prepare("SELECT 1 FROM events WHERE endpunkt_id=? AND event_id=?").get(eid, event.id);
  if (bekannt) return null;

  const art = artVon(event.type);
  const item = itemIdVon(art === "registriert" ? ((event.data?.["aasId"] as string | undefined) ?? event.subject) : event.subject);
  const repo = repoBasis(event.source);
  db.prepare("INSERT OR IGNORE INTO assets (endpunkt_id, item_id, repo_url) VALUES (?, ?, ?)").run(eid, item, repo);

  let aenderungen: Aenderung[] | null = null;
  let fehler: string | null = null;

  if (art === "registriert") {
    const aasId = registrieren(db, eid, item, event);
    if (abrufen) fehler = (await shellLaden(db, lauf, eid, item, repo, aasId)).shell ?? null;
  } else if (art === "submodel-neu" || art === "submodel-geaendert") {
    // Beim schnellen Nachlesen laedt `anreichern` das Submodell danach.
    const smId = (event.data?.["submodelId"] as string | undefined) ?? event.subject;
    if (abrufen) ({ aenderungen, fehler } = await submodelUebernehmen(db, lauf, eid, item, repo, smId, semanticIdVon(event), art === "submodel-geaendert"));
  } else if (art === "pcn") {
    const record = (event.data?.["record"] ?? {}) as PcnRecord;
    db.prepare("INSERT OR IGNORE INTO pcns (endpunkt_id, item_id, event_id, record, abkuendigung, zeit) VALUES (?, ?, ?, ?, ?, ?)").run(
      eid,
      item,
      event.id,
      JSON.stringify(record),
      istAbkuendigung(record) ? 1 : 0,
      event.time,
    );
    const p = zusammenfassen(record);
    db.prepare(
      "UPDATE assets SET name=COALESCE(name, ?), hersteller=COALESCE(hersteller, ?), bestellnummer=COALESCE(bestellnummer, ?) WHERE endpunkt_id=? AND item_id=?",
    ).run(p.artikel, p.hersteller, p.bestellnummer, eid, item);
  }

  db.prepare("UPDATE assets SET aktualisiert=? WHERE endpunkt_id=? AND item_id=?").run(event.time, eid, item);

  return db
    .prepare(
      `INSERT INTO events (endpunkt_id, event_id, typ, art, item_id, zeit, aenderungen, abruf_fehler, roh, eingegangen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(eid, event.id, event.type, art, item, event.time, aenderungen ? JSON.stringify(aenderungen) : null, fehler, JSON.stringify(event), jetzt()) as EventZeile;
}
