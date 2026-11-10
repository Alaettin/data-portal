import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { oeffnen } from "../src/db.ts";
import { ADMIN, anmelden, baue, organisationMitNutzer } from "./helfer.ts";

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const REPO = "https://repo.example.invalid";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const aasId = (item: string) => `https://hersteller.example/aas?itemId=${item}`;
const smId = (item: string) => `https://hersteller.example/sm/Nameplate?itemId=${item}`;

type Ev = { id: string; type: string; source: string; subject: string; time: string; data: Record<string, unknown> };

/** Drei Events je Asset: registriert, Teilmodell neu, Aenderungsmitteilung. */
function eventsFuer(item: string, n: number): Ev[] {
  const zeit = `2026-11-0${n}T10:00:00Z`;
  return [
    { id: `${item}-a`, type: "io.admin-shell.aas.created.v1", source: `${REPO}/shells`, subject: aasId(item), time: zeit, data: { aasId: aasId(item) } },
    { id: `${item}-s`, type: "io.admin-shell.submodel.created.v1", source: `${REPO}/submodels`, subject: smId(item), time: zeit, data: { submodelId: smId(item) } },
    { id: `${item}-p`, type: "io.admin-shell.pcn.v1", source: `${REPO}/submodels`, subject: smId(item), time: zeit, data: { record: { PcnType: "PCN" } } },
  ];
}

/**
 * Feed und Repository fuer die Assets A1 und A2. `schranke` haelt den naechsten
 * Teilmodell-Abruf an, bis sie geoeffnet wird: so laesst sich mitten im Abruf loeschen.
 */
function hersteller() {
  const zustand = {
    events: [...eventsFuer("A1", 1), ...eventsFuer("A2", 2)],
    schranke: null as null | { erreicht: () => void; offen: Promise<void> },
  };
  const json = (wert: unknown, status = 200) => new Response(JSON.stringify(wert), { status, headers: { "content-type": "application/json" } });
  const holen: typeof fetch = async (eingabe) => {
    const url = new URL(String(eingabe));
    if (url.pathname.endsWith("/events")) {
      const nach = url.searchParams.get("lastEventId");
      const ab = nach ? zustand.events.findIndex((e) => e.id === nach) + 1 : 0;
      return json({ records: zustand.events.slice(ab), cursor: null });
    }
    for (const item of ["A1", "A2"]) {
      if (url.href === `${REPO}/shells/${b64(aasId(item))}`) {
        return json({
          id: aasId(item),
          assetInformation: { defaultThumbnail: { path: "/bild.png" } },
          submodels: [{ keys: [{ type: "Submodel", value: smId(item) }] }],
        });
      }
      if (url.href === `${REPO}/shells/${b64(aasId(item))}/asset-information/thumbnail`) {
        return new Response(PNG, { headers: { "content-type": "image/png" } });
      }
      if (url.href === `${REPO}/submodels/${b64(smId(item))}`) {
        const s = zustand.schranke;
        if (s) {
          zustand.schranke = null;
          s.erreicht();
          await s.offen;
        }
        return json({ id: smId(item), idShort: "Nameplate", submodelElements: [{ idShort: "ManufacturerProductDesignation", modelType: "Property", value: `Geraet ${item}` }] });
      }
    }
    return json({}, 404);
  };
  return { zustand, holen };
}

const TABELLEN = ["assets", "events", "submodelle", "pcns", "verborgen"] as const;

let t: Awaited<ReturnType<typeof baue>> | null = null;
afterEach(async () => {
  await t?.app.close();
  t = null;
});

