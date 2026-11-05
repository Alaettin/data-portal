/**
 * Die App ohne Port und ohne Takt-Start, damit Tests sie per `inject` pruefen koennen.
 */

import fastifyCookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DB } from "./db.ts";
import { backofficeRouten } from "./routen/backoffice.ts";
import { kontoRouten } from "./routen/konto.ts";
import { oeffentlicheRouten } from "./routen/oeffentlich.ts";
import { verwaltungRouten } from "./routen/verwaltung.ts";
import { installiereSicherheitskopfzeilen } from "./sicherheitskopfzeilen.ts";
import { Strom } from "./strom.ts";
import { Takt } from "./takt.ts";

export type Optionen = {
  db: DB;
  holen?: typeof fetch;
  produktion?: boolean;
  protokoll?: boolean;
};

export async function baueApp(o: Optionen) {
  const app = Fastify({
    logger: o.protokoll === false ? false : { level: process.env["LOG_LEVEL"] ?? "info", redact: ["req.headers.cookie"] },
    bodyLimit: 2 * 1024 * 1024,
    // Genau ein Proxy davor (Sliplane bzw. Vite): sonst liesse sich die IP der
    // Anmeldedrossel ueber X-Forwarded-For faelschen.
    // Als Funktion, weil die Typen dieser Fastify-Fassung keine Zahl annehmen; gleichbedeutend mit 1.
    trustProxy: (_adresse: string, sprung: number) => sprung < 1,
  });
  const holen = o.holen ?? fetch;
  const strom = new Strom();
  const takt = new Takt(o.db, strom, holen);
  const kontext = { db: o.db, strom, takt, holen };

  installiereSicherheitskopfzeilen(app, o.produktion ?? false);
  await app.register(fastifyCookie);
  // Vor allen Routen, die `config.rateLimit` tragen; `preHandler`, damit der Koerper schon gelesen ist.
  await app.register(rateLimit, { global: false, hook: "preHandler" });

  oeffentlicheRouten(app, kontext);
  kontoRouten(app, kontext);
  backofficeRouten(app, kontext);
  verwaltungRouten(app, kontext);

  // Gebaute Oberflaeche ausliefern (Produktion). Im Entwickeln liefert Vite.
  const web = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(web)) {
    await app.register(fastifyStatic, { root: web });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") ? reply.code(404).send({ fehler: "nicht-gefunden" }) : reply.sendFile("index.html", join(web)),
    );
  }

  app.addHook("onClose", async () => {
    takt.anhalten();
    strom.schliessen();
  });

  return { app, takt, strom };
}
