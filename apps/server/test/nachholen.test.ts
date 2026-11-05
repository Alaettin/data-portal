import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { oeffnen } from "../src/db.ts";
import { ADMIN, anmelden, baue, organisationMitNutzer } from "./helfer.ts";

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const REPO = "https://repo.example.invalid";
const AAS = "https://hersteller.example/aas?itemId=4711";
const SM = "https://hersteller.example/sm/Nameplate?itemId=4711";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

/**
 * Ein Asset wie beim P+F-Testserver: Shell nennt ein Thumbnail und ein Teilmodell.
 * Solange `ausfall` gesetzt ist, antworten Teilmodell und Thumbnail mit 503.
 */
function repository() {
  const zustand = { ausfall: true, abrufe: [] as string[] };
  const holen: typeof fetch = async (eingabe) => {
    const url = String(eingabe);
    zustand.abrufe.push(url);
    const json = (wert: unknown, status = 200) =>
      new Response(JSON.stringify(wert), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/events")) {
      const records = new URL(url).searchParams.get("lastEventId")
        ? []
        : [
            {
              id: "e1",
              type: "io.admin-shell.aas.created.v1",
              source: `${REPO}/shells`,
              subject: AAS,
              time: "2026-11-04T10:00:00Z",
              data: { aasId: AAS, globalAssetId: "https://hersteller.example/4711" },
            },
          ];
      return json({ records, cursor: null });
    }
    if (url === `${REPO}/shells/${b64(AAS)}`) {
      return json({
        id: AAS,
        assetInformation: { defaultThumbnail: { path: "/aasx/bild.png", contentType: "image/png" } },
        submodels: [{ keys: [{ type: "Submodel", value: SM }] }],
      });
    }
    if (zustand.ausfall) return json({ title: "nicht verfuegbar" }, 503);
    if (url === `${REPO}/shells/${b64(AAS)}/asset-information/thumbnail`) {
      return new Response(PNG, { headers: { "content-type": "image/png" } });
    }
    if (url === `${REPO}/submodels/${b64(SM)}`) {
      return json({
        id: SM,
        idShort: "Nameplate",
        submodelElements: [
          { idShort: "ManufacturerProductDesignation", modelType: "Property", value: "Testgeraet 4711" },
          { idShort: "Handbuch", modelType: "File", value: "/aasx/handbuch.pdf", contentType: "application/pdf" },
        ],
      });
    }
    if (url === `${REPO}/submodels/${b64(SM)}/submodel-elements/Handbuch/attachment`) {
      return new Response("%PDF-1.7 Handbuch", { headers: { "content-type": "application/pdf" } });
    }
    return json({}, 404);
  };
  return { zustand, holen };
}

let t: Awaited<ReturnType<typeof baue>> | null = null;
afterEach(async () => {
  await t?.app.close();
  t = null;
});

describe("Nachholen", () => {
  it("holt Teilmodell und Thumbnail im naechsten Takt nach und merkt sich den Zeitpunkt", async () => {
    const r = repository();
    t = await baue(r.holen);
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const e = await t.app.inject({
      method: "POST",
      url: `/api/backoffice/${a.orgId}/endpunkte`,
      headers: { cookie: a.cookie },
      payload: { name: "Repo", feedUrl: `${REPO}/api/v3/events`, aktiv: false },
    });
    const eid = (e.json() as { id: number }).id;
    const lesen = () => t!.app.inject({ method: "POST", url: `/api/backoffice/${a.orgId}/endpunkte/${eid}/lesen`, headers: { cookie: a.cookie } });
    const detail = async () =>
      (await t!.app.inject({ url: `/api/assets/${eid}/4711` })).json() as {
        hatBild: boolean;
        gespeichert: string | null;
        name: string | null;
        submodelle: { inhalt: unknown; nichtGeladen: boolean }[];
      };

    await lesen();
    const vorher = await detail();
    expect(vorher.submodelle).toHaveLength(1);
    expect(vorher.submodelle[0]!.inhalt).toBeNull();
    expect(vorher.hatBild).toBe(false);
    const ersterStand = vorher.gespeichert;
    expect(ersterStand).not.toBeNull(); // die Shell selbst kam an

    r.zustand.ausfall = false;
    await new Promise((weiter) => setTimeout(weiter, 5));
    await lesen();
    const nachher = await detail();
    expect(nachher.submodelle[0]!.inhalt).not.toBeNull();
    expect(nachher.hatBild).toBe(true);
    expect(nachher.name).toBe("Testgeraet 4711");
    expect(nachher.gespeichert! > ersterStand!).toBe(true);
  });
});