async function aufbau() {
  const h = hersteller();
  t = await baue(h.holen);
  const app = t.app;
  const admin = await anmelden(app, ADMIN.email, ADMIN.passwort);
  const a = await organisationMitNutzer(app, admin, "Alpha", "a@example.invalid");
  const e = await app.inject({
    method: "POST",
    url: `/api/backoffice/${a.orgId}/endpunkte`,
    headers: { cookie: a.cookie },
    payload: { name: "E", feedUrl: `${REPO}/api/v3/events`, aktiv: false },
  });
  const eid = (e.json() as { id: number }).id;
  const lesen = () => app.inject({ method: "POST", url: `/api/backoffice/${a.orgId}/endpunkte/${eid}/lesen`, headers: { cookie: a.cookie } });
  await lesen();
  const db = t.db;
  /** Zeilen je Tabelle, fuer einen Endpunkt und wahlweise ein Item. */
  const zeilen = (endpunkt: number, item?: string) =>
    Object.fromEntries(
      TABELLEN.map((tab) => [
        tab,
        (
          (item === undefined
            ? db.prepare(`SELECT COUNT(*) AS n FROM ${tab} WHERE endpunkt_id=?`).get(endpunkt)
            : db.prepare(`SELECT COUNT(*) AS n FROM ${tab} WHERE endpunkt_id=? AND item_id=?`).get(endpunkt, item)) as { n: number }
        ).n,
      ]),
    ) as Record<(typeof TABELLEN)[number], number>;
  const loeschen = (url: string, cookie = admin) => app.inject({ method: "DELETE", url, headers: { cookie } });
  return { h, app, db, admin, a, eid, lesen, zeilen, loeschen };
}

const LEER = { assets: 0, events: 0, submodelle: 0, pcns: 0, verborgen: 0 };

