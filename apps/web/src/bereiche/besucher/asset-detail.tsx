import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { api, assetPfad, bildUrl, fehlertext, mitSprache, type AssetDetail as Detail, type AssetListe, type Ereignis, type PcnEintrag } from "../../api.ts";
import { Abschnitt, Augenbraue, Auswahl, cn, Knopf, Monowert, Zustand } from "../../bausteine/basis.tsx";
import { RohAnsicht, RohKnopf, Teilmodell, useRohdaten } from "../../bausteine/anzeige.tsx";
import { Schaufenster } from "../../bausteine/dialog.tsx";
import { Aenderungen, ArtMarkierung, ART_FARBE, AssetStatus, OrgLink, Produktbild } from "../../bausteine/fach.tsx";
import type { Schluessel } from "../../i18n/de.ts";
import { useT } from "../../i18n/sprache.tsx";
import { useDaten, useStrom } from "../../strom.tsx";

/**
 * Im Backoffice gibt es mehr: Rohdaten im Verlauf und das Neu-Abrufen beim Hersteller.
 * `orgId` ist die Organisation, deren Backoffice gerade offen ist.
 */
type Backoffice = { orgId: number };

/** Im Besucherbereich zurueck zur Uebersicht, im Backoffice zurueck zur Organisationsseite. */
export function AssetDetail({ zurueck, backoffice }: { zurueck?: { pfad: string; text: string }; backoffice?: Backoffice }) {
  const { eid, item } = useParams();
  const { t } = useT();
  const { daten: a, fehler, laedt } = useDaten<Detail>(`/api/assets/${eid}/${encodeURIComponent(item ?? "")}`);

  return (
    <>
      <Link to={zurueck?.pfad ?? "/"} className="self-start text-sm font-semibold text-text-hinweis hover:text-text">
        {zurueck?.text ?? t("detail.zurueck")}
      </Link>
      <Zustand laedt={laedt && !a} fehler={fehler === "nicht-gefunden" ? null : fehler} leer={fehler === "nicht-gefunden"} leerText={t("detail.nichtGefunden")}>
        {a && <Inhalt a={a} backoffice={backoffice} />}
      </Zustand>
    </>
  );
}

/** Pfad der Backoffice-Aktionen fuer dieses Asset. */
const boPfad = (bo: Backoffice, a: Detail) => `/api/backoffice/${bo.orgId}/assets/${a.endpunktId}/${encodeURIComponent(a.itemId)}`;

function Inhalt({ a, backoffice }: { a: Detail; backoffice?: Backoffice }) {
  const { t, datumZeit } = useT();
  const [gross, setGross] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-start gap-5">
        {a.hatBild ? (
          <button type="button" onClick={() => setGross(true)} aria-label={t("detail.bildGross")} className="shrink-0 cursor-zoom-in">
            <Produktbild a={a} groesse={160} className="shadow-flaeche" />
          </button>
        ) : (
          <Produktbild a={a} groesse={160} className="shadow-flaeche" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Augenbraue>
            <OrgLink slug={a.organisationSlug} name={a.organisation} farbe={a.organisationFarbe} />
          </Augenbraue>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] break-words sm:text-4xl">{a.name ?? a.itemId}</h1>
          <AssetStatus a={a} />
        </div>
      </header>
      {backoffice && <AssetAbrufen a={a} bo={backoffice} />}

      <Schaufenster offen={gross} aufOffen={setGross} titel={a.name ?? a.itemId} breit>
        <div className="flex justify-center bg-white p-4">
          <img src={bildUrl(a)} alt={a.name ?? a.itemId} className="max-h-[70dvh] w-auto max-w-full object-contain" />
        </div>
      </Schaufenster>

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
          <div className="flex flex-col gap-8">
            {a.pcns.map((p) => (
              <Pcn key={p.eventId} p={p} a={a} backoffice={backoffice} />
            ))}
          </div>
        </Abschnitt>
      )}
      <Teilmodelle a={a} backoffice={backoffice} />
      <Verlauf liste={a.verlauf} backoffice={backoffice} />
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

function Kleintitel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{children}</span>;
}

// ---------- Neu abrufen (Backoffice) ----------

type Meldung = { art: "ok" | "teilweise" | "fehler"; text: string; einzeln: { name: string; grund: string }[] };

