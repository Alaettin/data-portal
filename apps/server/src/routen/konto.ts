import type { FastifyInstance } from "fastify";
import { jetzt } from "../db.ts";
import { hashePasswort, MIN_PASSWORTLAENGE, normalisiereEmail, pruefeInsLeere, pruefePasswort } from "../auth/passwort.ts";
import { nutzerAusSitzung, sitzungAnlegen, sitzungBeenden, sitzungenEntziehen } from "../auth/sitzung.ts";
import { angemeldet, nutzerVon } from "../auth/waechter.ts";
import type { Kontext } from "./kontext.ts";

export function kontoRouten(app: FastifyInstance, k: Kontext) {
  const { db } = k;

  const organisationKurz = (id: number | null) =>
    id === null ? null : (db.prepare("SELECT id, name, slug FROM organisationen WHERE id = ?").get(id) as { id: number; name: string; slug: string });

  app.post<{ Body: { email?: string; passwort?: string } }>(
    "/api/auth/anmelden",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const email = normalisiereEmail(String(req.body?.email ?? ""));
      const passwort = String(req.body?.passwort ?? "");
      const z = db.prepare("SELECT id, passwort_hash, aktiv FROM nutzer WHERE email = ?").get(email) as
        | { id: number; passwort_hash: string; aktiv: number }
        | undefined;
      // Ein Text fuer alle Faelle: unbekannte Adresse, falsches Passwort, gesperrt.
      const ok = z ? (await pruefePasswort(z.passwort_hash, passwort)) && z.aktiv === 1 : await pruefeInsLeere(passwort);
      if (!z || !ok) return reply.code(401).send({ fehler: "anmeldung-falsch" });
      db.prepare("UPDATE nutzer SET letzte_anmeldung = ? WHERE id = ?").run(jetzt(), z.id);
      sitzungAnlegen(db, req, reply, z.id);
      const nutzer = db.prepare("SELECT id, email, name, rolle, organisation_id AS organisationId FROM nutzer WHERE id = ?").get(z.id) as {
        organisationId: number | null;
      };
      return { nutzer, organisation: organisationKurz(nutzer.organisationId) };
    },
  );

  app.post("/api/auth/abmelden", async (req, reply) => {
    sitzungBeenden(db, req, reply);
    return { ok: true };
  });

  /** Ohne Sitzung 200 mit `null`, nicht 401: die Frage "wer bin ich" ist kein Fehler. */
  app.get("/api/auth/ich", async (req) => {
    const n = nutzerAusSitzung(db, req);
    return n ? { nutzer: n, organisation: organisationKurz(n.organisationId) } : { nutzer: null, organisation: null };
  });

  app.post<{ Body: { alt?: string; neu?: string } }>(
    "/api/auth/passwort",
    { preHandler: angemeldet(db), config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const n = nutzerVon(req);
      const neu = String(req.body?.neu ?? "");
      if (neu.length < MIN_PASSWORTLAENGE) return reply.code(400).send({ fehler: "passwort-zu-kurz" });
      const z = db.prepare("SELECT passwort_hash FROM nutzer WHERE id = ?").get(n.id) as { passwort_hash: string };
      if (!(await pruefePasswort(z.passwort_hash, String(req.body?.alt ?? "")))) {
        return reply.code(400).send({ fehler: "passwort-alt-falsch" });
      }
      db.prepare("UPDATE nutzer SET passwort_hash = ? WHERE id = ?").run(await hashePasswort(neu), n.id);
      // Andere Geraete abmelden, dieses bleibt angemeldet.
      sitzungenEntziehen(db, n.id, req);
      return { ok: true };
    },
  );
}
