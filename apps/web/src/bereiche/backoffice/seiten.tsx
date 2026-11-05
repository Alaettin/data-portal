import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { api, ApiFehler, type Endpunkt, type OrganisationProfil } from "../../api.ts";
import {
  Abschnitt,
  Auswahl,
  Beschriftet,
  cn,
  Eingabe,
  Erfolgshinweis,
  Fehlerhinweis,
  Feld,
  Flaeche,
  Knopf,
  knopfKlassen,
  Markierung,
  Schalter,
  Seitenkopf,
  Textfeld,
} from "../../bausteine/basis.tsx";
import { Formularfenster, Rueckfrage } from "../../bausteine/dialog.tsx";
import { OrgMarke } from "../../bausteine/fach.tsx";
import { useT, type Uebersetzer } from "../../i18n/sprache.tsx";
import { useKonto } from "../../konto.tsx";
import { useStrom } from "../../strom.tsx";
import { AssetDetail } from "../besucher/asset-detail.tsx";
import { OrgAnsicht } from "../besucher/organisationen.tsx";
import { useOrg } from "./rahmen.tsx";

/** Fehler einer Aktion als Klartext. */
export function fehlertext(f: unknown, u: Uebersetzer): string {
  if (f instanceof ApiFehler) return u.fehler(f.code, { grund: f.grund ?? "", status: f.status });
  return u.fehler("verbindung");
}

// ---------- Organisationsseite ----------

/**
 * Die eigene Organisationsseite, dieselbe wie oeffentlich, aber immer sichtbar (auch privat)
 * und mit Asset-Links ins Backoffice. Ersetzt die fruehere Uebersicht (Nutzervorgabe 04.11.2026).
 */
export function BoOrgSeite() {
  const { orgId, daten } = useOrg();
  const { t } = useT();
  return (
    <OrgAnsicht
      slug={daten.organisation.slug}
      basisPfad={`/backoffice/${orgId}/assets`}
      privatHinweis={
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-art-pcn bg-flaeche px-5 py-4 shadow-flaeche">
          <span className="text-[15px]">{t("bo.privat")}</span>
          <Link to={`/backoffice/${orgId}/profil`} className={knopfKlassen("rand", "h-9 px-4 text-sm")}>
            {t("bo.privatAendern")}
          </Link>
        </div>
      }
    />
  );
}

/** Asset-Detail im Backoffice, auch fuer private Organisationen. */
export function BoAssetDetail() {
  const { orgId } = useOrg();
  const { t } = useT();
  return <AssetDetail zurueck={{ pfad: `/backoffice/${orgId}`, text: `← ${t("bo.organisationsseite")}` }} />;
}

/** Takt in Zahl und Einheit zerlegen: 7200 s → 2 h, 120 s → 2 min, 90 s → 90 s. */
type Einheit = "s" | "min" | "h";
const FAKTOR: Record<Einheit, number> = { s: 1, min: 60, h: 3600 };
function taktZerlegen(sekunden: number): { zahl: number; einheit: Einheit } {
  if (sekunden % 3600 === 0) return { zahl: sekunden / 3600, einheit: "h" };
  if (sekunden % 60 === 0) return { zahl: sekunden / 60, einheit: "min" };
  return { zahl: sekunden, einheit: "s" };
}
function taktText(sekunden: number, t: Uebersetzer["t"]): string {
  const { zahl, einheit } = taktZerlegen(sekunden);
  return t("ep.taktWert", { wert: `${zahl} ${einheit}` });
}

function EndpunktZustand({ e }: { e: Endpunkt }) {
  const { t } = useT();
  if (e.liest) return <Markierung text={t("ep.liest")} farbe="var(--color-art-aktualisiert)" />;
  if (e.letzterFehler) return <Markierung text={t("ep.fehler")} farbe="var(--color-fehler)" />;
  return e.aktiv ? <Markierung text={t("ep.aktiv")} /> : <Markierung text={t("ep.pausiert")} farbe="var(--color-text-hinweis)" />;
}

// ---------- Endpunkte ----------

type Formular = { id: number | null; name: string; feedUrl: string; taktZahl: string; taktEinheit: Einheit; aktiv: boolean };
const LEER: Formular = { id: null, name: "", feedUrl: "", taktZahl: "1", taktEinheit: "min", aktiv: true };

function ausEndpunkt(e: Endpunkt): Formular {
  const { zahl, einheit } = taktZerlegen(e.intervallS);
  return { id: e.id, name: e.name, feedUrl: e.feedUrl, taktZahl: String(zahl), taktEinheit: einheit, aktiv: e.aktiv };
}