describe("Datei durchreichen", () => {
  it("reicht nur Dateien durch, die im gespeicherten Teilmodell stehen", async () => {
    const r = repository();
    r.zustand.ausfall = false;
    t = await baue(r.holen);
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const e = await t.app.inject({
      method: "POST",
      url: `/api/backoffice/${a.orgId}/endpunkte`,
      headers: { cookie: a.cookie },
      payload: { name: "Repo", feedUrl: `${REPO}/api/v3/events`, aktiv: false },
    });
    const eid = (e.json() as { id: number }).id;
    await t.app.inject({ method: "POST", url: `/api/backoffice/${a.orgId}/endpunkte/${eid}/lesen`, headers: { cookie: a.cookie } });

    const url = (pfad: string) => `/api/assets/${eid}/4711/datei?sm=${encodeURIComponent(SM)}&pfad=${encodeURIComponent(pfad)}`;
    const gut = await t.app.inject({ url: url("Handbuch") });
    expect(gut.statusCode).toBe(200);
    expect(gut.headers["content-type"]).toBe("application/pdf");
    expect(gut.body).toBe("%PDF-1.7 Handbuch");

    // Ein Pfad, der kein File ist oder nicht existiert, geht nie zum Hersteller.
    const vorher = r.zustand.abrufe.length;
    expect((await t.app.inject({ url: url("ManufacturerProductDesignation") })).statusCode).toBe(404);
    expect((await t.app.inject({ url: url("../../etc/passwd") })).statusCode).toBe(404);
    expect(r.zustand.abrufe.length).toBe(vorher);
  });
});

describe("Nachholen nach Abbruch", () => {
  it("holt Teilmodelle, die nach einem abgebrochenen Lauf noch gar keine Zeile haben", async () => {
    const r = repository();
    t = await baue(r.holen);
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const e = await t.app.inject({
      method: "POST",
      url: `/api/backoffice/${a.orgId}/endpunkte`,
      headers: { cookie: a.cookie },
      payload: { name: "Repo", feedUrl: `${REPO}/api/v3/events`, aktiv: false },
    });
    const eid = (e.json() as { id: number }).id;
    const lesen = () => t!.app.inject({ method: "POST", url: `/api/backoffice/${a.orgId}/endpunkte/${eid}/lesen`, headers: { cookie: a.cookie } });

    await lesen();
    // Wie ein Neustart nach der Shell und vor den Teilmodellen: keine Zeile fuer das Teilmodell.
    t.db.prepare("DELETE FROM submodelle").run();
    r.zustand.ausfall = false;
    await lesen();

    const d = (await t.app.inject({ url: `/api/assets/${eid}/4711` })).json() as { submodelle: { inhalt: unknown }[] };
    expect(d.submodelle).toHaveLength(1);
    expect(d.submodelle[0]!.inhalt).not.toBeNull();
  });
});

describe("Neu abrufen im Backoffice", () => {
  it("berichtet je Teil mit Grund und ueberschreibt bei einem Ausfall nichts", async () => {
    const r = repository();
    t = await baue(r.holen);
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const b = await organisationMitNutzer(t.app, admin, "Beta", "b@example.invalid");
    const e = await t.app.inject({
      method: "POST",
      url: `/api/backoffice/${a.orgId}/endpunkte`,
      headers: { cookie: a.cookie },
      payload: { name: "Repo", feedUrl: `${REPO}/api/v3/events`, aktiv: false },
    });
    const eid = (e.json() as { id: number }).id;
    await t.app.inject({ method: "POST", url: `/api/backoffice/${a.orgId}/endpunkte/${eid}/lesen`, headers: { cookie: a.cookie } });

    type Bericht = { shell: string | null; bild: string | null; teilmodelle: { id: string; name: string; fehler: string | null }[] };
    const asset = (cookie: string, org: number) =>
      t!.app.inject({ method: "POST", url: `/api/backoffice/${org}/assets/${eid}/4711/abrufen`, headers: { cookie } });
    const teilmodell = (cookie: string) =>
      t!.app.inject({
        method: "POST",
        url: `/api/backoffice/${a.orgId}/assets/${eid}/4711/teilmodelle/abrufen?sm=${encodeURIComponent(SM)}`,
        headers: { cookie },
      });
    const inhalt = async () =>
      ((await t!.app.inject({ url: `/api/assets/${eid}/4711` })).json() as { submodelle: { inhalt: unknown }[] }).submodelle[0]!.inhalt;

    // Repository faellt aus: Shell kommt, Bild und Teilmodell nicht, jeweils mit Grund.
    const kaputt = (await asset(a.cookie, a.orgId)).json() as Bericht;
    expect(kaputt.shell).toBeNull();
    expect(kaputt.bild).toMatch(/503/);
    expect(kaputt.teilmodelle).toHaveLength(1);
    expect(kaputt.teilmodelle[0]!.fehler).toMatch(/503/);
    expect(kaputt.teilmodelle[0]!.name.length).toBeGreaterThan(0);

    r.zustand.ausfall = false;
    const gut = (await asset(a.cookie, a.orgId)).json() as Bericht;
    expect(gut).toMatchObject({ shell: null, bild: null, teilmodelle: [{ id: SM, fehler: null }] });
    expect(await inhalt()).not.toBeNull();

    // Ein erneuter Ausfall meldet den Grund, laesst aber den gespeicherten Inhalt stehen.
    r.zustand.ausfall = true;
    const einzeln = await teilmodell(a.cookie);
    expect(einzeln.statusCode).toBe(200);
    expect((einzeln.json() as { fehler: string | null }).fehler).toMatch(/503/);
    expect(await inhalt()).not.toBeNull();

    // Eine fremde Organisation kommt nicht an das Asset.
    expect((await asset(b.cookie, b.orgId)).statusCode).toBe(404);
    expect((await asset(b.cookie, a.orgId)).statusCode).toBe(404);
  });
});

