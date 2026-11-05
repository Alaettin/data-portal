import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { baueApp } from "../src/app.ts";
import { hauptadminSicherstellen } from "../src/auth/admin.ts";
import { oeffnen } from "../src/db.ts";

export const ADMIN = { email: "admin@example.invalid", passwort: "admin-passwort-1234" };

const seite = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../packages/core/test/fixtures/rc-feed-seite1.json", import.meta.url)), "utf8"),
) as { records: unknown[] };

/**
 * Feed nach dem Muster des RC: erste Seite die echten 50 Events, danach leer. Shells und
 * Submodelle antworten 404, damit der Test ohne Netz und schnell bleibt; Abruffehler halten
 * die Verarbeitung ohnehin nicht auf.
 */
export const feedAttrappe: typeof fetch = async (eingabe) => {
  const url = new URL(String(eingabe));
  if (url.pathname.endsWith("/events")) {
    const records = url.searchParams.get("lastEventId") ? [] : seite.records;
    return new Response(JSON.stringify({ records, cursor: null }), { headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
};

export async function baue(holen: typeof fetch = feedAttrappe) {
  const db = oeffnen(":memory:");
  await hauptadminSicherstellen(db, ADMIN.email, ADMIN.passwort);
  const { app, takt } = await baueApp({ db, holen, protokoll: false });
  return { app, db, takt };
}

type App = Awaited<ReturnType<typeof baue>>["app"];

/** Meldet an und gibt die Cookie-Kopfzeile fuer weitere Anfragen zurueck. */
export async function anmelden(app: App, email: string, passwort: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/api/auth/anmelden", payload: { email, passwort } });
  if (r.statusCode !== 200) throw new Error(`Anmeldung ${email}: ${r.statusCode} ${r.body}`);
  const c = r.cookies.find((x) => x.name === "adp_sitzung");
  if (!c) throw new Error("Kein Sitzungscookie");
  return `adp_sitzung=${c.value}`;
}

/**
 * Legt als Admin eine Organisation mit einem Nutzer an; gibt IDs und dessen Cookie zurueck.
 * Neue Organisationen sind privat; `oeffentlich` schaltet sie ueber das Profil frei.
 */
export async function organisationMitNutzer(app: App, adminCookie: string, name: string, email: string, oeffentlich = true) {
  const org = await app.inject({ method: "POST", url: "/api/admin/organisationen", headers: { cookie: adminCookie }, payload: { name } });
  const orgId = (org.json() as { id: number }).id;
  const n = await app.inject({
    method: "POST",
    url: "/api/admin/nutzer",
    headers: { cookie: adminCookie },
    payload: { email, name: `Nutzer ${name}`, organisationId: orgId },
  });
  const { nutzer, startpasswort } = n.json() as { nutzer: { id: number }; startpasswort: string };
  const cookie = await anmelden(app, email, startpasswort);
  if (oeffentlich) {
    const p = await app.inject({ method: "PATCH", url: `/api/backoffice/${orgId}/profil`, headers: { cookie }, payload: { oeffentlich: true } });
    if (p.statusCode !== 200) throw new Error(`Freischalten: ${p.statusCode} ${p.body}`);
  }
  return { orgId, nutzerId: nutzer.id, startpasswort, cookie };
}
