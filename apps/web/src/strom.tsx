/**
 * Live-Anbindung: eine EventSource fuer die ganze App. Der Strom traegt nur Signale; Daten
 * laedt `useDaten` bei jeder Bestandsaenderung neu, in der gewaehlten Sprache.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, mitSprache } from "./api.ts";
import { useT } from "./i18n/sprache.tsx";

type Schluessel = { endpunktId: number; itemId: string };

export type Nachricht =
  | { typ: "events"; anzahl: number; registriert: Schluessel[] }
  | { typ: "takt"; endpunktId: number }
  | { typ: "bestand" };

type Hoerer = (n: Nachricht) => void;

type Strom = {
  verbunden: boolean;
  /** Steigt bei jeder Aenderung am Bestand, zum Neuladen abhaengiger Daten. */
  stand: number;
  /** Assets, die seit dem Oeffnen der Seite registriert wurden: `endpunktId/itemId`. */
  frisch: ReadonlySet<string>;
  anmelden: (h: Hoerer) => () => void;
  /** Von Hand neu laden, etwa nach einer eigenen Aenderung. */
  auffrischen: () => void;
};

const Kontext = createContext<Strom | null>(null);

export const frischSchluessel = (a: Schluessel) => `${a.endpunktId}/${a.itemId}`;

export function StromAnbieter({ children }: { children: ReactNode }) {
  const hoerer = useRef(new Set<Hoerer>());
  const [verbunden, setVerbunden] = useState(false);
  const [stand, setStand] = useState(0);
  const [frisch, setFrisch] = useState<ReadonlySet<string>>(new Set());
  const zeitgeber = useRef<number | null>(null);

  const auffrischen = useCallback(() => setStand((s) => s + 1), []);

  useEffect(() => {
    const quelle = new EventSource("/api/strom");
    quelle.onopen = () => setVerbunden(true);
    quelle.onerror = () => setVerbunden(false);
    quelle.onmessage = (m) => {
      const n = JSON.parse(m.data as string) as Nachricht;
      for (const h of hoerer.current) h(n);
      if (n.typ === "events" && n.registriert.length > 0) {
        setFrisch((alt) => new Set([...alt, ...n.registriert.map(frischSchluessel)]));
      }
      // Viele Meldungen kurz hintereinander nur einmal neu laden. Auch "takt", damit das
      // Backoffice "liest gerade" und den naechsten Abruf aktuell zeigt.
      if (zeitgeber.current === null) {
        zeitgeber.current = window.setTimeout(() => {
          zeitgeber.current = null;
          setStand((s) => s + 1);
        }, 400);
      }
    };
    return () => quelle.close();
  }, []);

  const anmelden = useCallback((h: Hoerer) => {
    hoerer.current.add(h);
    return () => {
      hoerer.current.delete(h);
    };
  }, []);

  return <Kontext.Provider value={{ verbunden, stand, frisch, anmelden, auffrischen }}>{children}</Kontext.Provider>;
}

export function useStrom(): Strom {
  const s = useContext(Kontext);
  if (!s) throw new Error("useStrom ausserhalb von StromAnbieter");
  return s;
}

/**
 * Laedt Daten und laedt sie bei jeder Bestandsaenderung und jedem Sprachwechsel neu.
 * Kein Spiegelzustand: zurueck kommt nur das Ergebnis zum aktuellen Pfad. Waehrend des
 * Nachladens bleibt das vorige Ergebnis desselben Pfads stehen, damit Listen nicht flackern.
 */
export function useDaten<T>(pfad: string | null): {
  daten: T | null;
  fehler: string | null;
  laedt: boolean;
  /** Das letzte Ergebnis, auch zu einem frueheren Pfad: fuer Listen, die beim Filtern stehen bleiben sollen. */
  letzte: T | null;
} {
  const { stand } = useStrom();
  const { sprache } = useT();
  const voll = pfad === null ? null : mitSprache(pfad, sprache);
  const [ergebnis, setErgebnis] = useState<{ pfad: string | null; daten: T | null; fehler: string | null }>({
    pfad: null,
    daten: null,
    fehler: null,
  });

  useEffect(() => {
    if (!voll) return;
    let aktiv = true;
    api<T>(voll).then(
      (daten) => aktiv && setErgebnis({ pfad: voll, daten, fehler: null }),
      (f: unknown) => aktiv && setErgebnis((e) => ({ ...e, pfad: voll, fehler: f instanceof Error ? f.message : String(f) })),
    );
    return () => {
      aktiv = false;
    };
  }, [voll, stand]);

  const passend = ergebnis.pfad === voll;
  return { daten: passend ? ergebnis.daten : null, fehler: passend ? ergebnis.fehler : null, laedt: !passend, letzte: ergebnis.daten };
}
