/**
 * Wer angemeldet ist. Die Sitzung liegt im httpOnly-Cookie; die Oberflaeche fragt nur
 * `/api/auth/ich` und haelt nichts im localStorage.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Nutzer } from "./api.ts";

type Stand = { nutzer: Nutzer | null; organisation: { id: number; name: string; slug: string } | null };

type Konto = Stand & {
  /** Erst nach der ersten Antwort true; vorher weder "angemeldet" noch "abgemeldet". */
  geprueft: boolean;
  anmelden: (email: string, passwort: string) => Promise<Stand>;
  abmelden: () => Promise<void>;
};

const Kontext = createContext<Konto | null>(null);

export function KontoAnbieter({ children }: { children: ReactNode }) {
  const [stand, setStand] = useState<Stand>({ nutzer: null, organisation: null });
  const [geprueft, setGeprueft] = useState(false);

  useEffect(() => {
    api<Stand>("/api/auth/ich").then(
      (s) => {
        setStand(s);
        setGeprueft(true);
      },
      () => setGeprueft(true),
    );
  }, []);

  const anmelden = useCallback(async (email: string, passwort: string) => {
    const s = await api<Stand>("/api/auth/anmelden", { methode: "POST", koerper: { email, passwort } });
    setStand(s);
    return s;
  }, []);

  const abmelden = useCallback(async () => {
    await api("/api/auth/abmelden", { methode: "POST" }).catch(() => undefined);
    setStand({ nutzer: null, organisation: null });
  }, []);

  return <Kontext.Provider value={{ ...stand, geprueft, anmelden, abmelden }}>{children}</Kontext.Provider>;
}

export function useKonto(): Konto {
  const k = useContext(Kontext);
  if (!k) throw new Error("useKonto ausserhalb von KontoAnbieter");
  return k;
}

/** Startziel nach der Anmeldung: Admin in die Verwaltung, Organisation in ihr Backoffice. */
export function startziel(s: Stand): string {
  if (s.nutzer?.rolle === "admin") return "/verwaltung/organisationen";
  if (s.organisation) return `/backoffice/${s.organisation.id}`;
  return "/";
}