/** Ergebnis eines Abrufs; bleibt stehen, bis man es schliesst. */
function Abrufmeldung({ m, aufSchliessen }: { m: Meldung; aufSchliessen: () => void }) {
  const { t } = useT();
  const farbe = m.art === "ok" ? "var(--color-primaer)" : m.art === "teilweise" ? "var(--color-art-pcn)" : "var(--color-fehler)";
  return (
    <div role={m.art === "ok" ? "status" : "alert"} className="flex items-start gap-3 border-l-4 bg-flaeche px-4 py-3 shadow-flaeche" style={{ borderColor: farbe }}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[15px]">
        <p className="font-semibold">{m.text}</p>
        {m.einzeln.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-text-zweit">
            {m.einzeln.map((e) => (
              <li key={e.name} className="[overflow-wrap:anywhere]">
                <b className="font-semibold text-text">{e.name}:</b> {e.grund}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={aufSchliessen} aria-label={t("allg.schliessen")} className="flex size-8 shrink-0 items-center justify-center text-text-hinweis hover:text-text">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

type Bericht = { shell?: string | null; bild?: string | null; teilmodelle: { id: string; name: string; fehler: string | null }[] };

/** Bericht des Servers in eine Meldung: was kam an, was nicht und warum. */
function meldungAus(b: Bericht, t: ReturnType<typeof useT>["t"]): Meldung {
  const einzeln: Meldung["einzeln"] = [];
  const teile: string[] = [];
  let gut = 0;
  let schlecht = 0;
  if (b.shell !== undefined) {
    if (b.shell === null) gut++;
    else {
      schlecht++;
      einzeln.push({ name: t("abruf.shell"), grund: b.shell });
    }
    teile.push(t("abruf.shell"));
  }
  if (b.bild !== undefined) {
    if (b.bild === null) gut++;
    else {
      schlecht++;
      einzeln.push({ name: t("abruf.bild"), grund: b.bild });
    }
    teile.push(t("abruf.bild"));
  }
  const tmOk = b.teilmodelle.filter((x) => x.fehler === null).length;
  for (const x of b.teilmodelle) if (x.fehler !== null) einzeln.push({ name: x.name, grund: x.fehler });
  gut += tmOk;
  schlecht += b.teilmodelle.length - tmOk;
  if (b.teilmodelle.length > 0) teile.push(t("abruf.teilmodelle", { ok: tmOk, n: b.teilmodelle.length }));
  const liste = teile.join(", ");
  if (schlecht === 0) return { art: "ok", text: t("abruf.ok", { teile: liste }), einzeln };
  return { art: gut === 0 ? "fehler" : "teilweise", text: `${t("abruf.teilweise", { teile: liste })} ${t("abruf.bestehtWeiter")}`, einzeln };
}

function AssetAbrufen({ a, bo }: { a: Detail; bo: Backoffice }) {
  const u = useT();
  const { t, sprache } = u;
  const { auffrischen } = useStrom();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung | null>(null);

  async function abrufen() {
    setLaeuft(true);
    setMeldung(null);
    try {
      const b = await api<Bericht>(mitSprache(`${boPfad(bo, a)}/abrufen`, sprache), { methode: "POST" });
      setMeldung(meldungAus(b, t));
      auffrischen();
    } catch (f) {
      setMeldung({ art: "fehler", text: fehlertext(f, u), einzeln: [] });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Knopf art="rand" className="h-9 px-4 text-sm" laedt={laeuft} onClick={() => void abrufen()}>
          {t("detail.abrufen")}
        </Knopf>
        <span className="text-sm text-text-hinweis">{t("detail.abrufenHinweis")}</span>
      </div>
      {meldung && <Abrufmeldung m={meldung} aufSchliessen={() => setMeldung(null)} />}
    </div>
  );
}

// ---------- Aenderungsmitteilung ----------

const TAG_MS = 24 * 60 * 60 * 1000;

/** Ganze Tage von heute bis zum Datum (negativ: vergangen), nach Kalendertagen. */
function tageBis(iso: string): number {
  const d = new Date(iso);
  const heute = new Date();
  const utc = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((utc(d) - utc(heute)) / TAG_MS);
}

function Pcn({ p, a, backoffice }: { p: PcnEintrag; a: Detail; backoffice?: Backoffice }) {
  const { t, datum, sprache } = useT();
  const farbe = p.abkuendigung ? ART_FARBE.abkuendigung : ART_FARBE.pcn;
  const relativ = new Intl.RelativeTimeFormat(sprache, { numeric: "auto" });

  return (
    <article className="flex flex-col gap-5 border-l-4 pl-5" style={{ borderColor: farbe }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[52rem] min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ArtMarkierung art="pcn" abkuendigung={p.abkuendigung} />
            <span className="text-sm text-text-hinweis">{datum(p.zeit)}</span>
          </div>
          <h3 className="text-xl leading-snug font-bold">{p.titel ?? (p.abkuendigung ? t("pcn.abkuendigungTitel") : t("pcn.aenderung"))}</h3>
          {p.detail && <p className="text-[15px] leading-relaxed text-text-zweit">{p.detail}</p>}
        </div>
        {p.stichtag && (
          <div className="flex shrink-0 flex-col items-start gap-0.5 bg-grund px-4 py-3 sm:items-end">
            <Kleintitel>{t("pcn.stichtag")}</Kleintitel>
            <span className="text-2xl font-bold tabular-nums" style={{ color: farbe }}>
              {datum(p.stichtag)}
            </span>
            <span className="text-sm text-text-zweit">{relativ.format(tageBis(p.stichtag), "day")}</span>
          </div>
        )}
      </div>

      {p.meilensteine.length > 0 && (
        <div className="flex flex-col gap-3">
          <Kleintitel>{t("pcn.meilensteine")}</Kleintitel>
          <Zeitleiste meilensteine={p.meilensteine} farbe={farbe} />
        </div>
      )}

      {(p.gruende.length > 0 || p.kategorien.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {p.gruende.length > 0 && <Marken titel={t("pcn.gruende")} werte={p.gruende} />}
          {p.kategorien.length > 0 && <Marken titel={t("pcn.kategorien")} werte={p.kategorien} />}
        </div>
      )}

      {p.ersatz.length > 0 && (
        <div className="flex flex-col gap-2">
          <Kleintitel>{t("pcn.ersatz")}</Kleintitel>
          {p.ersatz.map((e, i) => (
            <Ersatz key={i} e={e} a={a} backoffice={backoffice} />
          ))}
        </div>
      )}
    </article>
  );
}

function Marken({ titel, werte }: { titel: string; werte: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Kleintitel>{titel}</Kleintitel>
      <ul className="flex flex-wrap gap-1.5">
        {werte.map((w) => (
          <li key={w} className="bg-grund px-2.5 py-1 text-[13px] font-semibold">
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Meilensteine als Zeitleiste: gleiche Daten stehen in einem Punkt, "heute" ist eingereiht.
 * Vergangenes grau, Kommendes in der Farbe der Mitteilung. Ab `sm` waagerecht, darunter senkrecht.
 */
function Zeitleiste({ meilensteine, farbe }: { meilensteine: { name: string; datum: string }[]; farbe: string }) {
  const { t, datum } = useT();
  const gruppen = new Map<string, string[]>();
  for (const m of [...meilensteine].sort((x, y) => x.datum.localeCompare(y.datum))) {
    const tag = m.datum.slice(0, 10);
    gruppen.set(tag, [...(gruppen.get(tag) ?? []), m.name]);
  }
  // Lokaler Kalendertag als JJJJ-MM-TT; toISOString waere UTC und kippt nachts den Tag.
  const heute = new Date().toLocaleDateString("sv-SE");
  type Punkt = { tag: string; namen: string[]; heute: boolean };
  const punkte: Punkt[] = [...gruppen].map(([tag, namen]) => ({ tag, namen, heute: false }));
  if (!gruppen.has(heute)) {
    const stelle = punkte.findIndex((p) => p.tag > heute);
    punkte.splice(stelle === -1 ? punkte.length : stelle, 0, { tag: heute, namen: [], heute: true });
  }

  return (
    <ol className="flex flex-col sm:flex-row">
      {punkte.map((p, i) => {
        const vorbei = p.tag < heute;
        const ton = p.heute ? "var(--color-text)" : vorbei ? "var(--color-linie-feld)" : farbe;
        const letzter = i === punkte.length - 1;
        return (
          <li key={`${p.tag}${p.heute ? "-heute" : ""}`} className="relative flex min-w-0 flex-1 flex-col gap-1 pb-5 pl-7 sm:pt-7 sm:pr-4 sm:pb-0 sm:pl-0">
            {/* Verbindungslinie zum naechsten Punkt */}
            {!letzter && <span aria-hidden="true" className="absolute top-4 bottom-0 left-[7px] w-0.5 bg-linie sm:top-[7px] sm:right-0 sm:bottom-auto sm:left-4 sm:h-0.5 sm:w-auto" />}
            <span
              aria-hidden="true"
              className={cn("absolute top-0.5 left-0 size-4 rounded-full sm:top-0", p.heute && "border-2 bg-flaeche")}
              style={p.heute ? { borderColor: ton } : { background: ton }}
            />
            <span className={cn("text-[15px] font-bold tabular-nums", vorbei && "text-text-hinweis")}>{p.heute ? t("pcn.heute") : datum(p.tag)}</span>
            {p.heute ? (
              <span className="text-sm text-text-hinweis">{datum(p.tag)}</span>
            ) : (
              <ul className={cn("flex flex-col text-sm", vorbei ? "text-text-hinweis" : "text-text-zweit")}>
                {p.namen.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const MERKMALE = ["einbau", "form", "funktion", "sonstiges"] as const;

function Ersatz({ e, a, backoffice }: { e: PcnEintrag["ersatz"][number]; a: Detail; backoffice?: Backoffice }) {
  const { t } = useT();
  // Liegt der Ersatz als Asset derselben Organisation im Portal? Dann direkt verlinken.
  const suche = e.bestellnummer ? `/api/assets?organisation=${a.organisationId}&q=${encodeURIComponent(e.bestellnummer)}&proSeite=5` : null;
  const treffer = useDaten<AssetListe>(suche).daten?.eintraege.find((x) => x.bestellnummer === e.bestellnummer || x.itemId === e.bestellnummer);
  const ziel = treffer ? assetPfad(treffer, backoffice ? `/backoffice/${backoffice.orgId}/assets` : "/assets") : null;
  const merkmale = MERKMALE.filter((k) => e.passung[k] !== undefined);

  return (
    <div className="flex flex-col gap-3 border border-linie bg-grund px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[17px] font-bold [overflow-wrap:anywhere]">{e.bezeichnung ?? e.bestellnummer}</span>
        {e.bezeichnung && e.bestellnummer && <span className="font-mono text-xs text-text-hinweis">{e.bestellnummer}</span>}
        {ziel && (
          <Link to={ziel} className="mt-1 self-start text-sm font-semibold text-primaer-dunkel hover:underline">
            {t("pcn.zumErsatz")} →
          </Link>
        )}
      </div>
      {merkmale.length > 0 && (
        <dl className="grid shrink-0 grid-cols-[auto_6rem_auto] items-center gap-x-3 gap-y-1.5 text-[13px]">
          {merkmale.map((k) => {
            const anteil = Math.round(e.passung[k]! * 100);
            return (
              <div key={k} className="contents">
                <dt className="text-text-zweit">{t(`passung.${k}` as Schluessel)}</dt>
                <dd className="h-1.5 bg-linie" aria-hidden="true">
                  <span className="block h-full bg-primaer" style={{ width: `${Math.max(0, Math.min(100, anteil))}%` }} />
                </dd>
                <dd className="text-right font-bold tabular-nums">{anteil} %</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

// ---------- Teilmodelle ----------

/**
 * Teilmodelle: ab `md` eine Leiste links mit allen Teilmodellen untereinander, der Inhalt
 * rechts. Darunter eine Auswahlliste ueber dem Inhalt. Vorher brachen Pillen um, sobald es
 * mehr als vier Teilmodelle gab.
 */
function Teilmodelle({ a, backoffice }: { a: Detail; backoffice?: Backoffice }) {
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
                {/* Lange Namen ohne Leerzeichen (etwa aus idShorts) brechen sonst ueber den Rand. */}
                <span className="min-w-0 [overflow-wrap:anywhere]">{s.name}</span>
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
          {/* Neu einsetzen je Teilmodell, damit eine alte Meldung nicht beim naechsten stehen bleibt.
              Der Schluessel muss sich von dem des Inhalts darunter unterscheiden: zwei Geschwister mit
              gleichem key liessen bei jedem Wechsel einen Kopf stehen (06.11.2026, 10 Koepfe nach 5 Runden). */}
          <TeilmodellKopf key={`kopf:${aktiv.id}`} a={a} name={aktiv.name} smId={aktiv.id} backoffice={backoffice} />
          {!elemente ? (
            <p className="text-sm text-text-hinweis">{t("teilmodell.nichtGeladen")}</p>
          ) : elemente.length === 0 ? (
            <p className="text-sm text-text-hinweis">{t("teilmodell.leer")}</p>
          ) : (
            <Teilmodell key={`inhalt:${aktiv.id}`} elemente={elemente} herkunft={{ asset: a, submodelId: aktiv.id }} />
          )}
        </div>
      </div>
    </Abschnitt>
  );
}

/** Name des Teilmodells und im Backoffice der Knopf zum Neu-Abrufen samt Meldung. */
function TeilmodellKopf({ a, name, smId, backoffice }: { a: Detail; name: string; smId: string; backoffice?: Backoffice }) {
  const u = useT();
  const { t, sprache } = u;
  const { auffrischen } = useStrom();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung | null>(null);

  async function abrufen() {
    if (!backoffice) return;
    setLaeuft(true);
    setMeldung(null);
    try {
      const r = await api<{ name: string; fehler: string | null }>(
        mitSprache(`${boPfad(backoffice, a)}/teilmodelle/abrufen?sm=${encodeURIComponent(smId)}`, sprache),
        { methode: "POST" },
      );
      setMeldung(
        r.fehler === null
          ? { art: "ok", text: t("abruf.teilmodellOk", { name: r.name }), einzeln: [] }
          : { art: "fehler", text: `${t("abruf.teilmodellFehler", { name: r.name })} ${t("abruf.bestehtWeiter")}`, einzeln: [{ name: t("abruf.grund"), grund: r.fehler }] },
      );
      auffrischen();
    } catch (f) {
      setMeldung({ art: "fehler", text: fehlertext(f, u), einzeln: [] });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      {(backoffice || name) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="hidden min-w-0 text-lg font-bold [overflow-wrap:anywhere] md:block">{name}</h3>
          {backoffice && (
            <Knopf art="rand" className="h-9 px-4 text-sm" laedt={laeuft} onClick={() => void abrufen()}>
              {t("detail.abrufenTeilmodell")}
            </Knopf>
          )}
        </div>
      )}
      {meldung && <Abrufmeldung m={meldung} aufSchliessen={() => setMeldung(null)} />}
    </>
  );
}

// ---------- Verlauf ----------

function Verlauf({ liste, backoffice }: { liste: Ereignis[]; backoffice?: Backoffice }) {
  const { t } = useT();
  return (
    <Abschnitt titel={t("detail.verlauf")}>
      {liste.length === 0 ? (
        <p className="text-sm text-text-hinweis">{t("detail.verlaufLeer")}</p>
      ) : (
        <ol className="flex flex-col">
          {liste.map((e) => (
            <VerlaufZeile key={e.lfd} e={e} rohBasis={backoffice ? `/api/backoffice/${backoffice.orgId}/ereignisse` : null} />
          ))}
        </ol>
      )}
    </Abschnitt>
  );
}

/** Eine Zeile im Verlauf; im Backoffice mit aufklappbarem Rohevent wie im Ereignisprotokoll. */
function VerlaufZeile({ e, rohBasis }: { e: Ereignis; rohBasis: string | null }) {
  const { datumZeit } = useT();
  const roh = useRohdaten(`${rohBasis ?? ""}/${e.lfd}`);
  return (
    <li className="flex flex-col gap-2 border-b border-linie py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ArtMarkierung art={e.art} abkuendigung={e.pcn?.abkuendigung} />
            <time dateTime={e.zeit} className="text-sm text-text-hinweis tabular-nums">
              {datumZeit(e.zeit)}
            </time>
          </div>
          <p className="font-semibold">{e.titel}</p>
          {e.aenderungen && e.aenderungen.length > 0 ? <Aenderungen liste={e.aenderungen} /> : e.zusatz && <p className="text-sm text-text-zweit">{e.zusatz}</p>}
        </div>
        {rohBasis && <RohKnopf offen={roh.offen} aufKlick={() => void roh.umschalten()} />}
      </div>
      {rohBasis && roh.offen && <RohAnsicht roh={roh.roh} />}
    </li>
  );
}
