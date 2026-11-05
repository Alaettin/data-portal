/**
 * Backoffice einer Organisation unter `/api/backoffice/:orgId`. Alle Nutzer der Organisation
 * sehen und bearbeiten dasselbe; der Hauptadmin darf jede Organisation oeffnen.
 * Endpunkte und Assets werden immer zusammen mit der Organisation gesucht, nie allein ueber
 * ihre ID: eine fremde ID ist 404, wie eine nicht vorhandene.
 */

import type { FastifyInstance } from "fastify";
import { submodelAnzeigename, submodelNameVon, type FeedSeite } from "@datenportal/core";
import {
  endpunktAnsicht,
  EVENT_SQL,
  eventAnsicht,
  eventsLesen,
  kennzahlen,
  organisationAnsicht,
  type EndpunktZeile,
  type EventMitKontext,
  type OrganisationZeile,
} from "../ansicht.ts";
import { angemeldet, organisationPruefen, organisationVon } from "../auth/waechter.ts";
import { jetzt } from "../db.ts";
import { json } from "../holen.ts";
import { feedSeitenUrl } from "../takt.ts";
import { assetNeuAbrufen, neuerLauf, teilmodellNeuAbrufen } from "../verarbeitung.ts";
import { Eingabefehler, email, farbe, intervall, logo, pflichttext, sprache, textOderNull, webadresse } from "./hilfen.ts";
import type { Kontext } from "./kontext.ts";

type EndpunktKoerper = { name?: string; feedUrl?: string; intervallS?: number; aktiv?: boolean };
type ProfilKoerper = {
  farbe?: string;
  oeffentlich?: boolean;
  beschreibungDe?: string;
  beschreibungEn?: string;
  webseite?: string;
  kontaktEmail?: string;
  logo?: string | null;
};