describe("Datenbank-Fassung 4", () => {
  it("behaelt den Bestand einer Fassung-3-DB und laesst vorhandene Organisationen oeffentlich", () => {
    const ordner = mkdtempSync(join(tmpdir(), "adp-"));
    try {
      const datei = join(ordner, "portal.db");
      const v3 = oeffnen(datei);
      v3.exec("ALTER TABLE organisationen DROP COLUMN oeffentlich");
      v3.pragma("user_version = 3");
      v3.prepare("INSERT INTO organisationen (slug, name, angelegt) VALUES ('pf', 'Pepperl+Fuchs', 'x')").run();
      v3.prepare("INSERT INTO endpunkte (organisation_id, name, feed_url, angelegt) VALUES (1, 'E', 'https://x', 'x')").run();
      v3.prepare("INSERT INTO assets (endpunkt_id, item_id, gespeichert) VALUES (1, '181363', 'z')").run();
      v3.close();

      const db = oeffnen(datei);
      expect(db.pragma("user_version", { simple: true })).toBe(4);
      expect((db.prepare("SELECT oeffentlich FROM organisationen WHERE slug='pf'").get() as { oeffentlich: number }).oeffentlich).toBe(1);
      expect((db.prepare("SELECT COUNT(*) AS n FROM assets").get() as { n: number }).n).toBe(1);
      // Neu angelegte Organisationen sind privat.
      db.prepare("INSERT INTO organisationen (slug, name, angelegt) VALUES ('neu', 'Neu', 'x')").run();
      expect((db.prepare("SELECT oeffentlich FROM organisationen WHERE slug='neu'").get() as { oeffentlich: number }).oeffentlich).toBe(0);
      db.close();
      // Ein zweites Oeffnen setzt nichts zurueck.
      const wieder = oeffnen(datei);
      expect((wieder.prepare("SELECT oeffentlich FROM organisationen WHERE slug='neu'").get() as { oeffentlich: number }).oeffentlich).toBe(0);
      wieder.close();
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe("Datenbank-Fassungen", () => {
  it("behaelt den Bestand einer Fassung-2-DB und ergaenzt die Spalte gespeichert", () => {
    const ordner = mkdtempSync(join(tmpdir(), "adp-"));
    try {
      const datei = join(ordner, "portal.db");
      // Eine Fassung-2-DB mit Daten, wie sie am 04.11.2026 beim Nutzer lag.
      const v2 = oeffnen(datei);
      v2.exec("ALTER TABLE assets DROP COLUMN gespeichert");
      v2.pragma("user_version = 2");
      v2.prepare("INSERT INTO organisationen (slug, name, angelegt) VALUES ('p', 'P', 'x')").run();
      v2.prepare("INSERT INTO endpunkte (organisation_id, name, feed_url, angelegt) VALUES (1, 'E', 'https://x', 'x')").run();
      v2.prepare("INSERT INTO assets (endpunkt_id, item_id) VALUES (1, '181363')").run();
      v2.prepare("INSERT INTO events (endpunkt_id, event_id, typ, art, item_id, zeit, roh, eingegangen) VALUES (1, 'e', 't', 'registriert', '181363', 'z', '{}', 'z')").run();
      v2.close();

      const db = oeffnen(datei);
      expect(db.pragma("user_version", { simple: true })).toBe(4);
      expect((db.prepare("SELECT COUNT(*) AS n FROM assets").get() as { n: number }).n).toBe(1);
      expect((db.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n).toBe(1);
      const spalten = (db.prepare("PRAGMA table_info(assets)").all() as { name: string }[]).map((s) => s.name);
      expect(spalten).toContain("gespeichert");
      db.close();
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});