export function BoEndpunkte() {
  const { orgId, daten } = useOrg();
  const u = useT();
  const { t, zahl, datumZeit, vorWann } = u;
  const { auffrischen } = useStrom();
  const [formular, setFormular] = useState<Formular | null>(null);
  const [frage, setFrage] = useState<{ art: "loeschen" | "neu"; e: Endpunkt } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const basis = `/api/backoffice/${orgId}/endpunkte`;

  function oeffnen(f: Formular) {
    setFormular(f);
    setFehler(null);
    setTest(null);
  }

  async function speichern() {
    if (!formular) return;
    setLaeuft(true);
    setFehler(null);
    try {
      // Der Server begrenzt auf 30 s bis 24 h; hier wird nur umgerechnet.
      const intervallS = Math.round(Number(formular.taktZahl.replace(",", ".")) * FAKTOR[formular.taktEinheit]);
      const koerper = { name: formular.name, feedUrl: formular.feedUrl, intervallS, aktiv: formular.aktiv };
      await api(formular.id === null ? basis : `${basis}/${formular.id}`, { methode: formular.id === null ? "POST" : "PATCH", koerper });
      setFormular(null);
      auffrischen();
    } catch (f) {
      setFehler(fehlertext(f, u));
    } finally {
      setLaeuft(false);
    }
  }

  async function testen() {
    if (!formular) return;
    setTest(null);
    try {
      const r = await api<{ anzahl: number }>(`${basis}/test`, { methode: "POST", koerper: { feedUrl: formular.feedUrl } });
      setTest({ ok: true, text: t("ep.testOk", { n: zahl(r.anzahl) }) });
    } catch (f) {
      setTest({ ok: false, text: fehlertext(f, u) });
    }
  }

  async function aktion(pfad: string, methode = "POST") {
    try {
      await api(pfad, { methode });
    } finally {
      auffrischen();
    }
  }

  async function bestaetigen() {
    if (!frage) return;
    setLaeuft(true);
    setFehler(null);
    try {
      if (frage.art === "loeschen") await api(`${basis}/${frage.e.id}`, { methode: "DELETE" });
      else await api(`${basis}/${frage.e.id}/neu-einlesen`, { methode: "POST" });
      setFrage(null);
      auffrischen();
    } catch (f) {
      setFehler(fehlertext(f, u));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-[46rem] text-[15px] leading-relaxed text-text-zweit">{t("ep.unter")}</p>
        <Knopf onClick={() => oeffnen(LEER)}>{t("ep.neu")}</Knopf>
      </div>

      {daten.endpunkte.length === 0 ? (
        <Flaeche className="p-8 text-center text-sm text-text-hinweis">{t("ep.leer")}</Flaeche>
      ) : (
        <div className="flex flex-col gap-4">
          {daten.endpunkte.map((e) => (
            <Flaeche key={e.id} className="flex flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-linie px-5 py-4 sm:px-6">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{e.name}</h2>
                    <EndpunktZustand e={e} />
                  </span>
                  <code className="font-mono text-xs break-all text-text-hinweis">{e.feedUrl}</code>
                </div>
                <Schalter
                  an={e.aktiv}
                  text={t("ep.aktivSchalter")}
                  aufWechsel={(an) => void api(`${basis}/${e.id}`, { methode: "PATCH", koerper: { aktiv: an } }).finally(auffrischen)}
                />
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4 sm:px-6">
                <Wert titel={t("ep.takt")}>{taktText(e.intervallS, t)}</Wert>
                <Wert titel={t("ep.letzterAbruf")}>{e.letzterAbruf ? <time title={datumZeit(e.letzterAbruf)}>{vorWann(e.letzterAbruf)}</time> : t("ep.nie")}</Wert>
                <Wert titel={t("ep.naechsterAbruf")}>{e.naechsterAbruf && e.aktiv ? <time title={datumZeit(e.naechsterAbruf)}>{vorWann(e.naechsterAbruf)}</time> : "·"}</Wert>
                <Wert titel={t("kz.assets")}>{t("ep.bestand", { events: zahl(e.events), assets: zahl(e.assets) })}</Wert>
              </dl>
              {e.letzterFehler && (
                <div className="px-5 pb-4 sm:px-6">
                  <Fehlerhinweis>
                    {t("ep.fehler")}: {e.letzterFehler}
                  </Fehlerhinweis>
                </div>
              )}
              <div className="flex flex-wrap gap-2 border-t border-linie px-5 py-3 sm:px-6">
                <Knopf art="rand" className="h-9 px-4 text-sm" laedt={e.liest} onClick={() => void aktion(`${basis}/${e.id}/lesen`)}>
                  {e.liest ? t("ep.liest") : t("ep.jetztLesen")}
                </Knopf>
                <Knopf art="still" className="h-9 px-4 text-sm" onClick={() => oeffnen(ausEndpunkt(e))}>
                  {t("allg.bearbeiten")}
                </Knopf>
                <Knopf art="still" className="h-9 px-4 text-sm" onClick={() => setFrage({ art: "neu", e })}>
                  {t("ep.neuEinlesen")}
                </Knopf>
                <Knopf art="still" className="ml-auto h-9 px-4 text-sm hover:text-fehler" onClick={() => setFrage({ art: "loeschen", e })}>
                  {t("ep.loeschen")}
                </Knopf>
              </div>
            </Flaeche>
          ))}
        </div>
      )}

      <Formularfenster
        offen={formular !== null}
        aufOffen={(o) => !o && setFormular(null)}
        titel={formular?.id === null ? t("ep.neu") : t("ep.bearbeitenTitel")}
        absendenText={formular?.id === null ? t("allg.anlegen") : t("allg.speichern")}
        laeuft={laeuft}
        fehler={fehler}
        aufAbsenden={() => void speichern()}
      >
        {formular && (
          <>
            <Eingabe titel={t("ep.name")} value={formular.name} placeholder={t("ep.namePlatzhalter")} onChange={(e) => setFormular({ ...formular, name: e.target.value })} required />
            <Beschriftet titel={t("ep.url")} hinweis={t("ep.urlHinweis")}>
              <span className="flex gap-2">
                <Feld
                  type="url"
                  value={formular.feedUrl}
                  onChange={(e) => {
                    setFormular({ ...formular, feedUrl: e.target.value });
                    setTest(null);
                  }}
                  className="min-w-0 flex-1 font-mono text-sm"
                  required
                />
                <Knopf art="rand" onClick={() => void testen()} disabled={!formular.feedUrl}>
                  {t("ep.testen")}
                </Knopf>
              </span>
            </Beschriftet>
            {test && (test.ok ? <Erfolgshinweis>{test.text}</Erfolgshinweis> : <Fehlerhinweis>{test.text}</Fehlerhinweis>)}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold">{t("ep.takt")}</legend>
              <span className="flex gap-2">
                <Feld
                  type="number"
                  min={1}
                  step="any"
                  inputMode="decimal"
                  aria-label={t("ep.taktZahl")}
                  value={formular.taktZahl}
                  onChange={(e) => setFormular({ ...formular, taktZahl: e.target.value })}
                  className="w-28"
                  required
                />
                <Auswahl
                  aria-label={t("ep.taktEinheit")}
                  value={formular.taktEinheit}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setFormular({ ...formular, taktEinheit: e.target.value as Einheit })}
                  className="w-auto"
                >
                  {(["s", "min", "h"] as const).map((x) => (
                    <option key={x} value={x}>
                      {t(`einheit.${x}`)}
                    </option>
                  ))}
                </Auswahl>
              </span>
              <span className="text-xs text-text-hinweis">{t("ep.taktHinweis")}</span>
            </fieldset>
            <Schalter an={formular.aktiv} text={t("ep.aktivSchalter")} aufWechsel={(an) => setFormular({ ...formular, aktiv: an })} />
          </>
        )}
      </Formularfenster>

      <Rueckfrage
        offen={frage !== null}
        aufOffen={(o) => !o && setFrage(null)}
        titel={frage?.art === "loeschen" ? t("ep.loeschen") : t("ep.neuEinlesen")}
        bestaetigenText={frage?.art === "loeschen" ? t("allg.loeschen") : t("ep.neuEinlesen")}
        art="gefahr"
        laeuft={laeuft}
        fehler={fehler}
        aufBestaetigen={() => void bestaetigen()}
      >
        <p>{frage && (frage.art === "loeschen" ? t("ep.loeschenFrage", { name: frage.e.name }) : t("ep.neuEinlesenFrage", { name: frage.e.name }))}</p>
      </Rueckfrage>
    </>
  );
}

