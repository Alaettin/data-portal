import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN, anmelden, baue, organisationMitNutzer } from "./helfer.ts";

let t: Awaited<ReturnType<typeof baue>>;
beforeEach(async () => {
  t = await baue();
});
afterEach(async () => {
  vi.useRealTimers();
  await t.app.close();
});

const FEED = "https://feed.example.invalid/api/v3/events";

async function mitFeed(oeffentlich: boolean) {
  const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
  const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid", oeffentlich);
  const e = await t.app.inject({
    method: "POST",
    url: `/api/backoffice/${a.orgId}/endpunkte`,
    headers: { cookie: a.cookie },
    payload: { name: "RC", feedUrl: FEED, aktiv: false },
  });
  const eid = (e.json() as { id: number }).id;
  await t.app.inject({ method: "POST", url: `/api/backoffice/${a.orgId}/endpunkte/${eid}/lesen`, headers: { cookie: a.cookie } });
  return { ...a, admin, eid };
}

type Liste = { eintraege: { itemId: string; endpunktId: number; registriert: string | null }[]; gesamt: number };

describe("Sichtbarkeit", () => {
  it("zeigt eine private Organisation Besuchern nirgends, ihren Mitgliedern und dem Admin schon", async () => {
    const a = await mitFeed(false);
    const holen = (url: string, cookie?: string) => t.app.inject({ url, headers: cookie ? { cookie } : {} });

    // Besucher: Sammelansichten leer, Einzelansichten 404.
    expect(((await holen("/api/assets")).json() as Liste).gesamt).toBe(0);
    expect(((await holen("/api/uebersicht")).json() as { assets: number; organisationen: number })).toMatchObject({ assets: 0, organisationen: 0 });
    expect((await holen("/api/organisationen")).json()).toEqual([]);
    expect((await holen("/api/organisationen/alpha")).statusCode).toBe(404);
    expect(((await holen(`/api/assets?organisation=${a.orgId}`)).json() as Liste).gesamt).toBe(0);

    // Mitglied und Admin sehen die eigene Seite und die Assets.
    const eigene = (await holen(`/api/assets?organisation=${a.orgId}&proSeite=100`, a.cookie)).json() as Liste;
    expect(eigene.gesamt).toBeGreaterThan(0);
    const erstes = eigene.eintraege[0]!;
    const detail = `/api/assets/${erstes.endpunktId}/${encodeURIComponent(erstes.itemId)}`;
    expect((await holen(detail)).statusCode).toBe(404);
    expect((await holen(detail, a.cookie)).statusCode).toBe(200);
    expect((await holen(detail, a.admin)).statusCode).toBe(200);
    expect((await holen("/api/organisationen/alpha", a.cookie)).statusCode).toBe(200);

    // Ein Mitglied einer anderen Organisation sieht sie nicht.
    const b = await organisationMitNutzer(t.app, a.admin, "Beta", "b@example.invalid");
    expect((await holen(detail, b.cookie)).statusCode).toBe(404);

    // Freischalten im Profil macht sie oeffentlich.
    await t.app.inject({ method: "PATCH", url: `/api/backoffice/${a.orgId}/profil`, headers: { cookie: a.cookie }, payload: { oeffentlich: true } });
    expect((await holen(detail)).statusCode).toBe(200);
    expect(((await holen("/api/assets")).json() as Liste).gesamt).toBe(eigene.gesamt);
  });
});

describe("Abfragetakt", () => {
  it("nimmt jeden Wert zwischen 30 s und 24 h", async () => {
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const anlegen = async (intervallS: number) =>
      (
        (
          await t.app.inject({
            method: "POST",
            url: `/api/backoffice/${a.orgId}/endpunkte`,
            headers: { cookie: a.cookie },
            payload: { name: "X", feedUrl: FEED, intervallS, aktiv: false },
          })
        ).json() as { intervallS: number }
      ).intervallS;
    expect(await anlegen(5)).toBe(30);
    expect(await anlegen(90)).toBe(90);
    expect(await anlegen(7200)).toBe(7200);
    expect(await anlegen(999_999)).toBe(86_400);
  });
});

describe("Ereignisprotokoll im Backoffice", () => {
  it("filtert nach Objekt und Aktion und bleibt bei der eigenen Organisation", async () => {
    const a = await mitFeed(true);
    const liste = async (q: string, cookie = a.cookie) =>
      (await t.app.inject({ url: `/api/backoffice/${a.orgId}/ereignisse?limit=200&${q}`, headers: { cookie } })).json() as { art: string }[];

    const alle = await liste("");
    expect(alle).toHaveLength(50);
    const aasNeu = await liste("objekt=aas&aktion=created");
    const smNeu = await liste("objekt=submodel&aktion=created");
    const smGeaendert = await liste("objekt=submodel&aktion=updated");
    const pcn = await liste("objekt=pcn&aktion=created"); // Aktion gilt nicht fuer PCN
    expect(aasNeu.length).toBeGreaterThan(0);
    expect(aasNeu.every((e) => e.art === "registriert")).toBe(true);
    expect(smNeu.every((e) => e.art === "submodel-neu")).toBe(true);
    expect(smGeaendert.every((e) => e.art === "submodel-geaendert")).toBe(true);
    expect(pcn.every((e) => e.art === "pcn")).toBe(true);
    expect(aasNeu.length + smNeu.length + smGeaendert.length + pcn.length).toBe(alle.length);
    expect((await liste("objekt=aas&aktion=updated")).length).toBe(0);

    // Fremde Organisation: 404. Oeffentlich gibt es das Protokoll nicht mehr.
    const b = await organisationMitNutzer(t.app, a.admin, "Beta", "b@example.invalid");
    expect((await t.app.inject({ url: `/api/backoffice/${a.orgId}/ereignisse`, headers: { cookie: b.cookie } })).statusCode).toBe(404);
    expect((await t.app.inject({ url: "/api/ereignisse" })).statusCode).toBe(404);
  });
});

describe("Status-Filter neu", () => {
  it("zeigt nur in den letzten 7 Tagen registrierte Assets", async () => {
    await mitFeed(true);
    const alle = ((await t.app.inject({ url: "/api/assets?proSeite=100" })).json() as Liste).eintraege;
    const juengste = alle.map((e) => e.registriert).filter((r): r is string => !!r).sort().at(-1)!;

    // Uhr einen Tag nach der juengsten Registrierung: mindestens die gehoert dazu.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(new Date(juengste).getTime() + 24 * 3600 * 1000));
    const neu = (await t.app.inject({ url: "/api/assets?status=neu&proSeite=100" })).json() as Liste;
    expect(neu.gesamt).toBeGreaterThan(0);
    const grenze = Date.now() - 7 * 24 * 3600 * 1000;
    expect(neu.eintraege.every((e) => new Date(e.registriert!).getTime() >= grenze)).toBe(true);

    // Dreissig Tage spaeter ist nichts mehr neu.
    vi.setSystemTime(new Date(new Date(juengste).getTime() + 30 * 24 * 3600 * 1000));
    expect(((await t.app.inject({ url: "/api/assets?status=neu" })).json() as Liste).gesamt).toBe(0);
  });
});
