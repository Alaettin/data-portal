/**
 * Mehrsprachige Texte lesen. Es gibt zwei Formen:
 * - Feed (PCN-Record): `[{ "en": "…" }, { "de": "…" }]`
 * - AAS (MultiLanguageProperty, description): `[{ "language": "en", "text": "…" }]`
 *
 * Gewaehlt wird erst die Wunschsprache der Reihe nach, dann irgendein nicht leerer Text.
 * Der Vergleich beachtet nur den Sprachteil, damit "de-DE" auf "de" passt.
 */

export const SPRACHEN = ["de", "en"] as const;
export type Sprache = (typeof SPRACHEN)[number];

/** Wunschsprache zuerst, die andere als Rueckfall. */
export function sprachfolge(s: Sprache): readonly string[] {
  return s === "en" ? ["en", "de"] : ["de", "en"];
}

/** Unbekanntes wird Deutsch, damit ein falscher Parameter nie einen Fehler ausloest. */
export function spracheVon(wert: unknown): Sprache {
  return wert === "en" ? "en" : "de";
}

type Eintrag = { sprache: string; text: string };

function eintraege(wert: unknown): Eintrag[] {
  if (!Array.isArray(wert)) return [];
  const liste: Eintrag[] = [];
  for (const e of wert) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o["language"] === "string" && typeof o["text"] === "string") {
      liste.push({ sprache: o["language"], text: o["text"] });
      continue;
    }
    for (const [sprache, text] of Object.entries(o)) {
      if (typeof text === "string") liste.push({ sprache, text });
    }
  }
  return liste;
}

export function text(wert: unknown, sprachen: readonly string[] = SPRACHEN): string | null {
  if (typeof wert === "string") return wert.length > 0 ? wert : null;
  const liste = eintraege(wert).filter((e) => e.text.length > 0);
  for (const wunsch of sprachen) {
    const treffer = liste.find((e) => e.sprache.toLowerCase().split("-")[0] === wunsch);
    if (treffer) return treffer.text;
  }
  return liste[0]?.text ?? null;
}
