/**
 * Verwaltung unter `/api/admin`, nur fuer den Hauptadmin: Organisationen und ihre Nutzer.
 * Nutzer bekommen ein Startpasswort, das genau einmal in der Antwort steht.
 */

import type { FastifyInstance } from "fastify";
import { kennzahlen, type OrganisationZeile } from "../ansicht.ts";
import { erzeugeStartpasswort, hashePasswort } from "../auth/passwort.ts";
import { sitzungenEntziehen } from "../auth/sitzung.ts";
import { angemeldet, nurAdmin, nutzerVon } from "../auth/waechter.ts";
import { jetzt } from "../db.ts";
import { Eingabefehler, email, pflichttext, slugVon } from "./hilfen.ts";
import type { Kontext } from "./kontext.ts";

type NutzerZeile = {
  id: number;
  email: string;
  name: string;
  rolle: string;
  organisationId: number | null;
  organisation: string | null;
  aktiv: number;
  angelegt: string;
  letzteAnmeldung: string | null;
};

const NUTZER_SQL = `
  SELECT n.id, n.email, n.name, n.rolle, n.organisation_id AS organisationId, o.name AS organisation,
         n.aktiv, n.angelegt, n.letzte_anmeldung AS letzteAnmeldung
  FROM nutzer n LEFT JOIN organisationen o ON o.id = n.organisation_id`;

const nutzerAnsicht = (n: NutzerZeile) => ({ ...n, aktiv: n.aktiv === 1 });