function Wert({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{titel}</dt>
      <dd className="text-[15px]">{children}</dd>
    </div>
  );
}

// ---------- Profil ----------

type ProfilFormular = {
  farbe: string;
  oeffentlich: boolean;
  beschreibungDe: string;
  beschreibungEn: string;
  webseite: string;
  kontaktEmail: string;
  /** Data-URL eines neu gewaehlten Logos, `null` zum Entfernen, `undefined` unveraendert. */
  logo?: string | null;
};

function ausProfil(o: OrganisationProfil): ProfilFormular {
  return {
    farbe: o.farbe,
    oeffentlich: o.oeffentlich,
    beschreibungDe: o.beschreibungDe ?? "",
    beschreibungEn: o.beschreibungEn ?? "",
    webseite: o.webseite ?? "",
    kontaktEmail: o.kontaktEmail ?? "",
  };
}

export function BoProfil() {
  const { orgId, daten } = useOrg();
  // Neu einsetzen, wenn eine andere Organisation geoeffnet wird; sonst stuende das alte Formular da.
  return <ProfilForm key={orgId} orgId={orgId} profil={daten.organisation} />;
}

function ProfilForm({ orgId, profil }: { orgId: number; profil: OrganisationProfil }) {
  const u = useT();
  const { t } = u;
  const { auffrischen } = useStrom();
  const [f, setF] = useState<ProfilFormular>(() => ausProfil(profil));
  const [geaendert, setGeaendert] = useState(false);
  const [stand, setStand] = useState<{ laeuft: boolean; fehler: string | null; ok: boolean }>({ laeuft: false, fehler: null, ok: false });

  function setze(teil: Partial<ProfilFormular>) {
    setF((alt) => ({ ...alt, ...teil }));
    setGeaendert(true);
    setStand((s) => ({ ...s, ok: false }));
  }

  function logoWaehlen(e: ChangeEvent<HTMLInputElement>) {
    // Die Datei vor dem Zuruecksetzen sichern: `value = ""` leert auch die FileList.
    const datei = e.target.files?.[0];
    e.target.value = "";
    if (!datei) return;
    const leser = new FileReader();
    leser.onload = () => setze({ logo: String(leser.result) });
    leser.readAsDataURL(datei);
  }

  async function speichern(e: FormEvent) {
    e.preventDefault();
    setStand({ laeuft: true, fehler: null, ok: false });
    try {
      await api(`/api/backoffice/${orgId}/profil`, { methode: "PATCH", koerper: f });
      setF((alt) => ({ ...alt, logo: undefined }));
      setGeaendert(false);
      setStand({ laeuft: false, fehler: null, ok: true });
      auffrischen();
    } catch (fehler) {
      setStand({ laeuft: false, fehler: fehlertext(fehler, u), ok: false });
    }
  }

  const logoVorschau = f.logo === undefined ? (profil.hatLogo ? `/api/organisationen/${orgId}/logo` : null) : f.logo;

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => void speichern(e)}>
      <p className="max-w-[46rem] text-[15px] leading-relaxed text-text-zweit">{t("prof.unter")}</p>

      <Abschnitt titel={t("prof.sichtbarkeit")}>
        <div className="flex flex-col gap-2">
          <Schalter an={f.oeffentlich} text={t("prof.oeffentlich")} aufWechsel={(an) => setze({ oeffentlich: an })} />
          <span className="text-sm text-text-hinweis">{t("prof.oeffentlichHinweis")}</span>
        </div>
      </Abschnitt>

      <Abschnitt titel={t("prof.auftritt")}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Beschriftet titel={t("prof.name")} hinweis={t("prof.nameHinweis")}>
            <Feld value={profil.name} readOnly disabled className="bg-grund" />
          </Beschriftet>
          <Beschriftet titel={t("prof.farbe")}>
            <span className="flex items-center gap-3">
              <input
                type="color"
                value={f.farbe}
                onChange={(e) => setze({ farbe: e.target.value })}
                className="h-11 w-16 cursor-pointer border border-linie-feld bg-flaeche p-1"
                aria-label={t("prof.farbe")}
              />
              <code className="font-mono text-sm">{f.farbe}</code>
            </span>
          </Beschriftet>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-[13px] font-semibold">{t("prof.logo")}</span>
            <div className="flex flex-wrap items-center gap-4">
              {logoVorschau ? (
                <span className="flex size-20 items-center justify-center border border-linie bg-flaeche">
                  <img src={logoVorschau} alt="" className="size-full object-contain p-1.5" />
                </span>
              ) : (
                <OrgMarke id={orgId} name={profil.name} farbe={f.farbe} hatLogo={false} groesse={80} />
              )}
              <label className={knopfKlassen("rand", "cursor-pointer")}>
                {t("prof.logoWaehlen")}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="sr-only" onChange={logoWaehlen} />
              </label>
              {logoVorschau && (
                <Knopf art="still" onClick={() => setze({ logo: null })}>
                  {t("prof.logoEntfernen")}
                </Knopf>
              )}
            </div>
            <span className="text-xs text-text-hinweis">{t("prof.logoHinweis")}</span>
          </div>
        </div>
      </Abschnitt>

      <Abschnitt titel={t("prof.texte")}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Beschriftet titel={t("prof.beschreibungDe")}>
            <Textfeld lang="de" value={f.beschreibungDe} onChange={(e) => setze({ beschreibungDe: e.target.value })} className="min-h-40" />
          </Beschriftet>
          <Beschriftet titel={t("prof.beschreibungEn")}>
            <Textfeld lang="en" value={f.beschreibungEn} onChange={(e) => setze({ beschreibungEn: e.target.value })} className="min-h-40" />
          </Beschriftet>
        </div>
      </Abschnitt>

      <Abschnitt titel={t("prof.kontaktdaten")}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Eingabe titel={t("prof.webseite")} type="url" placeholder="https://" value={f.webseite} onChange={(e) => setze({ webseite: e.target.value })} />
          <Eingabe titel={t("prof.kontakt")} type="email" value={f.kontaktEmail} onChange={(e) => setze({ kontaktEmail: e.target.value })} />
        </div>
      </Abschnitt>

      <div className="flex flex-wrap items-center gap-4">
        <Knopf type="submit" laedt={stand.laeuft} disabled={!geaendert}>
          {stand.laeuft ? t("allg.speichert") : t("allg.speichern")}
        </Knopf>
        {geaendert && <span className="text-sm text-text-hinweis">{t("allg.ungespeichert")}</span>}
        {stand.ok && <span className="text-sm font-semibold text-primaer-dunkel">{t("allg.gespeichert")}</span>}
      </div>
      {stand.fehler && <Fehlerhinweis>{stand.fehler}</Fehlerhinweis>}
    </form>
  );
}

