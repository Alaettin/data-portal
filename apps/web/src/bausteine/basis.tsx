import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useT } from "../i18n/sprache.tsx";

/**
 * Die Bauteile nach den Design-Werten der HMI-App (messeapp/client/src/bausteine/basis.tsx).
 *
 * Flaechen, Tabellen und Eingabefelder haben **0 px Radius**; rund sind nur Knoepfe,
 * Segment-Umschalter und die Seitenumschaltung.
 */

/** Klassen zusammenfuehren, spaetere Tailwind-Klassen gewinnen. */
export function cn(...werte: ClassValue[]): string {
  return twMerge(clsx(werte));
}

export type KnopfArt = "primaer" | "rand" | "still" | "gefahr";

const KNOPF: Record<KnopfArt, string> = {
  primaer: "bg-primaer text-white hover:bg-primaer-dunkel",
  rand: "border border-text text-text hover:bg-black/5",
  still: "text-text-hinweis hover:text-text hover:bg-black/5",
  gefahr: "bg-fehler text-white hover:brightness-110",
};

/** Das Aussehen eines Knopfes, auch fuer Links und das Label um einen Datei-Auswaehler. */
export function knopfKlassen(art: KnopfArt = "primaer", className?: string): string {
  return cn(
    "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    KNOPF[art],
    className,
  );
}