export function verwaltungRouten(app: FastifyInstance, k: Kontext) {
  const { db } = k;

  app.register(async (bereich) => {
    bereich.addHook("preHandler", angemeldet(db));
    bereich.addHook("preHandler", nurAdmin());
    bereich.setErrorHandler((f, _req, reply) => {
      if (f instanceof Eingabefehler) return reply.code(400).send({ fehler: f.code });
      return reply.send(f);
    });

    const organisation = (id: number) => db.prepare("SELECT * FROM organisationen WHERE id = ?").get(id) as OrganisationZeile | undefined;
    const nutzer = (id: number) => db.prepare(`${NUTZER_SQL} WHERE n.id = ?`).get(id) as NutzerZeile | undefined;

    bereich.get("/api/admin/organisationen", async () => {
      const zeilen = db.prepare("SELECT * FROM organisationen ORDER BY name COLLATE NOCASE").all() as OrganisationZeile[];
      return zeilen.map((o) => ({
        id: o.id,
        slug: o.slug,
        name: o.name,
        farbe: o.farbe,
        angelegt: o.angelegt,
        nutzer: (db.prepare("SELECT COUNT(*) AS n FROM nutzer WHERE organisation_id = ?").get(o.id) as { n: number }).n,
        endpunkte: (db.prepare("SELECT COUNT(*) AS n FROM endpunkte WHERE organisation_id = ?").get(o.id) as { n: number }).n,
        assets: kennzahlen(db, o.id).assets,
      }));
    });

    bereich.post<{ Body: { name?: string } }>("/api/admin/organisationen", async (req, reply) => {
      const name = pflichttext(req.body?.name, "name-fehlt");
      const z = db
        .prepare("INSERT INTO organisationen (slug, name, angelegt) VALUES (?, ?, ?) RETURNING id, slug, name")
        .get(slugVon(db, name), name, jetzt());
      return reply.code(201).send(z);
    });

    bereich.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/admin/organisationen/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!organisation(id)) return reply.code(404).send({ fehler: "nicht-gefunden" });
      const name = pflichttext(req.body?.name, "name-fehlt");
      // Die Adresse folgt dem Namen; alte Links auf die Organisationsseite fuehren dann ins Leere.
      db.prepare("UPDATE organisationen SET name = ?, slug = ? WHERE id = ?").run(name, slugVon(db, name, id), id);
      k.strom.senden({ typ: "bestand" });
      return db.prepare("SELECT id, slug, name FROM organisationen WHERE id = ?").get(id);
    });

    bereich.delete<{ Params: { id: string } }>("/api/admin/organisationen/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!organisation(id)) return reply.code(404).send({ fehler: "nicht-gefunden" });
      const ids = db.prepare("SELECT id FROM endpunkte WHERE organisation_id = ?").all(id) as { id: number }[];
      for (const e of ids) k.takt.entfernen(e.id);
      // Endpunkte, Bestand und Nutzer haengen per ON DELETE CASCADE daran.
      db.prepare("DELETE FROM organisationen WHERE id = ?").run(id);
      k.strom.senden({ typ: "bestand" });
      return { ok: true };
    });

    bereich.get("/api/admin/nutzer", async () =>
      (db.prepare(`${NUTZER_SQL} ORDER BY n.rolle, o.name COLLATE NOCASE, n.name COLLATE NOCASE`).all() as NutzerZeile[]).map(nutzerAnsicht),
    );

    bereich.post<{ Body: { email?: string; name?: string; organisationId?: number } }>("/api/admin/nutzer", async (req, reply) => {
      const b = req.body ?? {};
      const adresse = email(b.email);
      const name = pflichttext(b.name, "name-fehlt");
      const orgId = Number(b.organisationId);
      if (!organisation(orgId)) throw new Eingabefehler("organisation-fehlt");
      if (db.prepare("SELECT 1 FROM nutzer WHERE email = ?").get(adresse)) throw new Eingabefehler("email-vergeben");
      const startpasswort = erzeugeStartpasswort();
      const { id } = db
        .prepare("INSERT INTO nutzer (email, name, passwort_hash, rolle, organisation_id, angelegt) VALUES (?, ?, ?, 'organisation', ?, ?) RETURNING id")
        .get(adresse, name, await hashePasswort(startpasswort), orgId, jetzt()) as { id: number };
      return reply.code(201).send({ nutzer: nutzerAnsicht(nutzer(id)!), startpasswort });
    });

    bereich.patch<{ Params: { id: string }; Body: { name?: string; aktiv?: boolean; organisationId?: number } }>(
      "/api/admin/nutzer/:id",
      async (req, reply) => {
        const id = Number(req.params.id);
        const n = nutzer(id);
        if (!n) return reply.code(404).send({ fehler: "nicht-gefunden" });
        const b = req.body ?? {};
        const selbst = nutzerVon(req).id === id;
        if (selbst && b.aktiv === false) throw new Eingabefehler("selbst-sperren");
        let orgId = n.organisationId;
        if (b.organisationId !== undefined && n.rolle === "organisation") {
          if (!organisation(Number(b.organisationId))) throw new Eingabefehler("organisation-fehlt");
          orgId = Number(b.organisationId);
        }
        db.prepare("UPDATE nutzer SET name = ?, aktiv = ?, organisation_id = ? WHERE id = ?").run(
          b.name === undefined ? n.name : pflichttext(b.name, "name-fehlt"),
          b.aktiv === undefined ? n.aktiv : b.aktiv ? 1 : 0,
          orgId,
          id,
        );
        if (b.aktiv === false || orgId !== n.organisationId) sitzungenEntziehen(db, id);
        return nutzerAnsicht(nutzer(id)!);
      },
    );

    bereich.post<{ Params: { id: string } }>("/api/admin/nutzer/:id/passwort", async (req, reply) => {
      const id = Number(req.params.id);
      if (!nutzer(id)) return reply.code(404).send({ fehler: "nicht-gefunden" });
      if (nutzerVon(req).id === id) throw new Eingabefehler("selbst-zuruecksetzen");
      const startpasswort = erzeugeStartpasswort();
      db.prepare("UPDATE nutzer SET passwort_hash = ? WHERE id = ?").run(await hashePasswort(startpasswort), id);
      sitzungenEntziehen(db, id);
      return { startpasswort };
    });

    bereich.delete<{ Params: { id: string } }>("/api/admin/nutzer/:id", async (req, reply) => {
      const id = Number(req.params.id);
      if (!nutzer(id)) return reply.code(404).send({ fehler: "nicht-gefunden" });
      if (nutzerVon(req).id === id) throw new Eingabefehler("selbst-loeschen");
      db.prepare("DELETE FROM nutzer WHERE id = ?").run(id);
      return { ok: true };
    });
  });
}
