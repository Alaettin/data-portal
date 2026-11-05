/**
 * Die grosse Asset-Liste: Suche, Filter, Sortierung, Blaettern. Der Zustand steht in der
 * Adresse, damit Neuladen, Zurueck und Lesezeichen dieselbe Auswahl zeigen. Geblaettert
 * wird auf dem Server.
 */

import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { assetPfad, type AssetListe } from "../../api.ts";
import { Abschnitt, Auswahl, cn, Feld, Knopf, Kopfzelle, Reihe, Zelle, Zustand } from "../../bausteine/basis.tsx";
import { Blaetterleiste } from "../../bausteine/blaettern.tsx";
import { AssetStatus, OrgLink, Produktbild } from "../../bausteine/fach.tsx";
import type { Schluessel } from "../../i18n/de.ts";
import { useT } from "../../i18n/sprache.tsx";
import { frischSchluessel, useDaten, useStrom } from "../../strom.tsx";

const SORTEN = ["aktualisiert", "registriert", "name", "hersteller", "organisation"] as const;
type Sorte = (typeof SORTEN)[number];
const STATUS = ["neu", "aktualisiert", "pcn", "abkuendigung"] as const;
type Status = (typeof STATUS)[number];
const JE_SEITE = 25;

/** Text- und Namenssortierung beginnt sinnvollerweise bei A, Datumssortierung beim Neuesten. */
const STANDARDRICHTUNG: Record<Sorte, "auf" | "ab"> = { aktualisiert: "ab", registriert: "ab", name: "auf", hersteller: "auf", organisation: "auf" };