export function backofficeRouten(app: FastifyInstance, k: Kontext) {
  const { db } = k;

  app.register(async (bereich) => {
    bereich.addHook("preHandler", angemeldet(db));
    bereich.addHook("preHandler", organisationPruefen(db));
    bereich.setErrorHandler((f, _req, reply) => {
      if (f instanceof Eingabefehler) return reply.code(400).send({ fehler: f.code });
      return reply.send(f);
    });

    const endpunkt = (orgId: number, id: number) =>
      db.prepare("SELECT * FROM endpunkte WHERE id = ? AND organisation_id = ?").get(id, orgId) as EndpunktZeile | undefined;
    const endpunkteVon = (orgId: number) =>
      (db.prepare("SELECT * FROM endpunkte WHERE organisation_id = ? ORDER BY id").all(orgId) as EndpunktZeile[]).map((e) =>
        endpunktAnsicht(db, e, k.takt.liest(e.id)),
      );

    bereich.get("/api/backoffice/:orgId", async (req) => {
      const orgId = organisationVon(req);
      const o = db.prepare("SELECT * FROM organisationen WHERE id = ?").get(orgId) as OrganisationZeile;
      return {
        organisation: organisationAnsicht(o, sprache(req), true),
        kennzahlen: kennzahlen(db, orgId),
        endpunkte: endpunkteVon(orgId),
      };
    });

    bereich.patch<{ Body: ProfilKoerper }>("/api/backoffice/:orgId/profil", async (req) => {
      const orgId = organisationVon(req);
      const b = req.body ?? {};
      const alt = db.prepare("SELECT * FROM organisationen WHERE id = ?").get(orgId) as OrganisationZeile;
      const neuesLogo = logo(b.logo);
      db.prepare(
        `UPDATE organisationen SET farbe=?, oeffentlich=?, beschreibung_de=?, beschreibung_en=?, webseite=?, kontakt_email=? WHERE id=?`,
      ).run(
        farbe(b.farbe, alt.farbe),
        b.oeffentlich === undefined ? alt.oeffentlich : b.oeffentlich ? 1 : 0,
        textOderNull(b.beschreibungDe),
        textOderNull(b.beschreibungEn),
        textOderNull(b.webseite) === null ? null : webadresse(b.webseite, "webseite-ungueltig"),
        textOderNull(b.kontaktEmail) === null ? null : email(b.kontaktEmail),
        orgId,
      );
      if (neuesLogo === null) db.prepare("UPDATE organisationen SET logo=NULL, logo_typ=NULL WHERE id=?").run(orgId);
      else if (neuesLogo) db.prepare("UPDATE organisationen SET logo=?, logo_typ=? WHERE id=?").run(neuesLogo.daten, neuesLogo.typ, orgId);
      k.strom.senden({ typ: "bestand" });
      const o = db.prepare("SELECT * FROM organisationen WHERE id = ?").get(orgId) as OrganisationZeile;
      return organisationAnsicht(o, sprache(req), true);
    });

    /**
     * Ereignisprotokoll der eigenen Organisation. Gefiltert wird am Event-Typ selbst
     * (`io.admin-shell.aas.created.v1` …), damit auch kuenftige Typen wie `aas.updated` greifen.
     */
    bereich.get<{ Querystring: { objekt?: string; aktion?: string; vor?: string; limit?: string } }>(
      "/api/backoffice/:orgId/ereignisse",
      async (req) => {
        const orgId = organisationVon(req);
        const { objekt, aktion } = req.query;
        const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
        const wo = ["ep.organisation_id = ?", "e.lfd < ?"];
        const werte: unknown[] = [orgId, Number(req.query.vor ?? Number.MAX_SAFE_INTEGER) || Number.MAX_SAFE_INTEGER];
        if (objekt === "aas") wo.push("e.typ LIKE '%.aas.%'");
        else if (objekt === "submodel") wo.push("e.typ LIKE '%.submodel.%'");
        else if (objekt === "pcn") wo.push("e.art = 'pcn'");
        if (objekt !== "pcn") {
          if (aktion === "created") wo.push("e.typ LIKE '%.created.%'");
          else if (aktion === "updated") wo.push("e.typ LIKE '%.updated.%'");
        }
        return eventsLesen(db, `WHERE ${wo.join(" AND ")}`, werte, sprache(req), `ORDER BY e.lfd DESC LIMIT ${limit}`);
      },
    );

    bereich.get<{ Params: { lfd: string } }>("/api/backoffice/:orgId/ereignisse/:lfd", async (req, reply) => {
      const z = db.prepare(`${EVENT_SQL} WHERE e.lfd = ? AND ep.organisation_id = ?`).get(Number(req.params.lfd), organisationVon(req)) as
        | EventMitKontext
        | undefined;
      return z ? eventAnsicht(z, sprache(req), true) : reply.code(404).send({ fehler: "nicht-gefunden" });
    });

    /** Eine Seite des Feeds probeweise lesen, ohne etwas zu speichern. */
    bereich.post<{ Body: { feedUrl?: string } }>("/api/backoffice/:orgId/endpunkte/test", async (req, reply) => {
      const url = webadresse(req.body?.feedUrl);
      try {
        const seite = await json<FeedSeite>(feedSeitenUrl(url, null), k.holen);
        if (!Array.isArray(seite.records)) return reply.code(422).send({ fehler: "kein-feed" });
        const typen: Record<string, number> = {};
        for (const e of seite.records) typen[e.type] = (typen[e.type] ?? 0) + 1;
        return { ok: true, anzahl: seite.records.length, mehr: !!seite.cursor || seite.records.length === 50, typen };
      } catch (f) {
        return reply.code(422).send({ fehler: "nicht-erreichbar", grund: f instanceof Error ? f.message : String(f) });
      }
    });

    bereich.post<{ Body: EndpunktKoerper }>("/api/backoffice/:orgId/endpunkte", async (req, reply) => {
      const orgId = organisationVon(req);
      const b = req.body ?? {};
      const z = db
        .prepare("INSERT INTO endpunkte (organisation_id, name, feed_url, intervall_s, aktiv, angelegt) VALUES (?, ?, ?, ?, ?, ?) RETURNING *")
        .get(orgId, pflichttext(b.name, "name-fehlt"), webadresse(b.feedUrl), intervall(b.intervallS), b.aktiv === false ? 0 : 1, jetzt()) as EndpunktZeile;
      if (z.aktiv === 1) void k.takt.lesen(z.id);
      return reply.code(201).send(endpunktAnsicht(db, z, z.aktiv === 1));
    });

    bereich.patch<{ Params: { id: string }; Body: EndpunktKoerper }>("/api/backoffice/:orgId/endpunkte/:id", async (req, reply) => {
      const orgId = organisationVon(req);
      const id = Number(req.params.id);
      const alt = endpunkt(orgId, id);
      if (!alt) return reply.code(404).send({ fehler: "nicht-gefunden" });
      const b = req.body ?? {};
      const feedUrl = b.feedUrl === undefined ? alt.feed_url : webadresse(b.feedUrl);
      db.prepare("UPDATE endpunkte SET name=?, feed_url=?, intervall_s=?, aktiv=? WHERE id=?").run(
        b.name === undefined ? alt.name : pflichttext(b.name, "name-fehlt"),
        feedUrl,
        b.intervallS === undefined ? alt.intervall_s : intervall(b.intervallS),
        b.aktiv === undefined ? alt.aktiv : b.aktiv ? 1 : 0,
        id,
      );
      // Eine neue Adresse ist ein neuer Feed: die gelesene Position gilt dort nicht.
      if (feedUrl !== alt.feed_url) db.prepare("UPDATE endpunkte SET letzte_event_id=NULL, letzter_fehler=NULL WHERE id=?").run(id);
      const jetztAktiv = (b.aktiv ?? alt.aktiv === 1) === true;
      if (jetztAktiv && (alt.aktiv === 0 || feedUrl !== alt.feed_url)) void k.takt.lesen(id);
      else k.takt.planen(id);
      return endpunktAnsicht(db, endpunkt(orgId, id)!, k.takt.liest(id));
    });

    bereich.post<{ Params: { id: string } }>("/api/backoffice/:orgId/endpunkte/:id/lesen", async (req, reply) => {
      const e = endpunkt(organisationVon(req), Number(req.params.id));
      if (!e) return reply.code(404).send({ fehler: "nicht-gefunden" });
      return { neu: await k.takt.lesen(e.id) };
    });

    /** Bestand dieses Endpunkts verwerfen und den Feed von vorn lesen. */
    bereich.post<{ Params: { id: string } }>("/api/backoffice/:orgId/endpunkte/:id/neu-einlesen", async (req, reply) => {
      const e = endpunkt(organisationVon(req), Number(req.params.id));
      if (!e) return reply.code(404).send({ fehler: "nicht-gefunden" });
      db.transaction(() => {
        for (const t of ["events", "assets", "submodelle", "pcns"]) db.prepare(`DELETE FROM ${t} WHERE endpunkt_id=?`).run(e.id);
        db.prepare("UPDATE endpunkte SET letzte_event_id=NULL, letzter_fehler=NULL WHERE id=?").run(e.id);
      })();
      k.strom.senden({ typ: "bestand" });
      if (e.aktiv === 1) void k.takt.lesen(e.id);
      return { ok: true };
    });

    bereich.delete<{ Params: { id: string } }>("/api/backoffice/:orgId/endpunkte/:id", async (req, reply) => {
      const e = endpunkt(organisationVon(req), Number(req.params.id));
      if (!e) return reply.code(404).send({ fehler: "nicht-gefunden" });
      k.takt.entfernen(e.id);
      db.prepare("DELETE FROM endpunkte WHERE id=?").run(e.id);
      k.strom.senden({ typ: "bestand" });
      return { ok: true };
    });

    /** Anzeigename je Teilmodell aus dem gespeicherten Stand, fuer den Bericht. */
    const teilmodellName = (eid: number, item: string, smId: string, s: ReturnType<typeof sprache>) => {
      const z = db.prepare("SELECT semantic_id, id_short FROM submodelle WHERE endpunkt_id=? AND item_id=? AND submodel_id=?").get(eid, item, smId) as
        | { semantic_id: string | null; id_short: string | null }
        | undefined;
      return submodelAnzeigename(z?.semantic_id ?? null, z?.id_short ?? submodelNameVon(smId) ?? null, s);
    };

    /**
     * Das ganze Asset beim Hersteller neu abrufen (Shell, Bild, alle Teilmodelle) und je Teil
     * berichten, was geklappt hat und warum nicht. Die Organisation muss den Endpunkt besitzen.
     */
    bereich.post<{ Params: { eid: string; item: string } }>("/api/backoffice/:orgId/assets/:eid/:item/abrufen", async (req, reply) => {
      const e = endpunkt(organisationVon(req), Number(req.params.eid));
      if (!e) return reply.code(404).send({ fehler: "nicht-gefunden" });
      const item = req.params.item;
      const bericht = await assetNeuAbrufen(db, neuerLauf(k.holen), e.id, item);
      if (!bericht) return reply.code(404).send({ fehler: "nicht-gefunden" });
      k.strom.senden({ typ: "bestand" });
      const s = sprache(req);
      return {
        shell: bericht.shell,
        bild: bericht.bild,
        teilmodelle: bericht.teilmodelle.map((t) => ({ ...t, name: teilmodellName(e.id, item, t.id, s) })),
      };
    });

    bereich.post<{ Params: { eid: string; item: string }; Querystring: { sm?: string } }>(
      "/api/backoffice/:orgId/assets/:eid/:item/teilmodelle/abrufen",
      async (req, reply) => {
        const e = endpunkt(organisationVon(req), Number(req.params.eid));
        if (!e) return reply.code(404).send({ fehler: "nicht-gefunden" });
        const sm = req.query.sm ?? "";
        const r = await teilmodellNeuAbrufen(db, neuerLauf(k.holen), e.id, req.params.item, sm);
        if (!r) return reply.code(404).send({ fehler: "nicht-gefunden" });
        k.strom.senden({ typ: "bestand" });
        return { id: sm, name: teilmodellName(e.id, req.params.item, sm, sprache(req)), fehler: r.fehler };
      },
    );

    bereich.delete<{ Params: { eid: string; item: string } }>("/api/backoffice/:orgId/assets/:eid/:item", async (req, reply) => {
      const e = endpunkt(organisationVon(req), Number(req.params.eid));
      if (!e) return reply.code(404).send({ fehler: "nicht-gefunden" });
      db.transaction(() => {
        for (const t of ["events", "assets", "submodelle", "pcns"]) {
          db.prepare(`DELETE FROM ${t} WHERE endpunkt_id=? AND item_id=?`).run(e.id, req.params.item);
        }
      })();
      k.strom.senden({ typ: "bestand" });
      return { ok: true };
    });
  });
}
