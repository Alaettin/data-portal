/**
 * Rohes JSON und Teilmodelle lesbar gesetzt, ohne Bibliothek.
 *
 * Teilmodelle gehen durch `submodellAnsicht` aus dem Core (getestet gegen echte P+F-Daten):
 * Einzelwerte als Faktenraster, Gruppen als Karten mit Kopf, gleichartige Listen als Tabelle,
 * Ebenen mit nur einem Element zusammengezogen.
 */

import { submodellAnsicht, type Element, type Knoten as AnsichtKnoten, type Wert as AnsichtWert } from "@datenportal/core";
import { useMemo, useState } from "react";
import { dateiUrl } from "../api.ts";
import { useT } from "../i18n/sprache.tsx";
import { cn, Knopf, knopfKlassen } from "./basis.tsx";

export function Json({ wert, className = "" }: { wert: unknown; className?: string }) {
  return (
    <pre className={`overflow-auto bg-[#1b1d26] p-4 font-mono text-[12.5px] leading-[1.6] text-[#e3e4e7] ${className}`}>
      <JsonKnoten wert={wert} tiefe={0} />
    </pre>
  );
}

const einzug = (t: number) => "  ".repeat(t);

function JsonKnoten({ wert, tiefe }: { wert: unknown; tiefe: number }) {
  if (wert === null) return <span className="text-[#9a9ca6]">null</span>;
  if (typeof wert === "string") return <span className="text-[#7fd8c6]">{JSON.stringify(wert)}</span>;
  if (typeof wert === "number" || typeof wert === "boolean") return <span className="text-[#f0c27b]">{String(wert)}</span>;
  if (Array.isArray(wert)) {
    if (wert.length === 0) return <>[]</>;
    return (
      <>
        {"[\n"}
        {wert.map((w, i) => (
          <span key={i}>
            {einzug(tiefe + 1)}
            <JsonKnoten wert={w} tiefe={tiefe + 1} />
            {i < wert.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {einzug(tiefe)}]
      </>
    );
  }
  if (typeof wert === "object") {
    const eintraege = Object.entries(wert as Record<string, unknown>);
    if (eintraege.length === 0) return <>{"{}"}</>;
    return (
      <>
        {"{\n"}
        {eintraege.map(([k, w], i) => (
          <span key={k}>
            {einzug(tiefe + 1)}
            <span className="text-[#9db8e6]">{JSON.stringify(k)}</span>: <JsonKnoten wert={w} tiefe={tiefe + 1} />
            {i < eintraege.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {einzug(tiefe)}
        {"}"}
      </>
    );
  }
  return <>{String(wert)}</>;
}

/** Wofuer die Datei-Links gebraucht werden: Asset und Teilmodell. */
type Herkunft = { asset: { endpunktId: number; itemId: string }; submodelId: string };

/** Welche Gruppen und Tabellen offen sind; ein Set fuer das ganze Teilmodell. */
type Klappen = { offen: ReadonlySet<string>; umschalten: (pfad: string) => void };

/** Pfade aller einklappbaren Einheiten, oberste Ebene zuerst markiert. */
function einklappbare(knoten: AnsichtKnoten[], oben = true): { pfad: string; oben: boolean }[] {
  const aus: { pfad: string; oben: boolean }[] = [];
  for (const k of knoten) {
    if (k.art === "wert") continue;
    aus.push({ pfad: k.pfad, oben });
    if (k.art === "gruppe") aus.push(...einklappbare(k.kinder, false));
  }
  return aus;
}

/** Bis zu drei Einheiten oben stehen offen, alles darunter ist zu (Entscheidung 05.11.2026). */
const OBEN_OFFEN_BIS = 3;

/**
 * Ein Teilmodell mit einklappbaren Gruppen und Tabellen. Der Zustand liegt hier und nicht je
 * Gruppe, damit "alle auf/zu" ohne gespiegelten Zustand wirkt. Beim Wechsel des Teilmodells
 * setzt der Aufrufer per `key` neu auf.
 */
export function Teilmodell({ elemente, herkunft }: { elemente: unknown[]; herkunft: Herkunft }) {
  const { sprache, t } = useT();
  const knoten = useMemo(() => submodellAnsicht(elemente as Element[], sprache), [elemente, sprache]);
  const alle = useMemo(() => einklappbare(knoten), [knoten]);
  const [offen, setOffen] = useState<ReadonlySet<string>>(() => {
    const oben = alle.filter((e) => e.oben);
    return new Set(oben.length <= OBEN_OFFEN_BIS ? oben.map((e) => e.pfad) : []);
  });

  const klappen: Klappen = {
    offen,
    umschalten: (pfad) =>
      setOffen((alt) => {
        const neu = new Set(alt);
        if (neu.has(pfad)) neu.delete(pfad);
        else neu.add(pfad);
        return neu;
      }),
  };

  return (
    <div className="flex flex-col gap-4">
      {alle.length >= 2 && (
        <div className="flex flex-wrap justify-end gap-1">
          <Knopf art="still" className="h-8 px-3 text-[13px]" onClick={() => setOffen(new Set(alle.map((e) => e.pfad)))}>
            {t("teilmodell.alleAuf")}
          </Knopf>
          <Knopf art="still" className="h-8 px-3 text-[13px]" onClick={() => setOffen(new Set())}>
            {t("teilmodell.alleZu")}
          </Knopf>
        </div>
      )}
      <Knotenfolge knoten={knoten} herkunft={herkunft} klappen={klappen} />
    </div>
  );
}

/** Kopf einer Gruppe oder Tabelle als Knopf: Pfeil, Titel, Anzahl. */
function Klappkopf({ titel, anzahl, auf, aufKlick }: { titel: string; anzahl: number; auf: boolean; aufKlick: () => void }) {
  const { t } = useT();
  return (
    <h4>
      <button
        type="button"
        aria-expanded={auf}
        onClick={aufKlick}
        className="flex w-full items-center gap-2.5 bg-grund px-4 py-2.5 text-left text-sm font-bold hover:bg-linie"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn("shrink-0 text-text-hinweis transition-transform", auf && "rotate-90")}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
        <span className="min-w-0 flex-1">{titel}</span>
        <span className="shrink-0 text-xs font-semibold text-text-hinweis tabular-nums">{t("teilmodell.eintraege", { n: anzahl })}</span>
      </button>
    </h4>
  );
}

/** Aufeinanderfolgende Einzelwerte bilden ein Raster; Gruppen und Tabellen stehen dazwischen. */
function Knotenfolge({ knoten, herkunft, klappen }: { knoten: AnsichtKnoten[]; herkunft: Herkunft; klappen: Klappen }) {
  const bloecke: (AnsichtWert[] | AnsichtKnoten)[] = [];
  for (const k of knoten) {
    const letzter = bloecke.at(-1);
    if (k.art === "wert" && Array.isArray(letzter)) letzter.push(k);
    else bloecke.push(k.art === "wert" ? [k] : k);
  }
  return (
    <div className="flex flex-col gap-5">
      {bloecke.map((b, i) =>
        Array.isArray(b) ? (
          <Faktenraster key={i} werte={b} herkunft={herkunft} />
        ) : b.art === "gruppe" ? (
          <section key={b.pfad} className="border border-linie">
            <Klappkopf titel={b.titel} anzahl={b.kinder.length} auf={klappen.offen.has(b.pfad)} aufKlick={() => klappen.umschalten(b.pfad)} />
            {klappen.offen.has(b.pfad) && (
              <div className="border-t border-linie p-4">
                {b.kinder.length === 0 ? <Leer /> : <Knotenfolge knoten={b.kinder} herkunft={herkunft} klappen={klappen} />}
              </div>
            )}
          </section>
        ) : b.art === "tabelle" ? (
          <Tabelle key={b.pfad} tabelle={b} herkunft={herkunft} klappen={klappen} />
        ) : null,
      )}
    </div>
  );
}

function Leer() {
  const { t } = useT();
  return <span className="text-sm text-text-hinweis">{t("allg.leerWert")}</span>;
}

/** Bezeichnung klein darueber, Wert darunter; lange Texte nehmen die ganze Zeile. */
function Faktenraster({ werte, herkunft }: { werte: AnsichtWert[]; herkunft: Herkunft }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {werte.map((w) => (
        <div
          key={w.pfad}
          className={cn("flex min-w-0 flex-col gap-1", (w.wert.length > 80 || (w.typ === "url" && w.wert.length > 40)) && "sm:col-span-2 xl:col-span-3")}
        >
          <dt className="text-[11px] font-semibold tracking-[0.06em] text-text-hinweis uppercase">{w.titel}</dt>
          <dd className="min-w-0 text-[15px] leading-snug break-words">
            <WertAnzeige w={w} herkunft={herkunft} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Tabelle({ tabelle, herkunft, klappen }: { tabelle: Extract<AnsichtKnoten, { art: "tabelle" }>; herkunft: Herkunft; klappen: Klappen }) {
  const auf = klappen.offen.has(tabelle.pfad);
  return (
    <section className="border border-linie">
      <Klappkopf titel={tabelle.titel} anzahl={tabelle.zeilen.length} auf={auf} aufKlick={() => klappen.umschalten(tabelle.pfad)} />
      {auf && (
      <div className="overflow-x-auto border-t border-linie">
        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr>
              {tabelle.spalten.map((s) => (
                <th key={s} className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-text-hinweis uppercase">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabelle.zeilen.map((zeile, i) => (
              <tr key={i} className="border-t border-linie">
                {zeile.map((w, j) => (
                  <td key={j} className="px-4 py-2.5 align-top">
                    {w && <WertAnzeige w={w} herkunft={herkunft} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}

function WertAnzeige({ w, herkunft }: { w: AnsichtWert; herkunft: Herkunft }) {
  const { t, datum, zahl } = useT();
  if (w.wert === "") return <Leer />;
  switch (w.typ) {
    case "url":
      return (
        <a href={w.wert} target="_blank" rel="noreferrer noopener" className="break-all text-primaer-dunkel hover:underline">
          {w.wert}
        </a>
      );
    case "datei": {
      const name = w.wert.split("/").pop() || w.wert;
      const art = (w.contentType?.split("/").pop() ?? "").toUpperCase();
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <a href={dateiUrl(herkunft.asset, herkunft.submodelId, w.pfad)} target="_blank" rel="noreferrer" className={knopfKlassen("rand", "h-8 px-3 text-[13px]")}>
            {art ? `${art} ` : ""}
            {t("datei.oeffnen")}
          </a>
          <code className="font-mono text-[12px] break-all text-text-hinweis">{name}</code>
        </span>
      );
    }
    case "datum": {
      const d = new Date(w.wert);
      return <>{Number.isNaN(d.getTime()) ? w.wert : datum(w.wert)}</>;
    }
    case "zahl":
      return <span className="tabular-nums">{zahl(Number(w.wert))}</span>;
    case "ja-nein":
      return <>{w.wert === "true" ? t("allg.ja") : w.wert === "false" ? t("allg.nein") : w.wert}</>;
    default:
      return <span className="whitespace-pre-line">{w.wert}</span>;
  }
}
