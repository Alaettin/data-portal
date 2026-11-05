import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, assetPfad, mitSprache, type Art, type Ereignis } from "../../api.ts";
import { cn, Flaeche, Knopf, Segmente, Zustand } from "../../bausteine/basis.tsx";
import { Json } from "../../bausteine/anzeige.tsx";
import { Aenderungen, ArtMarkierung } from "../../bausteine/fach.tsx";
import { useT } from "../../i18n/sprache.tsx";
import { useDaten } from "../../strom.tsx";
import { useOrg } from "./rahmen.tsx";

type Objekt = "alle" | "aas" | "submodel" | "pcn";
type Aktion = "alle" | "created" | "updated";
const SEITE = 50;

/**
 * Ereignisprotokoll der eigenen Organisation. Gefiltert wird nach Objekt (AAS, Teilmodell,
 * PCN) und Aktion (erstellt, aktualisiert); fuer PCN gibt es keine Aktion.
 */
export function BoEreignisse() {
  const { orgId } = useOrg();
  const { t, tag, sprache } = useT();
  const [p, setP] = useSearchParams();
  const objekt = (["aas", "submodel", "pcn"].includes(p.get("objekt") ?? "") ? p.get("objekt") : "alle") as Objekt;
  const aktion = (["created", "updated"].includes(p.get("aktion") ?? "") && objekt !== "pcn" ? p.get("aktion") : "alle") as Aktion;

  const abfrage = new URLSearchParams({ limit: String(SEITE) });
  if (objekt !== "alle") abfrage.set("objekt", objekt);
  if (aktion !== "alle") abfrage.set("aktion", aktion);
  const basis = `/api/backoffice/${orgId}/ereignisse`;
  const pfad = `${basis}?${abfrage.toString()}`;
  const { daten, fehler, laedt } = useDaten<Ereignis[]>(pfad);

  // Aeltere Seiten gelten nur fuer diesen Filter und diese Sprache; ein Wechsel beginnt oben.
  const schluessel = `${pfad}|${sprache}`;
  const [aeltere, setAeltere] = useState<{ schluessel: string; liste: Ereignis[]; ende: boolean }>({ schluessel, liste: [], ende: false });
  const nachgeladen = aeltere.schluessel === schluessel ? aeltere : { schluessel, liste: [], ende: false };
  const liste = [...(daten ?? []), ...nachgeladen.liste.filter((e) => !daten?.some((d) => d.lfd === e.lfd))];
  const [laedtMehr, setLaedtMehr] = useState(false);

  function setze(werte: Record<string, string | null>) {
    const neu = new URLSearchParams(p);
    for (const [k, v] of Object.entries(werte)) {
      if (v === null || v === "alle") neu.delete(k);
      else neu.set(k, v);
    }
    setP(neu, { replace: true });
  }

  async function mehr() {
    const letzte = liste.at(-1);
    if (!letzte) return;
    setLaedtMehr(true);
    try {
      const neu = await api<Ereignis[]>(mitSprache(`${pfad}&vor=${letzte.lfd}`, sprache));
      setAeltere({ schluessel, liste: [...nachgeladen.liste, ...neu], ende: neu.length < SEITE });
    } finally {
      setLaedtMehr(false);
    }
  }

  const tage: { tag: string; eintraege: Ereignis[] }[] = [];
  for (const e of liste) {
    const name = tag(e.zeit);
    if (tage.at(-1)?.tag !== name) tage.push({ tag: name, eintraege: [] });
    tage.at(-1)!.eintraege.push(e);
  }

  return (
    <>
      <p className="max-w-[46rem] text-[15px] leading-relaxed text-text-zweit">{t("ereig.unter")}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="flex items-center gap-3">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("ereig.objekt")}</span>
          <Segmente<Objekt>
            beschriftung={t("ereig.objekt")}
            wert={objekt}
            aufWahl={(w) => setze({ objekt: w, ...(w === "pcn" ? { aktion: null } : {}) })}
            werte={[
              { wert: "alle", text: t("ereig.alle") },
              { wert: "aas", text: t("objekt.aas") },
              { wert: "submodel", text: t("objekt.submodel") },
              { wert: "pcn", text: t("objekt.pcn") },
            ]}
          />
        </span>
        {objekt !== "pcn" && (
          <span className="flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("ereig.aktion")}</span>
            <Segmente<Aktion>
              beschriftung={t("ereig.aktion")}
              wert={aktion}
              aufWahl={(w) => setze({ aktion: w })}
              werte={[
                { wert: "alle", text: t("ereig.alle") },
                { wert: "created", text: t("aktion.created") },
                { wert: "updated", text: t("aktion.updated") },
              ]}
            />
          </span>
        )}
      </div>
      <Zustand laedt={laedt && !daten} fehler={fehler} leer={daten?.length === 0} leerText={t("ereig.leer")}>
        <div className="flex flex-col gap-6">
          {tage.map((g) => (
            <section key={g.tag} className="flex flex-col gap-2">
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{g.tag}</h2>
              <Flaeche>
                <ol>
                  {g.eintraege.map((e) => (
                    <Zeile key={e.lfd} e={e} basis={basis} orgId={orgId} />
                  ))}
                </ol>
              </Flaeche>
            </section>
          ))}
          {daten && daten.length === SEITE && !nachgeladen.ende && (
            <Knopf art="rand" className="self-center" laedt={laedtMehr} onClick={() => void mehr()}>
              {t("ereig.mehr")}
            </Knopf>
          )}
        </div>
      </Zustand>
    </>
  );
}

function Zeile({ e, basis, orgId }: { e: Ereignis; basis: string; orgId: number }) {
  const { t, uhrzeit, sprache } = useT();
  const [offen, setOffen] = useState(false);
  const [roh, setRoh] = useState<unknown>(null);

  async function umschalten() {
    if (!offen && roh === null) {
      const voll = await api<Ereignis>(mitSprache(`${basis}/${e.lfd}`, sprache));
      setRoh(voll.roh ?? null);
    }
    setOffen(!offen);
  }

  return (
    <li className="border-t border-linie first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 sm:flex-nowrap">
        <time dateTime={e.zeit} className="w-12 shrink-0 pt-0.5 font-mono text-[13px] text-text-hinweis">
          {uhrzeit(e.zeit)}
        </time>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* In der senkrechten Spalte wuerde die Markierung sonst ueber die ganze Breite gezogen. */}
          <span className="self-start">
            <ArtMarkierung art={e.art as Art} abkuendigung={e.pcn?.abkuendigung} />
          </span>
          <Link to={assetPfad(e, `/backoffice/${orgId}/assets`)} className="font-semibold hover:underline">
            {e.titel}
          </Link>
          {e.aenderungen && e.aenderungen.length > 0 ? <Aenderungen liste={e.aenderungen} max={3} /> : e.zusatz && <p className="text-sm text-text-zweit">{e.zusatz}</p>}
        </div>
        <button
          type="button"
          aria-expanded={offen}
          onClick={() => void umschalten()}
          className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold", offen ? "border-text bg-text text-white" : "border-linie-feld text-text-hinweis hover:text-text")}
        >
          {t("ereig.rohZeigen")}
        </button>
      </div>
      {offen && (
        <div className="flex flex-col gap-2 px-5 pb-5">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("ereig.roh")}</span>
          <Json wert={roh} className="max-h-[28rem]" />
        </div>
      )}
    </li>
  );
}
