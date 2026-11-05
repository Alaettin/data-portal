import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { oeffnen } from "../src/db.ts";
import { ADMIN, anmelden, baue, organisationMitNutzer } from "./helfer.ts";

let t: Awaited<ReturnType<typeof baue>>;
beforeEach(async () => {
  t = await baue();
});
afterEach(async () => {
  await t.app.close();
});

const FEED = "https://feed.example.invalid/api/v3/events";

/** Endpunkt abgeschaltet anlegen und einmal von Hand lesen, damit der Test auf das Ende warten kann. */
async function endpunktMitFeed(orgId: number, cookie: string) {
  const e = await t.app.inject({
    method: "POST",
    url: `/api/backoffice/${orgId}/endpunkte`,
    headers: { cookie },
    payload: { name: "RC", feedUrl: FEED, intervallS: 60, aktiv: false },
  });
  expect(e.statusCode).toBe(201);
  const id = (e.json() as { id: number }).id;
  const r = await t.app.inject({ method: "POST", url: `/api/backoffice/${orgId}/endpunkte/${id}/lesen`, headers: { cookie } });
  expect((r.json() as { neu: number }).neu).toBe(50);
  return id;
}

describe("Anmeldung", () => {
  it("lehnt falsche Daten mit einem Text fuer alle Faelle ab", async () => {
    const falsch = await t.app.inject({ method: "POST", url: "/api/auth/anmelden", payload: { email: ADMIN.email, passwort: "falsch-falsch-falsch" } });
    const unbekannt = await t.app.inject({ method: "POST", url: "/api/auth/anmelden", payload: { email: "nie@example.invalid", passwort: "x" } });
    expect(falsch.statusCode).toBe(401);
    expect(falsch.json()).toEqual(unbekannt.json());
  });

  it("setzt ein httpOnly-Cookie mit SameSite=Lax, ueber http ohne Secure", async () => {
    const r = await t.app.inject({ method: "POST", url: "/api/auth/anmelden", payload: ADMIN });
    const c = r.cookies.find((x) => x.name === "adp_sitzung")!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
    expect(c.secure).toBeFalsy();
    // Hinter einem https-Proxy dagegen mit Secure.
    const hinterProxy = await t.app.inject({
      method: "POST",
      url: "/api/auth/anmelden",
      headers: { "x-forwarded-proto": "https" },
      payload: ADMIN,
    });
    expect(hinterProxy.cookies.find((x) => x.name === "adp_sitzung")!.secure).toBe(true);
  });

  it("kennt den Nutzer bis zum Abmelden", async () => {
    const cookie = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const ich = await t.app.inject({ url: "/api/auth/ich", headers: { cookie } });
    expect((ich.json() as { nutzer: { rolle: string } }).nutzer.rolle).toBe("admin");
    await t.app.inject({ method: "POST", url: "/api/auth/abmelden", headers: { cookie } });
    const danach = await t.app.inject({ url: "/api/auth/ich", headers: { cookie } });
    expect(danach.statusCode).toBe(200);
    expect((danach.json() as { nutzer: unknown }).nutzer).toBeNull();
  });

  it("wirft einen gesperrten Nutzer sofort hinaus", async () => {
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    expect((await t.app.inject({ url: `/api/backoffice/${a.orgId}`, headers: { cookie: a.cookie } })).statusCode).toBe(200);
    await t.app.inject({ method: "PATCH", url: `/api/admin/nutzer/${a.nutzerId}`, headers: { cookie: admin }, payload: { aktiv: false } });
    expect((await t.app.inject({ url: `/api/backoffice/${a.orgId}`, headers: { cookie: a.cookie } })).statusCode).toBe(401);
  });

  it("aendert das eigene Passwort nur mit dem alten", async () => {
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const falsch = await t.app.inject({ method: "POST", url: "/api/auth/passwort", headers: { cookie: a.cookie }, payload: { alt: "nein", neu: "ein-neues-passwort" } });
    expect(falsch.json()).toEqual({ fehler: "passwort-alt-falsch" });
    const kurz = await t.app.inject({ method: "POST", url: "/api/auth/passwort", headers: { cookie: a.cookie }, payload: { alt: a.startpasswort, neu: "kurz" } });
    expect(kurz.json()).toEqual({ fehler: "passwort-zu-kurz" });
    const ok = await t.app.inject({ method: "POST", url: "/api/auth/passwort", headers: { cookie: a.cookie }, payload: { alt: a.startpasswort, neu: "ein-neues-passwort" } });
    expect(ok.statusCode).toBe(200);
    await anmelden(t.app, "a@example.invalid", "ein-neues-passwort");
  });
});

