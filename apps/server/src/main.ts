import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { baueApp } from "./app.ts";
import { hauptadminSicherstellen } from "./auth/admin.ts";
import { oeffnen } from "./db.ts";

// `.env` im Repo-Wurzelordner (gitignored). Was schon in der Umgebung steht, gewinnt.
const envDatei = resolve(process.cwd(), process.env["ENV_FILE"] ?? "../../.env");
if (existsSync(envDatei)) process.loadEnvFile(envDatei);

const PORT = Number(process.env["PORT"] ?? 3300);
const HOST = process.env["HOST"] ?? "127.0.0.1";

const db = oeffnen();
const admin = await hauptadminSicherstellen(db, process.env["ADMIN_EMAIL"], process.env["ADMIN_PASSWORT"]);

const { app, takt } = await baueApp({ db, produktion: process.env["NODE_ENV"] === "production" });
if (admin === "fehlt") app.log.warn("Kein Hauptadmin: ADMIN_EMAIL und ADMIN_PASSWORT in .env setzen und neu starten");
if (admin === "angelegt") app.log.info("Hauptadmin angelegt");

await app.listen({ port: PORT, host: HOST });
takt.starten();
