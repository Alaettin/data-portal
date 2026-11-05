import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import type { AssetDetail as Detail, Ereignis, PcnEintrag } from "../../api.ts";
import { Abschnitt, Augenbraue, Auswahl, cn, Monowert, Zustand } from "../../bausteine/basis.tsx";
import { Teilmodell } from "../../bausteine/anzeige.tsx";
import { Aenderungen, ArtMarkierung, ART_FARBE, AssetStatus, OrgLink, Produktbild } from "../../bausteine/fach.tsx";
import type { Schluessel } from "../../i18n/de.ts";
import { useT } from "../../i18n/sprache.tsx";
import { useDaten } from "../../strom.tsx";

/** Im Besucherbereich zurueck zur Uebersicht, im Backoffice zurueck zur Organisationsseite. */
export function AssetDetail({ zurueck }: { zurueck?: { pfad: string; text: string } }) {
  const { eid, item } = useParams();
  const { t } = useT();
  const { daten: a, fehler, laedt } = useDaten<Detail>(`/api/assets/${eid}/${encodeURIComponent(item ?? "")}`);

  return (
    <>
      <Link to={zurueck?.pfad ?? "/"} className="self-start text-sm font-semibold text-text-hinweis hover:text-text">
        {zurueck?.text ?? t("detail.zurueck")}
      </Link>
      <Zustand laedt={laedt && !a} fehler={fehler === "nicht-gefunden" ? null : fehler} leer={fehler === "nicht-gefunden"} leerText={t("detail.nichtGefunden")}>
        {a && <Inhalt a={a} />}
      </Zustand>
    </>
  );
}

function Inhalt({ a }: { a: Detail }) {
  const { t, datumZeit } = useT();
  return (
    <>
      <header className="flex flex-wrap items-start gap-5">
        <Produktbild a={a} groesse={112} className="bg-flaeche shadow-flaeche" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Augenbraue>
            <OrgLink slug={a.organisationSlug} name={a.organisation} farbe={a.organisationFarbe} />
          </Augenbraue>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] break-words sm:text-4xl">{a.name ?? a.itemId}</h1>
          <AssetStatus a={a} />
        </div>
      </header>

      {/* Alles in voller Breite (Nutzervorgabe 04.11.2026): Teilmodelle brauchen den Platz. */}
      <Abschnitt titel={t("detail.stammdaten")}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fakt titel={t("feld.organisation")}>
              <OrgLink slug={a.organisationSlug} name={a.organisation} farbe={a.organisationFarbe} />
            </Fakt>
            {a.hersteller && <Fakt titel={t("feld.hersteller")}>{a.hersteller}</Fakt>}
            {a.bestellnummer && <Fakt titel={t("feld.bestellnummer")}>{a.bestellnummer}</Fakt>}
            {a.registriert && <Fakt titel={t("feld.registriert")}>{datumZeit(a.registriert)}</Fakt>}
            {a.aktualisiert && <Fakt titel={t("feld.aktualisiert")}>{datumZeit(a.aktualisiert)}</Fakt>}
            {a.globalAssetId && (
              <Fakt titel={t("feld.globalAssetId")}>
                <Monowert wert={a.globalAssetId} />
              </Fakt>
            )}
            {a.aasId && (
              <Fakt titel={t("feld.aasId")}>
                <Monowert wert={a.aasId} />
              </Fakt>
            )}
            <Fakt titel={t("feld.gespeichert")}>{a.gespeichert ? datumZeit(a.gespeichert) : <span className="text-text-hinweis">{t("feld.nochNicht")}</span>}</Fakt>
          </dl>
      </Abschnitt>
      {a.pcns.length > 0 && (
        <Abschnitt titel={t("detail.pcn")}>
          <div className="flex flex-col gap-5">
            {a.pcns.map((p) => (
              <Pcn key={p.eventId} p={p} />
            ))}
          </div>
        </Abschnitt>
      )}
      <Teilmodelle a={a} />
      <Verlauf liste={a.verlauf} />
    </>
  );
}

function Fakt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{titel}</dt>
      <dd className="min-w-0 text-[15px] break-words">{children}</dd>
    </div>
  );
}

