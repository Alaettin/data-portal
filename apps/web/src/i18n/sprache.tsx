/**
 * Zweisprachigkeit ohne Bibliothek: zwei Textdateien mit denselben Schluesseln, ein Kontext
 * mit der gewaehlten Sprache. Die Wahl liegt im localStorage (nur Bequemlichkeit, ohne ihn
 * entscheidet die Browsersprache).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { de, type Schluessel } from "./de.ts";
import { en } from "./en.ts";

export type Sprache = "de" | "en";
const TEXTE: Record<Sprache, Record<Schluessel, string>> = { de, en };
const SPEICHER = "adp.sprache";

type Werte = Record<string, string | number>;

export type Uebersetzer = {
  sprache: Sprache;
  setzeSprache: (s: Sprache) => void;
  t: (s: Schluessel, werte?: Werte) => string;
  /** Fehlercode vom Server in Klartext; Unbekanntes faellt auf die allgemeine Meldung. */
  fehler: (code: string, werte?: Werte) => string;
  zahl: (n: number) => string;
  datum: (iso: string) => string;
  datumZeit: (iso: string) => string;
  uhrzeit: (iso: string) => string;
  vorWann: (iso: string) => string;
  tag: (iso: string) => string;
};

function anfangssprache(): Sprache {
  try {
    const gespeichert = localStorage.getItem(SPEICHER);
    if (gespeichert === "de" || gespeichert === "en") return gespeichert;
  } catch {
    /* privates Fenster: dann eben die Browsersprache */
  }
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

function einsetzen(text: string, werte?: Werte): string {
  return werte ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(werte[k] ?? `{${k}}`)) : text;
}

const Kontext = createContext<Uebersetzer | null>(null);

export function SprachAnbieter({ children }: { children: ReactNode }) {
  const [sprache, setzeSpracheRoh] = useState<Sprache>(anfangssprache);

  useEffect(() => {
    document.documentElement.lang = sprache;
  }, [sprache]);

  const setzeSprache = useCallback((s: Sprache) => {
    setzeSpracheRoh(s);
    try {
      localStorage.setItem(SPEICHER, s);
    } catch {
      /* nicht schlimm */
    }
  }, []);

  const wert = useMemo<Uebersetzer>(() => {
    const ort = sprache === "en" ? "en-GB" : "de-DE";
    const rel = new Intl.RelativeTimeFormat(ort, { numeric: "auto" });
    const t = (s: Schluessel, w?: Werte) => einsetzen(TEXTE[sprache][s], w);
    const datum = (iso: string) => new Date(iso).toLocaleDateString(ort, { day: "2-digit", month: "2-digit", year: "numeric" });
    return {
      sprache,
      setzeSprache,
      t,
      fehler: (code, w) => {
        const s = `fehler.${code}` as Schluessel;
        return s in TEXTE[sprache] ? t(s, w) : t("fehler.allgemein", { status: code, ...w });
      },
      zahl: (n) => n.toLocaleString(ort),
      datum,
      datumZeit: (iso) =>
        new Date(iso).toLocaleString(ort, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      uhrzeit: (iso) => new Date(iso).toLocaleTimeString(ort, { hour: "2-digit", minute: "2-digit" }),
      vorWann: (iso) => {
        const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
        const abs = Math.abs(s);
        if (abs < 45) return t("allg.gerade");
        if (abs < 3600) return rel.format(Math.round(s / 60), "minute");
        if (abs < 86400) return rel.format(Math.round(s / 3600), "hour");
        if (abs < 86400 * 30) return rel.format(Math.round(s / 86400), "day");
        return datum(iso);
      },
      tag: (iso) => {
        const d = new Date(iso);
        if (d.toDateString() === new Date().toDateString()) return t("allg.heute");
        if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return t("allg.gestern");
        return d.toLocaleDateString(ort, { weekday: "long", day: "numeric", month: "long" });
      },
    };
  }, [sprache, setzeSprache]);

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useT(): Uebersetzer {
  const k = useContext(Kontext);
  if (!k) throw new Error("useT ausserhalb von SprachAnbieter");
  return k;
}
