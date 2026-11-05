/**
 * Was ohne Anmeldung erreichbar ist: Kennzahlen, Assets, Organisationen.
 *
 * Sichtbarkeit (seit 04.11.2026): Sammelansichten zeigen nur oeffentliche Organisationen.
 * Ansichten einer bestimmten Organisation oder eines Assets erlauben zusaetzlich deren
 * Mitglieder und den Admin, damit das Backoffice die eigene Seite auch privat sieht; alle
 * anderen bekommen 404, wie fuer etwas, das es nicht gibt.
 *
 * Nichts hier verraet Feed-URLs, Abruffehler der Endpunkte oder Nutzer.
 */

import { elementAnPfad, encodeIdentifier, submodelAnzeigename, zusammenfassen, type Element, type PcnRecord } from "@datenportal/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { assetsLesen, eventsLesen, kennzahlen, organisationAnsicht, type OrganisationZeile } from "../ansicht.ts";
import { nutzerAusSitzung } from "../auth/sitzung.ts";
import type { DB } from "../db.ts";
import { anhang } from "../holen.ts";
import type { Kontext } from "./kontext.ts";
import { sprache } from "./hilfen.ts";

/** Sortierschluessel auf SQL, nur diese. Leere Werte stehen immer hinten. */
const SORTIERUNG: Record<string, string> = {
  registriert: "a.registriert",
  aktualisiert: "COALESCE(a.aktualisiert, a.registriert)",
  name: "COALESCE(a.name, a.item_id) COLLATE NOCASE",
  hersteller: "a.hersteller COLLATE NOCASE",
  organisation: "o.name COLLATE NOCASE",
};

const SIEBEN_TAGE_MS = 7 * 24 * 60 * 60 * 1000;

type AssetFilter = {
  q?: string;
  organisation?: string;
  status?: string;
  sort?: string;
  richtung?: string;
  seite?: string;
  proSeite?: string;
};

/** Darf die Anfrage die Organisation sehen? Oeffentlich, eigenes Mitglied oder Admin. */
export function sichtbarFuer(db: DB, req: FastifyRequest): (org: { id: number; oeffentlich: boolean | number }) => boolean {
  const ich = nutzerAusSitzung(db, req);
  return (org) => org.oeffentlich === true || org.oeffentlich === 1 || ich?.rolle === "admin" || ich?.organisationId === org.id;
}