describe("Rechte", () => {
  it("sperrt die Verwaltung fuer Besucher (401) und Organisationen (404)", async () => {
    expect((await t.app.inject({ url: "/api/admin/organisationen" })).statusCode).toBe(401);
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    expect((await t.app.inject({ url: "/api/admin/organisationen", headers: { cookie: a.cookie } })).statusCode).toBe(404);
    expect((await t.app.inject({ url: "/api/admin/organisationen", headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it("trennt die Organisationen im Backoffice", async () => {
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const b = await organisationMitNutzer(t.app, admin, "Beta", "b@example.invalid");
    const eB = await t.app.inject({
      method: "POST",
      url: `/api/backoffice/${b.orgId}/endpunkte`,
      headers: { cookie: b.cookie },
      payload: { name: "B-Feed", feedUrl: FEED, aktiv: false },
    });
    const idB = (eB.json() as { id: number }).id;

    // A sieht B nicht, weder direkt noch ueber den eigenen Pfad mit B's Endpunkt.
    expect((await t.app.inject({ url: `/api/backoffice/${b.orgId}`, headers: { cookie: a.cookie } })).statusCode).toBe(404);
    const quer = await t.app.inject({ method: "DELETE", url: `/api/backoffice/${a.orgId}/endpunkte/${idB}`, headers: { cookie: a.cookie } });
    expect(quer.statusCode).toBe(404);
    // Gegenprobe: B selbst darf, und der Admin darf beide oeffnen.
    expect((await t.app.inject({ url: `/api/backoffice/${b.orgId}`, headers: { cookie: b.cookie } })).statusCode).toBe(200);
    expect((await t.app.inject({ url: `/api/backoffice/${a.orgId}`, headers: { cookie: admin } })).statusCode).toBe(200);
  });

  it("verraet Besuchern keine Feed-Adressen", async () => {
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    await endpunktMitFeed(a.orgId, a.cookie);
    for (const url of ["/api/uebersicht", "/api/organisationen", "/api/organisationen/alpha", "/api/assets"]) {
      const r = await t.app.inject({ url });
      expect(r.statusCode, url).toBe(200);
      expect(r.body, url).not.toContain("feed.example.invalid");
    }
  });
});

describe("Assets", () => {
  async function gefuellt() {
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    await endpunktMitFeed(a.orgId, a.cookie);
    return a;
  }

  type Liste = { eintraege: { itemId: string; name: string | null; anzahlPcns: number; organisation: string }[]; gesamt: number };
  const liste = async (q: string) => (await t.app.inject({ url: `/api/assets?${q}` })).json() as Liste;

  it("zeigt alle Assets des Feeds mit Organisation", async () => {
    await gefuellt();
    const alle = await liste("proSeite=100");
    expect(alle.gesamt).toBeGreaterThan(0);
    expect(alle.eintraege).toHaveLength(alle.gesamt);
    expect(new Set(alle.eintraege.map((e) => e.organisation))).toEqual(new Set(["Alpha"]));
  });

  it("filtert nach Status und blaettert", async () => {
    await gefuellt();
    const alle = await liste("proSeite=100");
    const mit = await liste("status=pcn&proSeite=100");
    const ab = (await t.app.inject({ url: "/api/assets?status=abkuendigung&proSeite=100" })).json() as { eintraege: { abgekuendigt: boolean }[]; gesamt: number };
    expect(mit.gesamt).toBeGreaterThan(0);
    expect(mit.eintraege.every((e) => e.anzahlPcns > 0)).toBe(true);
    expect(ab.eintraege.every((e) => e.abgekuendigt)).toBe(true);
    expect(ab.gesamt).toBeLessThanOrEqual(mit.gesamt);
    expect(mit.gesamt).toBeLessThanOrEqual(alle.gesamt);
    const seite1 = await liste("proSeite=5&sort=name&richtung=auf");
    const seite2 = await liste("proSeite=5&sort=name&richtung=auf&seite=2");
    expect(seite1.eintraege).toHaveLength(Math.min(5, alle.gesamt));
    expect(seite2.eintraege.map((e) => e.itemId)).not.toContain(seite1.eintraege[0]!.itemId);
  });

  it("sortiert nach Name auf- und absteigend", async () => {
    await gefuellt();
    const auf = (await liste("sort=name&richtung=auf&proSeite=100")).eintraege.map((e) => e.name ?? e.itemId);
    const ab = (await liste("sort=name&richtung=ab&proSeite=100")).eintraege.map((e) => e.name ?? e.itemId);
    expect(auf).toEqual([...auf].sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase(), "en")));
    expect(ab).toEqual([...auf].reverse());
  });

  it("liefert neu Registrierte und Ereignisse in beiden Sprachen", async () => {
    const a = await gefuellt();
    const neu = (await t.app.inject({ url: "/api/assets/neu?limit=3" })).json() as unknown[];
    expect(neu.length).toBeGreaterThan(0);
    const url = `/api/backoffice/${a.orgId}/ereignisse?objekt=aas&aktion=created&limit=1`;
    const de = (await t.app.inject({ url, headers: { cookie: a.cookie } })).json() as { titel: string }[];
    const en = (await t.app.inject({ url: `${url}&sprache=en`, headers: { cookie: a.cookie } })).json() as { titel: string }[];
    expect(de[0]!.titel).toMatch(/^Alpha hat .+ registriert$/);
    expect(en[0]!.titel).toMatch(/^Alpha registered .+$/);
  });
});

describe("Datenbank", () => {
  it("verwirft den Bestand der alten Fassung mit Lieferanten", () => {
    const ordner = mkdtempSync(join(tmpdir(), "adp-"));
    try {
      const datei = join(ordner, "portal.db");
      const alt = new Database(datei);
      alt.exec("CREATE TABLE lieferanten (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO lieferanten (name) VALUES ('LAPP');");
      alt.close();
      const db = oeffnen(datei);
      const tabellen = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((x) => x.name);
      expect(tabellen).not.toContain("lieferanten");
      expect(tabellen).toContain("organisationen");
      db.close();
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});