describe("Loeschen durch den Admin", () => {
  it("entfernt ein Asset mit allem, was daran haengt, und laesst das andere unberuehrt", async () => {
    const x = await aufbau();
    // Ausgeblendet, damit auch diese Zeile mit verschwinden muss.
    await x.app.inject({ method: "PATCH", url: `/api/backoffice/${x.a.orgId}/assets/${x.eid}/A1`, headers: { cookie: x.a.cookie }, payload: { oeffentlich: false } });
    expect(x.zeilen(x.eid, "A1")).toEqual({ assets: 1, events: 3, submodelle: 1, pcns: 1, verborgen: 1 });
    const vorherA2 = x.zeilen(x.eid, "A2");
    expect(vorherA2).toEqual({ assets: 1, events: 3, submodelle: 1, pcns: 1, verborgen: 0 });

    const r = await x.loeschen(`/api/admin/assets/${x.eid}/A1`);
    expect(r.statusCode).toBe(200);
    expect(x.zeilen(x.eid, "A1")).toEqual(LEER);
    expect(x.zeilen(x.eid, "A2")).toEqual(vorherA2);
    expect((await x.app.inject({ url: `/api/assets/${x.eid}/A1`, headers: { cookie: x.admin } })).statusCode).toBe(404);
    expect((await x.loeschen(`/api/admin/assets/${x.eid}/A1`)).statusCode).toBe(404);
  });

  it("entfernt alle Assets der Organisation, behaelt Endpunkt und Lese-Position", async () => {
    const x = await aufbau();
    const position = (x.db.prepare("SELECT letzte_event_id AS p FROM endpunkte WHERE id=?").get(x.eid) as { p: string }).p;
    expect(position).toBe("A2-p");

    const r = await x.loeschen(`/api/admin/organisationen/${x.a.orgId}/assets`);
    expect(r.json()).toEqual({ geloescht: 2 });
    expect(x.zeilen(x.eid)).toEqual(LEER);
    expect((x.db.prepare("SELECT letzte_event_id AS p FROM endpunkte WHERE id=?").get(x.eid) as { p: string }).p).toBe(position);

    // Alte Events holen nichts zurueck.
    await x.lesen();
    expect(x.zeilen(x.eid)).toEqual(LEER);

    // Ein neues Event des Herstellers legt das Asset wieder an (Nutzerentscheidung 10.11.2026).
    x.h.zustand.events.push({ ...eventsFuer("A1", 3)[1]!, id: "A1-s2", type: "io.admin-shell.submodel.updated.v1" });
    await x.lesen();
    expect(x.zeilen(x.eid, "A1")).toMatchObject({ assets: 1, events: 1, submodelle: 1 });
  });

  it("entfernt beim Loeschen der Organisation jede Zeile ihrer Endpunkte", async () => {
    const x = await aufbau();
    const r = await x.loeschen(`/api/admin/organisationen/${x.a.orgId}`);
    expect(r.statusCode).toBe(200);
    expect(x.zeilen(x.eid)).toEqual(LEER);
    expect((x.db.prepare("SELECT COUNT(*) AS n FROM endpunkte WHERE id=?").get(x.eid) as { n: number }).n).toBe(0);
    expect((x.db.prepare("SELECT COUNT(*) AS n FROM nutzer WHERE organisation_id=?").get(x.a.orgId) as { n: number }).n).toBe(0);
  });

  it("ist nur Admins erlaubt; die alte Backoffice-Route gibt es nicht mehr", async () => {
    const x = await aufbau();
    const vorher = x.zeilen(x.eid);
    expect((await x.loeschen(`/api/admin/assets/${x.eid}/A1`, x.a.cookie)).statusCode).toBe(404);
    expect((await x.loeschen(`/api/admin/organisationen/${x.a.orgId}/assets`, x.a.cookie)).statusCode).toBe(404);
    expect((await x.loeschen(`/api/backoffice/${x.a.orgId}/assets/${x.eid}/A1`, x.a.cookie)).statusCode).toBe(404);
    expect((await x.loeschen(`/api/backoffice/${x.a.orgId}/assets/${x.eid}/A1`, x.admin)).statusCode).toBe(404);
    expect((await x.app.inject({ method: "DELETE", url: `/api/admin/assets/${x.eid}/A1` })).statusCode).toBe(401);
    expect(x.zeilen(x.eid)).toEqual(vorher);
  });

  it("laesst den Inhalt auch nicht in freien Seiten der Datei zurueck", async () => {
    const ordner = mkdtempSync(join(tmpdir(), "adp-"));
    const datei = join(ordner, "portal.db");
    const MARKE = "GEHEIMER-INHALT-4711";
    try {
      // Bestand wie vor dem 10.11.2026: ohne secure_delete geschrieben und mehrfach
      // ueberschrieben, damit alte Kopien im freien Bereich der Seiten liegen.
      const alt = oeffnen(datei);
      alt.pragma("secure_delete = OFF");
      alt.prepare("INSERT INTO organisationen (slug, name, oeffentlich, angelegt) VALUES ('alt', 'Alt', 1, 'x')").run();
      alt.prepare("INSERT INTO endpunkte (organisation_id, name, feed_url, aktiv, angelegt) VALUES (1, 'E', 'https://x.invalid', 0, 'x')").run();
      for (let i = 0; i < 40; i++) {
        const item = `I${i}`;
        alt.prepare("INSERT INTO assets (endpunkt_id, item_id, name) VALUES (1, ?, ?)").run(item, `${MARKE} ${item}`);
        alt.prepare("INSERT INTO submodelle (endpunkt_id, submodel_id, item_id, inhalt, stand) VALUES (1, ?, ?, ?, 'z')").run(`sm${i}`, item, `${MARKE} `.repeat(600));
        alt.prepare("UPDATE submodelle SET inhalt = ? WHERE submodel_id = ?").run(`neu ${MARKE} `.repeat(600), `sm${i}`);
      }
      alt.close();

      t = await baue(undefined, datei);
      const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
      expect((await t.app.inject({ method: "DELETE", url: "/api/admin/organisationen/1/assets", headers: { cookie: admin } })).json()).toEqual({ geloescht: 40 });
      await t.app.close();
      t.db.close();
      t = null;

      const roh = Buffer.concat([readFileSync(datei), existsSync(`${datei}-wal`) ? readFileSync(`${datei}-wal`) : Buffer.alloc(0)]);
      expect(roh.includes(MARKE)).toBe(false);
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  it("hinterlaesst keine verwaisten Zeilen, wenn waehrend eines Abrufs geloescht wird", async () => {
    const x = await aufbau();
    // Neues Teilmodell-Event fuer A1; dessen Abruf haelt an der Schranke.
    let erreicht!: () => void;
    let oeffnen!: () => void;
    const angekommen = new Promise<void>((r) => (erreicht = r));
    x.h.zustand.schranke = { erreicht, offen: new Promise<void>((r) => (oeffnen = r)) };
    x.h.zustand.events.push({ ...eventsFuer("A1", 3)[1]!, id: "A1-s2", type: "io.admin-shell.submodel.updated.v1" });

    const lauf = x.lesen();
    await angekommen;
    // Der Takt steht jetzt mitten in submodelUebernehmen fuer A1.
    expect((await x.loeschen(`/api/admin/assets/${x.eid}/A1`)).statusCode).toBe(200);
    oeffnen();
    await lauf;

    expect(x.zeilen(x.eid, "A1")).toEqual(LEER);
    expect(x.zeilen(x.eid, "A2")).toMatchObject({ assets: 1, events: 3, submodelle: 1, pcns: 1 });
  });
});