// ---------- Konto ----------

export function Konto() {
  const u = useT();
  const { t } = u;
  const { nutzer } = useKonto();
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [wieder, setWieder] = useState("");
  const [stand, setStand] = useState<{ laeuft: boolean; fehler: string | null; ok: boolean }>({ laeuft: false, fehler: null, ok: false });

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (neu !== wieder) return setStand({ laeuft: false, fehler: t("konto.ungleich"), ok: false });
    setStand({ laeuft: true, fehler: null, ok: false });
    try {
      await api("/api/auth/passwort", { methode: "POST", koerper: { alt, neu } });
      setAlt("");
      setNeu("");
      setWieder("");
      setStand({ laeuft: false, fehler: null, ok: true });
    } catch (f) {
      setStand({ laeuft: false, fehler: fehlertext(f, u), ok: false });
    }
  }

  return (
    <>
      <Seitenkopf augenbraue={t("bo.konto")} titel={nutzer?.name ?? ""} unter={nutzer ? t("konto.angemeldetAls", { name: nutzer.name, email: nutzer.email }) : undefined} />
      <Abschnitt titel={t("konto.passwortAendern")} className="max-w-[36rem]">
        <form className="flex flex-col gap-4" onSubmit={(e) => void absenden(e)}>
          <Eingabe titel={t("konto.alt")} type="password" autoComplete="current-password" value={alt} onChange={(e) => setAlt(e.target.value)} required />
          <Eingabe titel={t("konto.neu")} hinweis={t("konto.neuHinweis")} type="password" autoComplete="new-password" minLength={12} value={neu} onChange={(e) => setNeu(e.target.value)} required />
          <Eingabe titel={t("konto.wiederholen")} type="password" autoComplete="new-password" value={wieder} onChange={(e) => setWieder(e.target.value)} required />
          {stand.fehler && <Fehlerhinweis>{stand.fehler}</Fehlerhinweis>}
          {stand.ok && <Erfolgshinweis>{t("konto.geaendert")}</Erfolgshinweis>}
          <Knopf type="submit" className={cn("self-start")} laedt={stand.laeuft}>
            {t("konto.passwortAendern")}
          </Knopf>
        </form>
      </Abschnitt>
    </>
  );
}
