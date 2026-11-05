import type { FastifyInstance } from "fastify";

/**
 * Sicherheitskopfzeilen auf jeder Antwort, uebernommen aus dem AXON Connector.
 *
 * Der `onSend`-Haken trifft **alle** Antworten, auch die statischen Dateien und den
 * SPA-Rueckfall; ein preHandler wuerde die statische Auslieferung verpassen. Die CSP gilt
 * damit auch fuer hochgeladene SVG-Logos: Skripte darin laufen nicht.
 */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Radix setzt Stile direkt am Element.
  "style-src 'self' 'unsafe-inline'",
  // data: fuer die Logo-Vorschau im Formular, bevor gespeichert ist.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function installiereSicherheitskopfzeilen(app: FastifyInstance, produktion: boolean): void {
  app.addHook("onSend", (_req, reply, nutzlast, fertig) => {
    void reply.header("content-security-policy", CSP);
    void reply.header("x-frame-options", "DENY");
    void reply.header("x-content-type-options", "nosniff");
    void reply.header("referrer-policy", "strict-origin-when-cross-origin");
    void reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    // HSTS nur in Produktion: im Entwickeln laeuft alles ueber http auf localhost.
    if (produktion) void reply.header("strict-transport-security", "max-age=31536000");
    fertig(null, nutzlast);
  });
}
