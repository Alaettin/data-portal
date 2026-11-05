import type { FastifyReply, FastifyRequest } from "fastify";
import type { DB } from "../db.ts";
import { nutzerAusSitzung, type Nutzer } from "./sitzung.ts";

declare module "fastify" {
  interface FastifyRequest {
    nutzer?: Nutzer;
    /** Die Organisation, auf die eine Backoffice-Anfrage zielt; nur nach `organisationPruefen`. */
    organisationId?: number;
  }
}

/** Nutzer der Anfrage; wirft, wenn der Waechter davor nicht lief (Fehler schliesst, oeffnet nie). */
export function nutzerVon(req: FastifyRequest): Nutzer {
  if (!req.nutzer) throw new Error("Waechter fehlt vor dieser Route");
  return req.nutzer;
}

export function organisationVon(req: FastifyRequest): number {
  if (req.organisationId === undefined) throw new Error("Organisationspruefung fehlt vor dieser Route");
  return req.organisationId;
}

export function angemeldet(db: DB) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const n = nutzerAusSitzung(db, req);
    if (!n) return reply.code(401).send({ fehler: "nicht-angemeldet" });
    req.nutzer = n;
  };
}

/**
 * Nur der Hauptadmin. Ein Organisationsnutzer bekommt 404 statt 403, damit die Verwaltung
 * nach aussen nicht als vorhanden erscheint.
 */
export function nurAdmin() {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (nutzerVon(req).rolle !== "admin") return reply.code(404).send({ fehler: "nicht-gefunden" });
  };
}

/**
 * `:orgId` aus dem Pfad gegen den Nutzer pruefen. Der Admin darf jede Organisation oeffnen,
 * ein Organisationsnutzer nur die eigene; fremde Organisationen sind 404, nicht 403.
 */
export function organisationPruefen(db: DB) {
  return async (req: FastifyRequest<{ Params: { orgId?: string } }>, reply: FastifyReply) => {
    const n = nutzerVon(req);
    const id = Number(req.params.orgId);
    const gibtEs = Number.isInteger(id) && db.prepare("SELECT 1 FROM organisationen WHERE id = ?").get(id);
    if (!gibtEs || (n.rolle !== "admin" && n.organisationId !== id)) {
      return reply.code(404).send({ fehler: "nicht-gefunden" });
    }
    req.organisationId = id;
  };
}
