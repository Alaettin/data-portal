import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../api.ts";
import { Auswahl, Beschriftet, Eingabe, Kopfzelle, Knopf, Markierung, Monowert, Reihe, Seitenkopf, Tabellenflaeche, Zelle, Zustand } from "../../bausteine/basis.tsx";
import { Formularfenster, Rueckfrage, Schaufenster } from "../../bausteine/dialog.tsx";
import { Symbolknopf, Symbolreihe } from "../../bausteine/symbole.tsx";
import { useT } from "../../i18n/sprache.tsx";
import { useKonto } from "../../konto.tsx";
import { useDaten, useStrom } from "../../strom.tsx";
import { fehlertext } from "../backoffice/seiten.tsx";

type OrgZeile = { id: number; slug: string; name: string; farbe: string; angelegt: string; nutzer: number; endpunkte: number; assets: number };
type NutzerZeile = {
  id: number;
  email: string;
  name: string;
  rolle: "admin" | "organisation";
  organisationId: number | null;
  organisation: string | null;
  aktiv: boolean;
  angelegt: string;
  letzteAnmeldung: string | null;
};

/** Gemeinsamer Ablauf fuer Formular und Rueckfrage: laeuft, Fehler, danach neu laden. */
function useAktion() {
  const u = useT();
  const { auffrischen } = useStrom();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function ausfuehren<T>(arbeit: () => Promise<T>): Promise<T | null> {
    setLaeuft(true);
    setFehler(null);
    try {
      const r = await arbeit();
      auffrischen();
      return r;
    } catch (f) {
      setFehler(fehlertext(f, u));
      return null;
    } finally {
      setLaeuft(false);
    }
  }
  return { laeuft, fehler, setFehler, ausfuehren };
}

// ---------- Organisationen ----------

