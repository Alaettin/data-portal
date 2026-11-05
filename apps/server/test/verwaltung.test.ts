import { afterEach, describe, expect, it } from "vitest";
import { ADMIN, anmelden, baue, organisationMitNutzer } from "./helfer.ts";

let t: Awaited<ReturnType<typeof baue>> | null = null;
afterEach(async () => {
  await t?.app.close();
  t = null;
});

describe("Passwort durch den Admin", () => {
  it("setzt ein gewaehltes Passwort, ohne es zurueckzuschicken, und meldet alte Sitzungen ab", async () => {
    t = await baue();
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const setzen = (passwort?: string) =>
      t!.app.inject({ method: "POST", url: `/api/admin/nutzer/${a.nutzerId}/passwort`, headers: { cookie: admin }, payload: passwort === undefined ? {} : { passwort } });

    const kurz = await setzen("zu-kurz");
    expect(kurz.statusCode).toBe(400);
    expect(kurz.json()).toEqual({ fehler: "passwort-zu-kurz" });

    const gesetzt = await setzen("neues-passwort-2026");
    expect(gesetzt.statusCode).toBe(200);
    expect(gesetzt.json()).toEqual({ gesetzt: true });
    expect(gesetzt.body).not.toContain("neues-passwort-2026");

    // Die alte Sitzung gilt nicht mehr, das neue Passwort schon, das alte nicht.
    expect((await t.app.inject({ url: "/api/auth/ich", headers: { cookie: a.cookie } })).json()).toMatchObject({ nutzer: null });
    await expect(anmelden(t.app, "a@example.invalid", a.startpasswort)).rejects.toThrow();
    await anmelden(t.app, "a@example.invalid", "neues-passwort-2026");

    // Ohne Passwort wie bisher ein zufaelliges Startpasswort.
    const zufall = (await setzen()).json() as { startpasswort: string };
    await anmelden(t.app, "a@example.invalid", zufall.startpasswort);
  });

  it("legt einen Nutzer mit gewaehltem Passwort an", async () => {
    t = await baue();
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const org = await t.app.inject({ method: "POST", url: "/api/admin/organisationen", headers: { cookie: admin }, payload: { name: "Gamma" } });
    const orgId = (org.json() as { id: number }).id;
    const anlegen = (passwort: string) =>
      t!.app.inject({
        method: "POST",
        url: "/api/admin/nutzer",
        headers: { cookie: admin },
        payload: { email: `g${passwort.length}@example.invalid`, name: "G", organisationId: orgId, passwort },
      });
    expect((await anlegen("kurz")).statusCode).toBe(400);
    const r = await anlegen("gewaehlt-passwort-1");
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ gesetzt: true });
    expect(r.body).not.toContain("gewaehlt-passwort-1");
    await anmelden(t.app, "g19@example.invalid", "gewaehlt-passwort-1");
  });
});

describe("Weitere Administratoren", () => {
  it("legt Admins ohne Organisation an und stuft Nutzer hoch und zurueck", async () => {
    t = await baue();
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    const b = await organisationMitNutzer(t.app, admin, "Beta", "b@example.invalid");
    const darfVerwaltung = async (cookie: string) => (await t!.app.inject({ url: "/api/admin/nutzer", headers: { cookie } })).statusCode;
    const backoffice = async (cookie: string, org: number) => (await t!.app.inject({ url: `/api/backoffice/${org}`, headers: { cookie } })).statusCode;
    const patch = (id: number, payload: object, cookie = admin) =>
      t!.app.inject({ method: "PATCH", url: `/api/admin/nutzer/${id}`, headers: { cookie }, payload });

    // Neuer Admin: keine Organisation, sieht Verwaltung und jedes Backoffice.
    const neu = await t.app.inject({
      method: "POST",
      url: "/api/admin/nutzer",
      headers: { cookie: admin },
      payload: { email: "zweiter@example.invalid", name: "Zweiter Admin", rolle: "admin", passwort: "zweiter-admin-2026" },
    });
    expect(neu.statusCode).toBe(201);
    expect(neu.json()).toMatchObject({ nutzer: { rolle: "admin", organisationId: null } });
    const zweiter = await anmelden(t.app, "zweiter@example.invalid", "zweiter-admin-2026");
    expect(await darfVerwaltung(zweiter)).toBe(200);
    expect(await backoffice(zweiter, a.orgId)).toBe(200);
    expect(await backoffice(zweiter, b.orgId)).toBe(200);

    // Organisationsnutzer hochstufen: Organisation weg, alte Sitzung ungueltig, neue mit Admin-Rechten.
    expect(await darfVerwaltung(a.cookie)).toBe(404);
    const hoch = await patch(a.nutzerId, { rolle: "admin" });
    expect(hoch.json()).toMatchObject({ rolle: "admin", organisationId: null });
    expect((await t.app.inject({ url: "/api/auth/ich", headers: { cookie: a.cookie } })).json()).toMatchObject({ nutzer: null });
    const aAdmin = await anmelden(t.app, "a@example.invalid", a.startpasswort);
    expect(await darfVerwaltung(aAdmin)).toBe(200);

    // Zurueckstufen braucht eine Organisation; danach nur noch deren Backoffice.
    const ohne = await patch(a.nutzerId, { rolle: "organisation" });
    expect(ohne.statusCode).toBe(400);
    expect(ohne.json()).toEqual({ fehler: "organisation-fehlt" });
    expect((await patch(a.nutzerId, { rolle: "organisation", organisationId: b.orgId })).json()).toMatchObject({ rolle: "organisation", organisationId: b.orgId });
    const aOrg = await anmelden(t.app, "a@example.invalid", a.startpasswort);
    expect(await darfVerwaltung(aOrg)).toBe(404);
    expect(await backoffice(aOrg, b.orgId)).toBe(200);
    expect(await backoffice(aOrg, a.orgId)).toBe(404);

    // Die eigene Rolle aendert niemand, auch nicht der zweite Admin.
    const zweiterId = (neu.json() as { nutzer: { id: number } }).nutzer.id;
    const selbst = await patch(zweiterId, { rolle: "organisation", organisationId: a.orgId }, zweiter);
    expect(selbst.statusCode).toBe(400);
    expect(selbst.json()).toEqual({ fehler: "selbst-rolle" });
    expect((await patch(zweiterId, { rolle: "chef" })).json()).toEqual({ fehler: "rolle-ungueltig" });
  });
});

describe("Organisationslogo", () => {
  it("kommt nur aus dem Profil, nie aus dem Typenschild eines Assets", async () => {
    t = await baue();
    const admin = await anmelden(t.app, ADMIN.email, ADMIN.passwort);
    const a = await organisationMitNutzer(t.app, admin, "Alpha", "a@example.invalid");
    t.db.prepare("INSERT INTO endpunkte (organisation_id, name, feed_url, angelegt) VALUES (?, 'E', 'https://x', 'x')").run(a.orgId);
    t.db
      .prepare("INSERT INTO assets (endpunkt_id, item_id, logo, logo_typ) SELECT id, '1', ?, 'image/png' FROM endpunkte WHERE organisation_id = ?")
      .run(Buffer.from("png"), a.orgId);

    const liste = (await t.app.inject({ url: "/api/organisationen" })).json() as { id: number; hatLogo: boolean }[];
    expect(liste.find((o) => o.id === a.orgId)?.hatLogo).toBe(false);
    expect((await t.app.inject({ url: `/api/organisationen/${a.orgId}/logo` })).statusCode).toBe(404);
  });
});