function Pcn({ p }: { p: PcnEintrag }) {
  const { t, datum } = useT();
  const farbe = p.abkuendigung ? ART_FARBE.abkuendigung : ART_FARBE.pcn;
  const prozent = (n: number | undefined) => (n === undefined ? null : `${Math.round(n * 100)} %`);
  return (
    <article className="flex flex-col gap-3 border-l-4 pl-4" style={{ borderColor: farbe }}>
      <div className="flex flex-wrap items-center gap-2">
        <ArtMarkierung art="pcn" abkuendigung={p.abkuendigung} />
        <span className="text-sm text-text-hinweis">{datum(p.zeit)}</span>
      </div>
      <h3 className="text-lg leading-snug font-bold">{p.titel ?? (p.abkuendigung ? t("pcn.abkuendigungTitel") : t("pcn.aenderung"))}</h3>
      {p.detail && <p className="text-[15px] leading-relaxed text-text-zweit">{p.detail}</p>}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {p.stichtag && <Fakt titel={t("pcn.stichtag")}>{datum(p.stichtag)}</Fakt>}
        {p.gruende.length > 0 && <Fakt titel={t("pcn.gruende")}>{p.gruende.join(", ")}</Fakt>}
        {p.kategorien.length > 0 && <Fakt titel={t("pcn.kategorien")}>{p.kategorien.join(", ")}</Fakt>}
        {p.meilensteine.length > 0 && (
          <Fakt titel={t("pcn.meilensteine")}>
            <ul>
              {p.meilensteine.map((m) => (
                <li key={`${m.name}${m.datum}`}>
                  {m.name}: <span className="tabular-nums">{datum(m.datum)}</span>
                </li>
              ))}
            </ul>
          </Fakt>
        )}
      </dl>
      {p.ersatz.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("pcn.ersatz")}</span>
          {p.ersatz.map((e, i) => (
            <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 bg-grund px-3 py-2">
              <span className="font-semibold">
                {e.bezeichnung ?? e.bestellnummer}
                {e.bezeichnung && e.bestellnummer && <span className="ml-2 font-mono text-xs font-normal text-text-hinweis">{e.bestellnummer}</span>}
              </span>
              <span className="flex flex-wrap gap-x-3 text-[13px] text-text-zweit">
                {(["einbau", "form", "funktion", "sonstiges"] as const).map((k) =>
                  prozent(e.passung[k]) ? (
                    <span key={k}>
                      {t(`passung.${k}` as Schluessel)} <b className="tabular-nums">{prozent(e.passung[k])}</b>
                    </span>
                  ) : null,
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * Teilmodelle: ab `md` eine Leiste links mit allen Teilmodellen untereinander, der Inhalt
 * rechts. Darunter eine Auswahlliste ueber dem Inhalt. Vorher brachen Pillen um, sobald es
 * mehr als vier Teilmodelle gab.
 */
function Teilmodelle({ a }: { a: Detail }) {
  const { t } = useT();
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  if (a.submodelle.length === 0) return null;
  const aktiv = a.submodelle.find((s) => s.id === gewaehlt) ?? a.submodelle[0]!;
  const elemente = aktiv.inhalt?.submodelElements;

  return (
    <Abschnitt titel={t("detail.teilmodelle")} innen="">
      <div className="grid grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={t("detail.teilmodelle")} className="hidden flex-col border-r border-linie py-2 md:flex">
          {a.submodelle.map((s) => {
            const istAktiv = s.id === aktiv.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-current={istAktiv ? "true" : undefined}
                onClick={() => setGewaehlt(s.id)}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-2 px-5 py-2.5 text-left text-sm",
                  istAktiv
                    ? "bg-grund font-semibold text-text shadow-[inset_3px_0_0_var(--color-primaer)]"
                    : "font-medium text-text-hinweis hover:bg-grund hover:text-text",
                )}
              >
                {s.name}
                {!s.inhalt && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-linie-feld" title={t("teilmodell.nichtGeladen")} />}
              </button>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
          {a.submodelle.length > 1 && (
            <Auswahl aria-label={t("teilmodell.waehlen")} value={aktiv.id} onChange={(e) => setGewaehlt(e.target.value)} className="md:hidden">
              {a.submodelle.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Auswahl>
          )}
          <h3 className="hidden text-lg font-bold md:block">{aktiv.name}</h3>
          {!elemente ? (
            <p className="text-sm text-text-hinweis">{t("teilmodell.nichtGeladen")}</p>
          ) : elemente.length === 0 ? (
            <p className="text-sm text-text-hinweis">{t("teilmodell.leer")}</p>
          ) : (
            <Teilmodell key={aktiv.id} elemente={elemente} herkunft={{ asset: a, submodelId: aktiv.id }} />
          )}
        </div>
      </div>
    </Abschnitt>
  );
}

function Verlauf({ liste }: { liste: Ereignis[] }) {
  const { t, datumZeit } = useT();
  return (
    <Abschnitt titel={t("detail.verlauf")}>
      {liste.length === 0 ? (
        <p className="text-sm text-text-hinweis">{t("detail.verlaufLeer")}</p>
      ) : (
        <ol className="flex flex-col">
          {liste.map((e) => (
            <li key={e.lfd} className="flex flex-col gap-2 border-b border-linie py-4 first:pt-0 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <ArtMarkierung art={e.art} abkuendigung={e.pcn?.abkuendigung} />
                <time dateTime={e.zeit} className="text-sm text-text-hinweis tabular-nums">
                  {datumZeit(e.zeit)}
                </time>
              </div>
              <p className="font-semibold">{e.titel}</p>
              {e.aenderungen && e.aenderungen.length > 0 ? <Aenderungen liste={e.aenderungen} /> : e.zusatz && <p className="text-sm text-text-zweit">{e.zusatz}</p>}
            </li>
          ))}
        </ol>
      )}
    </Abschnitt>
  );
}