export function VerwOrganisationen() {
  const { t, zahl, datum } = useT();
  const navigate = useNavigate();
  const { daten, fehler, laedt } = useDaten<OrgZeile[]>("/api/admin/organisationen");
  const a = useAktion();
  const [formular, setFormular] = useState<{ id: number | null; name: string } | null>(null);
  const [loeschen, setLoeschen] = useState<OrgZeile | null>(null);

  async function speichern() {
    if (!formular) return;
    const r = await a.ausfuehren(() =>
      formular.id === null
        ? api<{ id: number }>("/api/admin/organisationen", { methode: "POST", koerper: { name: formular.name } })
        : api<{ id: number }>(`/api/admin/organisationen/${formular.id}`, { methode: "PATCH", koerper: { name: formular.name } }),
    );
    if (r) setFormular(null);
  }

  return (
    <>
      <Seitenkopf
        augenbraue={t("verw.augenbraue")}
        titel={t("verw.organisationen")}
        rechts={
          <Knopf
            onClick={() => {
              a.setFehler(null);
              setFormular({ id: null, name: "" });
            }}
          >
            {t("verw.orgNeu")}
          </Knopf>
        }
      />
      <Zustand laedt={laedt && !daten} fehler={fehler} leer={daten?.length === 0} leerText={t("verw.orgLeer")}>
        <Tabellenflaeche>
          <table className="w-full border-collapse text-[15px] sm:min-w-[720px]">
            <thead className="max-sm:hidden">
              <tr>
                <Kopfzelle>{t("spalte.organisation")}</Kopfzelle>
                <Kopfzelle className="sm:w-24">{t("verw.spalteNutzer")}</Kopfzelle>
                <Kopfzelle className="sm:w-28">{t("verw.spalteEndpunkte")}</Kopfzelle>
                <Kopfzelle className="sm:w-24">{t("verw.spalteAssets")}</Kopfzelle>
                <Kopfzelle className="sm:w-32">{t("verw.spalteAngelegt")}</Kopfzelle>
                <Kopfzelle className="sm:w-40" />
              </tr>
            </thead>
            <tbody>
              {daten?.map((o) => (
                <Reihe key={o.id} className="sm:hover:bg-grund">
                  <Zelle>
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="size-3 shrink-0" style={{ background: o.farbe }} />
                      <Link to={`/backoffice/${o.id}`} className="font-semibold hover:underline">
                        {o.name}
                      </Link>
                      <code className="font-mono text-xs text-text-hinweis">/{o.slug}</code>
                    </span>
                  </Zelle>
                  <Zelle titel={t("verw.spalteNutzer")} className="tabular-nums">
                    {zahl(o.nutzer)}
                  </Zelle>
                  <Zelle titel={t("verw.spalteEndpunkte")} className="tabular-nums">
                    {zahl(o.endpunkte)}
                  </Zelle>
                  <Zelle titel={t("verw.spalteAssets")} className="tabular-nums">
                    {zahl(o.assets)}
                  </Zelle>
                  <Zelle titel={t("verw.spalteAngelegt")} className="text-text-zweit tabular-nums">
                    {datum(o.angelegt)}
                  </Zelle>
                  <Zelle>
                    <Symbolreihe>
                      <Symbolknopf symbol="oeffnen" beschriftung={t("verw.backofficeOeffnen")} onClick={() => navigate(`/backoffice/${o.id}`)} />
                      <Symbolknopf
                        symbol="bearbeiten"
                        beschriftung={t("verw.orgUmbenennen")}
                        onClick={() => {
                          a.setFehler(null);
                          setFormular({ id: o.id, name: o.name });
                        }}
                      />
                      <Symbolknopf
                        symbol="loeschen"
                        gefahr
                        beschriftung={t("verw.orgLoeschen")}
                        onClick={() => {
                          a.setFehler(null);
                          setLoeschen(o);
                        }}
                      />
                    </Symbolreihe>
                  </Zelle>
                </Reihe>
              ))}
            </tbody>
          </table>
        </Tabellenflaeche>
      </Zustand>

      <Formularfenster
        offen={formular !== null}
        aufOffen={(o) => !o && setFormular(null)}
        titel={formular?.id === null ? t("verw.orgNeu") : t("verw.orgUmbenennen")}
        absendenText={formular?.id === null ? t("allg.anlegen") : t("allg.speichern")}
        laeuft={a.laeuft}
        fehler={a.fehler}
        aufAbsenden={() => void speichern()}
      >
        {formular && (
          <Eingabe
            titel={t("verw.orgName")}
            hinweis={formular.id === null ? undefined : t("verw.orgUmbenennenHinweis")}
            value={formular.name}
            onChange={(e) => setFormular({ ...formular, name: e.target.value })}
            autoFocus
            required
          />
        )}
      </Formularfenster>

      <Rueckfrage
        offen={loeschen !== null}
        aufOffen={(o) => !o && setLoeschen(null)}
        titel={t("verw.orgLoeschen")}
        bestaetigenText={t("allg.loeschen")}
        art="gefahr"
        laeuft={a.laeuft}
        fehler={a.fehler}
        aufBestaetigen={() =>
          void a.ausfuehren(() => api(`/api/admin/organisationen/${loeschen!.id}`, { methode: "DELETE" })).then((r) => r && setLoeschen(null))
        }
      >
        <p>{loeschen && t("verw.orgLoeschenFrage", { name: loeschen.name })}</p>
      </Rueckfrage>
    </>
  );
}

// ---------- Nutzer ----------

