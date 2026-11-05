/**
 * HTTP-Abruf mit Zeitlimit, Drossel und lesbaren Fehlern (Muster aus DTI Proxy, schaleLaden()).
 * Die Fehlertexte landen in der Oberflaeche, deshalb auf Deutsch und ohne Stacktrace.
 */

export class AbrufFehler extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/**
 * 60 s statt 10 s: Der P+F-Testserver antwortete am 04.11.2026 einzeln gemessen mit Shell
 * 6,5 s, Thumbnail 9,6 s, Teilmodellen 2,5 bis 13,3 s; unter der Drossel noch langsamer.
 * Mit 10 s lief jeder Teilmodellabruf ins Leere. Was trotzdem scheitert, holt `nachholen`.
 */
const ZEITLIMIT_MS = 60_000;

/**
 * Hoechstens so viele Anfragen gleichzeitig nach aussen. Mit 24 parallelen Abrufen beim
 * Nachlesen antwortete das RC-Repository nicht mehr innerhalb des Zeitlimits (31.10.2026).
 */
const GLEICHZEITIG = 4;
let aktiv = 0;
const wartend: (() => void)[] = [];

async function gedrosselt<T>(arbeit: () => Promise<T>): Promise<T> {
  if (aktiv >= GLEICHZEITIG) await new Promise<void>((weiter) => wartend.push(weiter));
  aktiv++;
  try {
    return await arbeit();
  } finally {
    aktiv--;
    wartend.shift()?.();
  }
}

type Antwort = { status: number; ok: boolean; typ: string; koerper: Buffer };

/** Holt Kopf und Koerper innerhalb von Drossel und Zeitlimit. */
function roh(url: string, holen: typeof fetch): Promise<Antwort> {
  return gedrosselt(async () => {
    const abbruch = new AbortController();
    const wecker = setTimeout(() => abbruch.abort(), ZEITLIMIT_MS);
    try {
      const a = await holen(url, { signal: abbruch.signal, headers: { accept: "application/json, image/*, */*;q=0.8" } });
      const koerper = Buffer.from(await a.arrayBuffer());
      return { status: a.status, ok: a.ok, typ: a.headers.get("content-type") ?? "", koerper };
    } catch (fehler) {
      const abgebrochen = fehler instanceof Error && fehler.name === "AbortError";
      throw new AbrufFehler(
        abgebrochen
          ? `Keine Antwort innerhalb von ${ZEITLIMIT_MS / 1000} s`
          : `Nicht erreichbar: ${fehler instanceof Error ? fehler.message : String(fehler)}`,
      );
    } finally {
      clearTimeout(wecker);
    }
  });
}

export async function json<T>(url: string, holen: typeof fetch = fetch): Promise<T> {
  const antwort = await roh(url, holen);
  const text = antwort.koerper.toString("utf8");
  if (!antwort.ok) {
    let grund = "";
    try {
      const j = JSON.parse(text) as { Message?: string; title?: string };
      grund = j.Message ?? j.title ?? "";
    } catch {
      /* kein JSON, Status reicht */
    }
    throw new AbrufFehler(`Antwort ${antwort.status}${grund ? `: ${grund}` : ""}`, antwort.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AbrufFehler("Antwort ist kein JSON", antwort.status);
  }
}

const HOECHSTENS_ANHANG = 50 * 1024 * 1024;

/**
 * Ein Anhang beliebigen Typs (PDF, Bild …) zum Durchreichen an den Browser. Wirft mit Status,
 * damit die Route "beim Hersteller nicht verfuegbar" sagen kann statt still nichts zu liefern.
 */
export async function anhang(url: string, holen: typeof fetch = fetch): Promise<{ daten: Buffer; typ: string }> {
  const antwort = await roh(url, holen);
  if (!antwort.ok) throw new AbrufFehler(`Antwort ${antwort.status}`, antwort.status);
  if (antwort.koerper.length > HOECHSTENS_ANHANG) throw new AbrufFehler("Datei zu gross", 413);
  return { daten: antwort.koerper, typ: antwort.typ || "application/octet-stream" };
}

export async function datei(url: string, holen: typeof fetch = fetch): Promise<{ daten: Buffer; typ: string } | null> {
  try {
    const antwort = await roh(url, holen);
    if (!antwort.ok || !antwort.typ.startsWith("image/")) return null;
    return { daten: antwort.koerper, typ: antwort.typ };
  } catch {
    return null;
  }
}
