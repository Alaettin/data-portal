/**
 * Server-Sent Events an alle offenen Browser. Mit Puls alle 15 s, sonst schliessen Proxys
 * (Vite, Sliplane) die ruhende Verbindung (siehe Memory "SSE braucht einen Puls").
 *
 * Der Strom ist oeffentlich und traegt deshalb nur Signale, keine Daten: was sich geaendert
 * hat, laedt jeder Browser selbst nach, in seiner Sprache und mit seinen Rechten. Feed-URLs
 * und Fehlertexte der Endpunkte gehen so nie an Besucher.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

export type AssetSchluessel = { endpunktId: number; itemId: string };

export type Nachricht =
  | { typ: "events"; anzahl: number; registriert: AssetSchluessel[] }
  | { typ: "takt"; endpunktId: number }
  | { typ: "bestand" };

export class Strom {
  private readonly hoerer = new Set<FastifyReply>();
  private readonly puls: NodeJS.Timeout;

  constructor() {
    this.puls = setInterval(() => this.schreiben(": puls\n\n"), 15_000);
    this.puls.unref();
  }

  anmelden(req: FastifyRequest, reply: FastifyReply) {
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    reply.raw.write(": verbunden\n\n");
    this.hoerer.add(reply);
    req.socket.on("close", () => this.hoerer.delete(reply));
  }

  senden(n: Nachricht) {
    this.schreiben(`data: ${JSON.stringify(n)}\n\n`);
  }

  schliessen() {
    clearInterval(this.puls);
    for (const r of this.hoerer) r.raw.end();
    this.hoerer.clear();
  }

  private schreiben(zeile: string) {
    for (const r of this.hoerer) {
      try {
        r.raw.write(zeile);
      } catch {
        this.hoerer.delete(r);
      }
    }
  }
}