export function VerwNutzer() {
  const { t, datumZeit } = useT();
  const { nutzer: ich } = useKonto();
  const { daten, fehler, laedt } = useDaten<NutzerZeile[]>("/api/admin/nutzer");
  const orgs = useDaten<OrgZeile[]>("/api/admin/organisationen").daten;
  const a = useAktion();
  const [formular, setFormular] = useState<{ name: string; email: string; organisationId: string } | null>(null);
  const [frage, setFrage] = useState<{ art: "passwort" | "loeschen"; n: NutzerZeile } | null>(null);
  const [startpasswort, setStartpasswort] = useState<{ name: string; email: string; passwort: string } | null>(null);

  async function anlegen() {
    if (!formular) return;
    const r = await a.ausfuehren(() =>
      api<{ nutzer: NutzerZeile; startpasswort: string }>("/api/admin/nutzer", {
        methode: "POST",
        koerper: { name: formular.name, email: formular.email, organisationId: Number(formular.organisationId) },
      }),
    );
    if (r) {
      setFormular(null);
      setStartpasswort({ name: r.nutzer.name, email: r.nutzer.email, passwort: r.startpasswort });
    }
  }

  async function bestaetigen() {
    if (!frage) return;
    if (frage.art === "loeschen") {
      const r = await a.ausfuehren(() => api(`/api/admin/nutzer/${frage.n.id}`, { methode: "DELETE" }));
      if (r) setFrage(null);
      return;
    }
    const r = await a.ausfuehren(() => api<{ startpasswort: string }>(`/api/admin/nutzer/${frage.n.id}/passwort`, { methode: "POST" }));
    if (r) {
      setStartpasswort({ name: frage.n.name, email: frage.n.email, passwort: r.startpasswort });
      setFrage(null);
    }
  }

  const keineOrg = orgs !== null && orgs.length === 0;

  return (
    <>
      <Seitenkopf
        augenbraue={t("verw.augenbraue")}
        titel={t("verw.nutzer")}
        rechts={
          <Knopf
            disabled={keineOrg}
            title={keineOrg ? t("verw.ersteOrgZuerst") : undefined}
            onClick={() => {
              a.setFehler(null);
              setFormular({ name: "", email: "", organisationId: "" });
            }}
          >
            {t("verw.nutzerNeu")}
          </Knopf>
        }
      />
      {keineOrg && <p className="text-sm text-text-hinweis">{t("verw.ersteOrgZuerst")}</p>}
      <Zustand laedt={laedt && !daten} fehler={fehler}>
        <Tabellenflaeche>
          <table className="w-full border-collapse text-[15px] sm:min-w-[820px]">
            <thead className="max-sm:hidden">
              <tr>
                <Kopfzelle>{t("verw.nutzerName")}</Kopfzelle>
                <Kopfzelle>{t("verw.nutzerOrg")}</Kopfzelle>
                <Kopfzelle className="sm:w-44">{t("verw.spalteLetzte")}</Kopfzelle>
                <Kopfzelle className="sm:w-32">{t("verw.spalteStatus")}</Kopfzelle>
                <Kopfzelle className="sm:w-36" />
              </tr>
            </thead>
            <tbody>
              {daten?.map((n) => {
                const selbst = n.id === ich?.id;
                return (
                  <Reihe key={n.id} className="sm:hover:bg-grund">
                    <Zelle>
                      <span className="flex min-w-0 flex-col">
                        <span className="font-semibold">
                          {n.name}
                          {selbst && <span className="ml-2 text-xs font-semibold text-text-hinweis">({t("verw.sie")})</span>}
                        </span>
                        <span className="truncate text-sm text-text-hinweis">{n.email}</span>
                      </span>
                    </Zelle>
                    <Zelle titel={t("verw.nutzerOrg")}>{n.rolle === "admin" ? <span className="text-text-hinweis">{t("verw.rolleAdmin")}</span> : n.organisation}</Zelle>
                    <Zelle titel={t("verw.spalteLetzte")} className="text-text-zweit tabular-nums">
                      {n.letzteAnmeldung ? datumZeit(n.letzteAnmeldung) : "·"}
                    </Zelle>
                    <Zelle titel={t("verw.spalteStatus")}>
                      {n.aktiv ? <Markierung text={t("verw.aktiv")} /> : <Markierung text={t("verw.gesperrt")} farbe="var(--color-fehler)" />}
                    </Zelle>
                    <Zelle>
                      {!selbst && (
                        <Symbolreihe>
                          <Symbolknopf
                            symbol={n.aktiv ? "sperren" : "entsperren"}
                            beschriftung={n.aktiv ? t("verw.sperren") : t("verw.entsperren")}
                            onClick={() => void a.ausfuehren(() => api(`/api/admin/nutzer/${n.id}`, { methode: "PATCH", koerper: { aktiv: !n.aktiv } }))}
                          />
                          <Symbolknopf
                            symbol="passwort"
                            beschriftung={t("verw.passwortZuruecksetzen")}
                            onClick={() => {
                              a.setFehler(null);
                              setFrage({ art: "passwort", n });
                            }}
                          />
                          <Symbolknopf
                            symbol="loeschen"
                            gefahr
                            beschriftung={t("verw.nutzerLoeschen")}
                            onClick={() => {
                              a.setFehler(null);
                              setFrage({ art: "loeschen", n });
                            }}
                          />
                        </Symbolreihe>
                      )}
                    </Zelle>
                  </Reihe>
                );
              })}
            </tbody>
          </table>
        </Tabellenflaeche>
        {daten?.length === 1 && <p className="text-sm text-text-hinweis">{t("verw.nutzerLeer")}</p>}
      </Zustand>

      <Formularfenster
        offen={formular !== null}
        aufOffen={(o) => !o && setFormular(null)}
        titel={t("verw.nutzerNeu")}
        absendenText={t("allg.anlegen")}
        laeuft={a.laeuft}
        fehler={a.fehler}
        aufAbsenden={() => void anlegen()}
      >
        {formular && (
          <>
            <Eingabe titel={t("verw.nutzerName")} value={formular.name} onChange={(e) => setFormular({ ...formular, name: e.target.value })} autoFocus required />
            <Eingabe titel={t("verw.nutzerEmail")} type="email" value={formular.email} onChange={(e) => setFormular({ ...formular, email: e.target.value })} required />
            <Beschriftet titel={t("verw.nutzerOrg")}>
              <Auswahl value={formular.organisationId} onChange={(e) => setFormular({ ...formular, organisationId: e.target.value })} required>
                <option value="" disabled>
                  {t("verw.nutzerOrgWaehlen")}
                </option>
                {orgs?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Auswahl>
            </Beschriftet>
          </>
        )}
      </Formularfenster>

      <Rueckfrage
        offen={frage !== null}
        aufOffen={(o) => !o && setFrage(null)}
        titel={frage?.art === "loeschen" ? t("verw.nutzerLoeschen") : t("verw.passwortZuruecksetzen")}
        bestaetigenText={frage?.art === "loeschen" ? t("allg.loeschen") : t("verw.passwortZuruecksetzen")}
        art={frage?.art === "loeschen" ? "gefahr" : "primaer"}
        laeuft={a.laeuft}
        fehler={a.fehler}
        aufBestaetigen={() => void bestaetigen()}
      >
        <p>{frage && (frage.art === "loeschen" ? t("verw.nutzerLoeschenFrage", { name: frage.n.name }) : t("verw.zuruecksetzenFrage", { name: frage.n.name }))}</p>
      </Rueckfrage>

      <Schaufenster offen={startpasswort !== null} aufOffen={(o) => !o && setStartpasswort(null)} titel={startpasswort ? t("verw.startpasswortTitel", { name: startpasswort.name }) : ""}>
        {startpasswort && (
          <div className="flex flex-col gap-4">
            <p className="text-[15px] leading-relaxed text-text-zweit">{t("verw.startpasswortHinweis", { email: startpasswort.email })}</p>
            <div className="bg-grund px-4 py-3 text-base">
              <Monowert wert={startpasswort.passwort} />
            </div>
          </div>
        )}
      </Schaufenster>
    </>
  );
}