export function Assetliste({ organisationId, titel, basisPfad }: { organisationId?: number; titel?: string; basisPfad?: string }) {
  const { t, zahl, datum, vorWann } = useT();
  const { frisch } = useStrom();
  const [p, setP] = useSearchParams();

  const q = p.get("q") ?? "";
  const organisation = organisationId !== undefined ? String(organisationId) : (p.get("organisation") ?? "");
  const status: Status | "" = STATUS.includes(p.get("status") as Status) ? (p.get("status") as Status) : "";
  const sort: Sorte = SORTEN.includes(p.get("sort") as Sorte) ? (p.get("sort") as Sorte) : "aktualisiert";
  const richtung = p.get("richtung") === "auf" || p.get("richtung") === "ab" ? (p.get("richtung") as "auf" | "ab") : STANDARDRICHTUNG[sort];
  const seite = Math.max(1, Number(p.get("seite") ?? 1) || 1);

  const [suche, setSuche] = useState(q);

  const abfrage = new URLSearchParams({ sort, richtung, seite: String(seite), proSeite: String(JE_SEITE) });
  if (q) abfrage.set("q", q);
  if (organisation) abfrage.set("organisation", organisation);
  if (status) abfrage.set("status", status);
  const { daten, fehler, letzte } = useDaten<AssetListe>(`/api/assets?${abfrage.toString()}`);
  const liste = daten ?? letzte;

  /** Setzt Werte in der Adresse; jede Aenderung ausser dem Blaettern beginnt wieder bei Seite 1. */
  function setze(werte: Record<string, string | null>) {
    const neu = new URLSearchParams(p);
    for (const [k, v] of Object.entries(werte)) {
      if (v === null || v === "") neu.delete(k);
      else neu.set(k, v);
    }
    if (!("seite" in werte)) neu.delete("seite");
    setP(neu, { replace: !("seite" in werte) });
  }

  function sortiereNach(s: Sorte) {
    if (s === sort) setze({ richtung: richtung === "auf" ? "ab" : "auf" });
    else setze({ sort: s, richtung: STANDARDRICHTUNG[s] });
  }

  const gefiltert = !!(q || (organisationId === undefined && organisation) || status);

  const Sortierkopf = ({ s, text, className }: { s: Sorte; text: Schluessel; className?: string }) => (
    <Kopfzelle className={className}>
      <button
        type="button"
        onClick={() => sortiereNach(s)}
        className={cn("inline-flex items-center gap-1 uppercase hover:text-text", s === sort && "text-text")}
        aria-label={`${t("sort.label")}: ${t(text)}`}
      >
        {t(text)}
        <span aria-hidden="true" className={cn("text-[10px]", s !== sort && "opacity-0")}>
          {richtung === "auf" ? "▲" : "▼"}
        </span>
      </button>
    </Kopfzelle>
  );

  return (
    <Abschnitt
      titel={titel ?? t("liste.titel")}
      rechts={liste && <span className="text-sm font-semibold text-text-hinweis tabular-nums">{liste.gesamt === 1 ? t("liste.treffer1") : t("liste.treffer", { n: zahl(liste.gesamt) })}</span>}
      innen=""
    >
      <div className="flex flex-col gap-4 border-b border-linie px-5 py-4 sm:px-6">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setze({ q: suche.trim() });
          }}
        >
          <Feld
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder={t("liste.suchePlatzhalter")}
            aria-label={t("liste.suche")}
            className="min-w-0 flex-1"
          />
          <Knopf type="submit" art="rand">
            {t("liste.sucheKnopf")}
          </Knopf>
        </form>

        <div className="flex flex-wrap items-end gap-3">
          {organisationId === undefined && (
            <Auswahl aria-label={t("filter.organisation")} value={organisation} onChange={(e) => setze({ organisation: e.target.value })} className="w-auto max-w-full min-w-[12rem]">
              <option value="">{t("filter.alleOrganisationen")}</option>
              {liste?.facetten.organisationen.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({zahl(o.anzahl)})
                </option>
              ))}
            </Auswahl>
          )}
          <Auswahl aria-label={t("status.label")} value={status} onChange={(e) => setze({ status: e.target.value })} className="w-auto max-w-full min-w-[14rem]">
            <option value="">{t("status.alle")}</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as Schluessel)}
              </option>
            ))}
          </Auswahl>
          <span className="flex items-center gap-2 lg:ml-auto">
            <Auswahl aria-label={t("sort.label")} value={sort} onChange={(e) => sortiereNach(e.target.value as Sorte)} className="w-auto">
              {SORTEN.map((s) => (
                <option key={s} value={s}>
                  {t(`sort.${s}` as Schluessel)}
                </option>
              ))}
            </Auswahl>
            <Knopf art="rand" className="h-11 w-11 px-0" aria-label={richtung === "auf" ? t("sort.auf") : t("sort.ab")} title={richtung === "auf" ? t("sort.auf") : t("sort.ab")} onClick={() => setze({ richtung: richtung === "auf" ? "ab" : "auf" })}>
              {richtung === "auf" ? "↑" : "↓"}
            </Knopf>
          </span>
        </div>
        {gefiltert && (
          <button
            type="button"
            className="self-start text-sm font-semibold text-primaer-dunkel hover:underline"
            onClick={() => {
              setSuche("");
              setze({ q: null, organisation: null, status: null });
            }}
          >
            {t("filter.zuruecksetzen")}
          </button>
        )}
      </div>

      <Zustand laedt={!liste} fehler={fehler} leer={liste?.gesamt === 0} leerText={gefiltert ? t("liste.leer") : t("liste.leerGanz")}>
        {liste && (
          <div className="flex flex-col gap-4 pb-5">
            <div className="sm:overflow-x-auto">
              <table className="w-full border-collapse text-[15px] sm:min-w-[860px]">
                <thead className="max-sm:hidden">
                  <tr>
                    <Sortierkopf s="name" text="spalte.asset" />
                    {organisationId === undefined && <Sortierkopf s="organisation" text="spalte.organisation" />}
                    <Sortierkopf s="hersteller" text="spalte.hersteller" />
                    <Sortierkopf s="registriert" text="spalte.registriert" className="sm:w-32" />
                    <Sortierkopf s="aktualisiert" text="spalte.aktualisiert" className="sm:w-36" />
                    <Kopfzelle className="sm:w-48">{t("spalte.status")}</Kopfzelle>
                  </tr>
                </thead>
                <tbody>
                  {liste.eintraege.map((a) => (
                    <Reihe key={`${a.endpunktId}/${a.itemId}`} className={cn("sm:hover:bg-grund", frisch.has(frischSchluessel(a)) && "neu-eingetroffen")}>
                      <Zelle>
                        <Link to={assetPfad(a, basisPfad)} className="group flex min-w-0 items-center gap-3">
                          <Produktbild a={a} groesse={44} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold group-hover:underline">{a.name ?? a.itemId}</span>
                            <span className="truncate font-mono text-xs text-text-hinweis">{a.bestellnummer ?? a.itemId}</span>
                          </span>
                        </Link>
                      </Zelle>
                      {organisationId === undefined && (
                        <Zelle titel={t("spalte.organisation")} className="whitespace-nowrap">
                          <OrgLink slug={a.organisationSlug} name={a.organisation} farbe={a.organisationFarbe} />
                        </Zelle>
                      )}
                      <Zelle titel={t("spalte.hersteller")} className="text-text-zweit">
                        {a.hersteller ?? "·"}
                      </Zelle>
                      <Zelle titel={t("spalte.registriert")} className="whitespace-nowrap text-text-zweit tabular-nums">
                        {a.registriert ? datum(a.registriert) : "·"}
                      </Zelle>
                      <Zelle titel={t("spalte.aktualisiert")} className="whitespace-nowrap text-text-zweit">
                        {a.aktualisiert ? <time dateTime={a.aktualisiert}>{vorWann(a.aktualisiert)}</time> : "·"}
                      </Zelle>
                      <Zelle titel={t("spalte.status")}>
                        <AssetStatus a={a} />
                      </Zelle>
                    </Reihe>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 sm:px-6">
              <Blaetterleiste seite={liste.seite} gesamt={liste.gesamt} jeSeite={JE_SEITE} aufSeite={(n) => setze({ seite: n <= 1 ? null : String(n) })} />
            </div>
          </div>
        )}
      </Zustand>
    </Abschnitt>
  );
}