export function oeffentlicheRouten(app: FastifyInstance, k: Kontext) {
  const { db } = k;

  /** Ein Asset, wenn die Anfrage es sehen darf; sonst null (die Route antwortet dann 404). */
  function sichtbaresAsset(req: FastifyRequest, eid: number, item: string) {
    const [a] = assetsLesen(db, "WHERE a.endpunkt_id = ? AND a.item_id = ?", [eid, item]);
    if (!a) return null;
    return sichtbarFuer(db, req)({ id: a.organisationId, oeffentlich: a.organisationOeffentlich }) ? a : null;
  }

  app.get("/api/gesund", async () => ({ ok: true }));
  app.get("/api/strom", (req, reply) => k.strom.anmelden(req, reply));

  app.get("/api/uebersicht", async () => ({
    ...kennzahlen(db, null),
    organisationen: (db.prepare("SELECT COUNT(*) AS n FROM organisationen WHERE oeffentlich = 1").get() as { n: number }).n,
  }));

  app.get<{ Querystring: { limit?: string } }>("/api/assets/neu", async (req) => {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit ?? 8) || 8));
    return assetsLesen(db, "WHERE a.registriert IS NOT NULL AND o.oeffentlich = 1", [], `ORDER BY a.registriert DESC, a.item_id LIMIT ${limit}`);
  });

  app.get<{ Querystring: AssetFilter }>("/api/assets", async (req) => {
    const f = req.query;
    const wo: string[] = [];
    const werte: unknown[] = [];

    if (f.organisation) {
      // Eine bestimmte Organisation: oeffentlich, oder die Anfrage gehoert dazu.
      const o = db.prepare("SELECT id, oeffentlich FROM organisationen WHERE id = ?").get(Number(f.organisation)) as
        | { id: number; oeffentlich: number }
        | undefined;
      wo.push("o.id = ?");
      werte.push(o && sichtbarFuer(db, req)(o) ? o.id : -1);
    } else {
      wo.push("o.oeffentlich = 1");
    }

    const q = (f.q ?? "").trim();
    if (q) {
      wo.push("(a.item_id LIKE ? OR IFNULL(a.name,'') LIKE ? OR IFNULL(a.bestellnummer,'') LIKE ? OR IFNULL(a.hersteller,'') LIKE ? OR IFNULL(a.global_asset_id,'') LIKE ?)");
      werte.push(...Array(5).fill(`%${q}%`));
    }

    const seit = new Date(Date.now() - SIEBEN_TAGE_MS).toISOString();
    const pcn = "EXISTS (SELECT 1 FROM pcns p WHERE p.endpunkt_id = a.endpunkt_id AND p.item_id = a.item_id";
    if (f.status === "neu") {
      wo.push("a.registriert >= ?");
      werte.push(seit);
    } else if (f.status === "aktualisiert") {
      wo.push("EXISTS (SELECT 1 FROM events e WHERE e.endpunkt_id = a.endpunkt_id AND e.item_id = a.item_id AND e.art = 'submodel-geaendert' AND e.zeit >= ?)");
      werte.push(seit);
    } else if (f.status === "pcn") wo.push(`${pcn})`);
    else if (f.status === "abkuendigung") wo.push(`${pcn} AND p.abkuendigung = 1)`);

    const ausdruck = SORTIERUNG[f.sort ?? ""] ?? SORTIERUNG["aktualisiert"]!;
    const richtung = f.richtung === "auf" ? "ASC" : "DESC";
    const proSeite = Math.min(100, Math.max(5, Number(f.proSeite ?? 25) || 25));
    const seite = Math.max(1, Math.floor(Number(f.seite ?? 1)) || 1);
    const bedingung = `WHERE ${wo.join(" AND ")}`;

    const gesamt = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM assets a JOIN endpunkte ep ON ep.id = a.endpunkt_id JOIN organisationen o ON o.id = ep.organisation_id ${bedingung}`)
        .get(...werte) as { n: number }
    ).n;
    const eintraege = assetsLesen(
      db,
      bedingung,
      werte,
      `ORDER BY (${ausdruck}) IS NULL, ${ausdruck} ${richtung}, a.item_id LIMIT ${proSeite} OFFSET ${(seite - 1) * proSeite}`,
    );

    // Auswahl fuer den Organisationsfilter: alle oeffentlichen mit Assets.
    const facetten = {
      organisationen: db
        .prepare(
          `SELECT o.id, o.name, COUNT(a.item_id) AS anzahl FROM organisationen o
           JOIN endpunkte ep ON ep.organisation_id = o.id JOIN assets a ON a.endpunkt_id = ep.id
           WHERE o.oeffentlich = 1 GROUP BY o.id ORDER BY o.name COLLATE NOCASE`,
        )
        .all(),
    };
    return { eintraege, gesamt, seite, proSeite, facetten };
  });

  app.get<{ Params: { eid: string; item: string } }>("/api/assets/:eid/:item", async (req, reply) => {
    const eid = Number(req.params.eid);
    const item = req.params.item;
    const s = sprache(req);
    const kurz = sichtbaresAsset(req, eid, item);
    if (!kurz) return reply.code(404).send({ fehler: "nicht-gefunden" });
    const a = db.prepare("SELECT aas_id, global_asset_id FROM assets WHERE endpunkt_id=? AND item_id=?").get(eid, item) as {
      aas_id: string | null;
      global_asset_id: string | null;
    };
    const submodelle = (
      db
        .prepare("SELECT submodel_id, semantic_id, id_short, inhalt, abruf_fehler, stand FROM submodelle WHERE endpunkt_id=? AND item_id=?")
        .all(eid, item) as {
        submodel_id: string;
        semantic_id: string | null;
        id_short: string | null;
        inhalt: string | null;
        abruf_fehler: string | null;
        stand: string;
      }[]
    )
      .map((z) => ({
        id: z.submodel_id,
        semanticId: z.semantic_id,
        name: submodelAnzeigename(z.semantic_id, z.id_short, s),
        inhalt: z.inhalt ? (JSON.parse(z.inhalt) as unknown) : null,
        // Der Grund bleibt intern; Besucher sehen nur, dass der Inhalt fehlt.
        nichtGeladen: z.inhalt === null && z.abruf_fehler !== null,
        stand: z.stand,
      }))
      .sort((x, y) => x.name.localeCompare(y.name));
    const pcns = (
      db.prepare("SELECT event_id, record, zeit FROM pcns WHERE endpunkt_id=? AND item_id=? ORDER BY zeit DESC").all(eid, item) as {
        event_id: string;
        record: string;
        zeit: string;
      }[]
    ).map((p) => ({ eventId: p.event_id, zeit: p.zeit, ...zusammenfassen(JSON.parse(p.record) as PcnRecord, s) }));
    const verlauf = eventsLesen(db, "WHERE e.endpunkt_id = ? AND e.item_id = ?", [eid, item], s, "ORDER BY e.lfd DESC");
    return { ...kurz, aasId: a.aas_id, globalAssetId: a.global_asset_id, submodelle, pcns, verlauf };
  });

  const bildRoute = (spalte: "bild" | "logo") =>
    app.get<{ Params: { eid: string; item: string } }>(`/api/assets/:eid/:item/${spalte}`, async (req, reply) => {
      if (!sichtbaresAsset(req, Number(req.params.eid), req.params.item)) return reply.code(404).send({ fehler: "nicht-gefunden" });
      const z = db
        .prepare(`SELECT ${spalte} AS daten, ${spalte}_typ AS typ FROM assets WHERE endpunkt_id=? AND item_id=?`)
        .get(Number(req.params.eid), req.params.item) as { daten: Buffer | null; typ: string | null } | undefined;
      if (!z?.daten) return reply.code(404).send({ fehler: "nicht-gefunden" });
      return reply.header("cache-control", "private, max-age=300").type(z.typ ?? "image/png").send(z.daten);
    });
  bildRoute("bild");
  bildRoute("logo");

  /**
   * Eine Datei aus einem Teilmodell beim Hersteller abrufen und durchreichen, ohne sie zu
   * speichern (Nutzerentscheidung 04.11.2026). Abgerufen wird nur, was im gespeicherten
   * Teilmodell dieses Assets wirklich als `File` steht: kein freier Abruf beliebiger Adressen.
   */
  app.get<{ Params: { eid: string; item: string }; Querystring: { sm?: string; pfad?: string } }>(
    "/api/assets/:eid/:item/datei",
    async (req, reply) => {
      const eid = Number(req.params.eid);
      const item = req.params.item;
      if (!sichtbaresAsset(req, eid, item)) return reply.code(404).send({ fehler: "nicht-gefunden" });
      const { sm = "", pfad = "" } = req.query;
      const z = db
        .prepare(
          `SELECT s.inhalt, a.repo_url FROM submodelle s JOIN assets a ON a.endpunkt_id = s.endpunkt_id AND a.item_id = s.item_id
           WHERE s.endpunkt_id = ? AND s.item_id = ? AND s.submodel_id = ?`,
        )
        .get(eid, item, sm) as { inhalt: string | null; repo_url: string | null } | undefined;
      const elemente = z?.inhalt ? ((JSON.parse(z.inhalt) as { submodelElements?: Element[] }).submodelElements ?? []) : [];
      const element = elementAnPfad(elemente, pfad);
      if (!z?.repo_url || element?.modelType !== "File") return reply.code(404).send({ fehler: "nicht-gefunden" });

      try {
        const d = await anhang(`${z.repo_url}/submodels/${encodeIdentifier(sm)}/submodel-elements/${encodeURIComponent(pfad)}/attachment`, k.holen);
        const name = typeof element.value === "string" ? (element.value.split("/").pop() ?? "datei") : "datei";
        return reply
          .header("content-disposition", `inline; filename="${name.replace(/[^\w.-]/g, "_")}"`)
          .header("cache-control", "private, max-age=300")
          .type(element.contentType || d.typ)
          .send(d.daten);
      } catch {
        return reply.code(404).type("text/plain; charset=utf-8").send(`${sprache(req) === "en" ? "The manufacturer does not provide this file." : "Diese Datei stellt der Hersteller nicht bereit."}`);
      }
    },
  );

  app.get("/api/organisationen", async (req) => {
    const s = sprache(req);
    const zeilen = db.prepare("SELECT * FROM organisationen WHERE oeffentlich = 1 ORDER BY name COLLATE NOCASE").all() as OrganisationZeile[];
    return zeilen.map((o) => ({ ...organisationAnsicht(o, s), hatLogo: logoVorhanden(o), assets: kennzahlen(db, o.id).assets }));
  });

  app.get<{ Params: { slug: string } }>("/api/organisationen/:slug", async (req, reply) => {
    const o = db.prepare("SELECT * FROM organisationen WHERE slug = ?").get(req.params.slug) as OrganisationZeile | undefined;
    if (!o || !sichtbarFuer(db, req)(o)) return reply.code(404).send({ fehler: "nicht-gefunden" });
    return { ...organisationAnsicht(o, sprache(req)), hatLogo: logoVorhanden(o), kennzahlen: kennzahlen(db, o.id) };
  });

  /**
   * Nur das Logo aus dem Profil. Bis 05.11.2026 sprang hier das Herstellerlogo aus dem ersten
   * Typenschild ein; das wirkte wie automatisch gesetzt und ist auf Wunsch entfallen.
   */
  function logoVorhanden(o: OrganisationZeile): boolean {
    return !!o.logo_typ;
  }

  app.get<{ Params: { id: string } }>("/api/organisationen/:id/logo", async (req, reply) => {
    const id = Number(req.params.id);
    const o = db.prepare("SELECT id, oeffentlich FROM organisationen WHERE id = ?").get(id) as { id: number; oeffentlich: number } | undefined;
    if (!o || !sichtbarFuer(db, req)(o)) return reply.code(404).send({ fehler: "nicht-gefunden" });
    const z = db.prepare("SELECT logo AS daten, logo_typ AS typ FROM organisationen WHERE id=? AND logo IS NOT NULL").get(id) as
      | { daten: Buffer; typ: string }
      | undefined;
    if (!z) return reply.code(404).send({ fehler: "nicht-gefunden" });
    // no-cache: nach einem neuen Logo im Profil soll sofort das neue erscheinen.
    return reply.header("cache-control", "no-cache").type(z.typ).send(z.daten);
  });
}
