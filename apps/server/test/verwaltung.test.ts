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