export function Knopf({
  art = "primaer",
  className,
  // Immer ein type: ohne ist ein <button> im Formular ein Absendeknopf.
  type = "button",
  laedt = false,
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { art?: KnopfArt; laedt?: boolean }) {
  return (
    <button type={type} className={knopfKlassen(art, className)} disabled={disabled || laedt} {...rest}>
      {laedt && <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

const FELD = "h-11 w-full rounded-none border border-linie-feld bg-flaeche px-3 text-[15px] text-text placeholder:text-text-hinweis";

export function Feld({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FELD, className)} {...rest} />;
}

export function Auswahl({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FELD, "cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textfeld({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FELD, "h-auto min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
}

/** Beschriftung ueber einem Eingabeelement, wie in der Anmeldung. */
export function Beschriftet({ titel, hinweis, className, children }: { titel: string; hinweis?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-2 text-[13px] font-semibold", className)}>
      {titel}
      {children}
      {hinweis !== undefined && <span className="text-xs font-normal text-text-hinweis">{hinweis}</span>}
    </label>
  );
}

export function Eingabe({ titel, hinweis, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { titel: string; hinweis?: string }) {
  return (
    <Beschriftet titel={titel} hinweis={hinweis} className={className}>
      <Feld {...rest} />
    </Beschriftet>
  );
}

export function Flaeche({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={cn("bg-flaeche shadow-flaeche", className)} style={style}>
      {children}
    </div>
  );
}

/** Eine Flaeche mit Kopfzeile: Ueberschrift links, Zusatz rechts, Inhalt darunter. */
export function Abschnitt({
  titel,
  rechts,
  className,
  innen = "p-5 sm:p-6",
  children,
}: {
  titel: ReactNode;
  rechts?: ReactNode;
  className?: string;
  innen?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("bg-flaeche shadow-flaeche", className)}>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-linie px-5 py-3 sm:px-6">
        <h2 className="text-lg font-bold">{titel}</h2>
        {rechts}
      </div>
      <div className={innen}>{children}</div>
    </section>
  );
}

/** Eine Flaeche mit einer Tabelle, die ab `sm` breiter sein darf als der Bildschirm. */
export function Tabellenflaeche({ children }: { children: ReactNode }) {
  return <div className="bg-flaeche shadow-flaeche sm:overflow-x-auto">{children}</div>;
}

/** Kleine Zeile ueber der Seitenueberschrift, gruen und gesperrt wie die Marke. */
export function Augenbraue({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold tracking-[0.14em] text-primaer-dunkel uppercase">{children}</span>;
}

export function Ueberschrift({ children }: { children: ReactNode }) {
  return <h1 className="text-[32px] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">{children}</h1>;
}

/** Seitenkopf: Augenbraue, Ueberschrift, Unterzeile, rechts Handlungen. */
export function Seitenkopf({ augenbraue, titel, unter, rechts }: { augenbraue?: ReactNode; titel: ReactNode; unter?: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-[46rem] min-w-0 flex-col gap-2">
        {augenbraue !== undefined && <Augenbraue>{augenbraue}</Augenbraue>}
        <Ueberschrift>{titel}</Ueberschrift>
        {unter !== undefined && <p className="text-[15px] leading-relaxed text-text-zweit">{unter}</p>}
      </div>
      {rechts}
    </div>
  );
}

/** Tabellenkopf: 11 px, Versalien, 0,08 em Sperrung. Breiten nur mit `sm:`. */
export function Kopfzelle({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn("px-4 py-3.5 text-left text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-text-hinweis uppercase", className)}>
      {children}
    </th>
  );
}

/** Eine Zeile der Tabelle ab `sm`, darunter eine Karte. */
export function Reihe({ children, className }: { children?: ReactNode; className?: string }) {
  return <tr className={cn("max-sm:block max-sm:border-t max-sm:border-linie max-sm:py-2", className)}>{children}</tr>;
}

/** Eine Zelle. `titel` erscheint nur in der Kartenansicht unter `sm`. */
export function Zelle({ children, className, titel }: { children?: ReactNode; className?: string; titel?: string }) {
  return (
    <td
      className={cn(
        "border-t border-linie px-4 py-3",
        "max-sm:flex max-sm:items-start max-sm:justify-between max-sm:gap-4 max-sm:border-t-0 max-sm:py-1.5",
        className,
      )}
    >
      {titel !== undefined && (
        <span aria-hidden="true" className="hidden shrink-0 pt-px text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase max-sm:block">
          {titel}
        </span>
      )}
      <span className={cn("min-w-0 sm:contents", titel !== undefined ? "max-sm:text-right" : "max-sm:w-full")}>{children}</span>
    </td>
  );
}

/** Kennzahlen nebeneinander: Zahl gross, Bezeichnung klein darunter. */
export function Kennzahlenreihe({ werte, className }: { werte: { zahl: string; text: string; ton?: string }[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-px bg-linie shadow-flaeche sm:grid-cols-3 lg:grid-cols-6", className)}>
      {werte.map((w) => (
        <div key={w.text} className="flex flex-col gap-1 bg-flaeche px-5 py-4">
          <span className="text-[28px] leading-none font-bold tabular-nums" style={w.ton ? { color: w.ton } : undefined}>
            {w.zahl}
          </span>
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{w.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Status-Markierung: eckig, 22 px hoch, mit Punkt. */
export function Markierung({ text, farbe = "var(--color-primaer-dunkel)" }: { text: string; farbe?: string }) {
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1.5 px-2 text-[11px] font-bold tracking-wide whitespace-nowrap text-white uppercase"
      style={{ background: farbe }}
    >
      <span aria-hidden="true">●</span>
      {text}
    </span>
  );
}

/** Segment-Umschalter: rund, wie die Knoepfe. */
export function Segmente<T extends string>({
  werte,
  wert,
  aufWahl,
  beschriftung,
}: {
  werte: { wert: T; text: string }[];
  wert: T;
  aufWahl: (w: T) => void;
  beschriftung: string;
}) {
  return (
    <div role="radiogroup" aria-label={beschriftung} className="inline-flex flex-wrap gap-1 rounded-full border border-linie-feld bg-flaeche p-1">
      {werte.map((w) => (
        <button
          key={w.wert}
          type="button"
          role="radio"
          aria-checked={w.wert === wert}
          onClick={() => aufWahl(w.wert)}
          className={cn(
            "h-8 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
            w.wert === wert ? "bg-text text-white" : "text-text-hinweis hover:bg-black/5 hover:text-text",
          )}
        >
          {w.text}
        </button>
      ))}
    </div>
  );
}

/** Ein- und Ausschalter, ganze Zeile klickbar. */
export function Schalter({ an, aufWechsel, text, disabled }: { an: boolean; aufWechsel: (an: boolean) => void; text: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      disabled={disabled}
      onClick={() => aufWechsel(!an)}
      className="flex items-center gap-3 text-[15px] font-medium disabled:opacity-45"
    >
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", an ? "bg-primaer" : "bg-linie-feld")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]", an ? "left-[22px]" : "left-0.5")} />
      </span>
      {text}
    </button>
  );
}

/** Eine Kennung: Monospace plus Kopierknopf mit Rueckmeldung, nur bei Erfolg. */
export function Monowert({ wert, kurz }: { wert: string; kurz?: boolean }) {
  const { t } = useT();
  const anzeige = kurz === true && wert.length > 28 ? `${wert.slice(0, 25)}…` : wert;
  const [stand, setzeStand] = useState<"ruht" | "kopiert" | "geht-nicht">("ruht");

  useEffect(() => {
    if (stand === "ruht") return;
    const z = setTimeout(() => setzeStand("ruht"), 1500);
    return () => clearTimeout(z);
  }, [stand]);

  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <code title={wert} className="min-w-0 font-mono text-xs break-all">
        {anzeige}
      </code>
      <button
        type="button"
        aria-label={t("allg.kopieren")}
        title={t("allg.kopieren")}
        className="flex size-8 shrink-0 items-center justify-center text-text-hinweis hover:text-text"
        onClick={() => {
          const schreiben = navigator.clipboard?.writeText(wert);
          if (schreiben === undefined) return setzeStand("geht-nicht");
          void schreiben.then(
            () => setzeStand("kopiert"),
            () => setzeStand("geht-nicht"),
          );
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stand === "kopiert" ? 2.5 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {stand === "kopiert" ? (
            <path d="M20 6L9 17l-5-5" />
          ) : (
            <>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>
          )}
        </svg>
      </button>
      <span role="status" className="shrink-0 text-xs font-semibold">
        {stand === "kopiert" && <span className="text-primaer-dunkel">{t("allg.kopiert")}</span>}
        {stand === "geht-nicht" && <span className="text-fehler">{t("allg.kopierenGehtNicht")}</span>}
      </span>
    </span>
  );
}

export function Fehlerhinweis({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-2.5 bg-fehler-grund px-3.5 py-3 text-sm font-medium text-text">
      <span className="size-2 shrink-0 rounded-full bg-fehler" aria-hidden="true" />
      {children}
    </div>
  );
}

export function Erfolgshinweis({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2.5 bg-primaer-grund px-3.5 py-3 text-sm font-medium text-text">
      <span className="size-2 shrink-0 rounded-full bg-primaer" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Ladezustand und leerer Zustand. Der leere Zustand erscheint erst nach dem Laden. */
export function Zustand({
  laedt,
  fehler,
  leer,
  leerText,
  children,
}: {
  laedt: boolean;
  fehler: string | null;
  leer?: boolean;
  leerText?: string;
  children: ReactNode;
}) {
  const { t, fehler: fehlertext } = useT();
  if (fehler !== null) return <Fehlerhinweis>{fehlertext(fehler)}</Fehlerhinweis>;
  if (laedt) return <p className="py-10 text-center text-sm text-text-hinweis">{t("allg.laden")}</p>;
  if (leer === true) return <p className="py-10 text-center text-sm text-text-hinweis">{leerText ?? t("allg.leer")}</p>;
  return <>{children}</>;
}
