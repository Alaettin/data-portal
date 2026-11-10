import type { ReactNode } from "react";
import { cn } from "./basis.tsx";

/**
 * Aktionen in Tabellenzeilen als Symbole, aus der HMI-App (messeapp/client/src/bausteine/symbole.tsx).
 * Die Beschriftung steht im `aria-label` und im `title`.
 */

const PFADE = {
  bearbeiten: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  loeschen: (
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  /** Inhalt leeren, die Huelle bleibt: Kiste mit Strich (alle Assets loeschen). */
  leeren: (
    <>
      <path d="M21 8v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8" />
      <path d="M1 3h22v5H1z" />
      <path d="M9 13h6" />
    </>
  ),
  passwort: (
    <>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </>
  ),
  sperren: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  entsperren: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  oeffnen: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  lesen: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type Symbol = keyof typeof PFADE;

export function Symbolknopf({
  symbol,
  beschriftung,
  onClick,
  disabled,
  gefahr = false,
}: {
  symbol: Symbol;
  beschriftung: string;
  onClick?: () => void;
  disabled?: boolean;
  gefahr?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={beschriftung}
      title={beschriftung}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-text-hinweis transition-colors",
        "hover:bg-black/5 hover:text-text disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent",
        gefahr && "hover:text-fehler",
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PFADE[symbol]}
      </svg>
    </button>
  );
}

/** Die Reihe der Symbole: nie umbrechen, rechtsbuendig. */
export function Symbolreihe({ children }: { children: ReactNode }) {
  return <span className="flex flex-nowrap items-center justify-end gap-1">{children}</span>;
}
