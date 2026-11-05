import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import type { Kennzahlen, Organisation } from "../../api.ts";
import { Augenbraue, Flaeche, Kennzahlenreihe, Seitenkopf, Zustand } from "../../bausteine/basis.tsx";
import { OrgMarke } from "../../bausteine/fach.tsx";
import { useT } from "../../i18n/sprache.tsx";
import { useDaten } from "../../strom.tsx";
import { Assetliste } from "./assetliste.tsx";

export function Organisationen() {
  const { t, zahl } = useT();
  const { daten, fehler, laedt } = useDaten<(Organisation & { assets: number })[]>("/api/organisationen");
  return (
    <>
      <Seitenkopf titel={t("org.titel")} unter={t("org.unter")} />
      <Zustand laedt={laedt && !daten} fehler={fehler} leer={daten?.length === 0} leerText={t("org.leer")}>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {daten?.map((o) => (
            <li key={o.id}>
              <Link to={`/organisationen/${o.slug}`} className="group block h-full">
                <Flaeche
                  className="flex h-full flex-col gap-4 border-t-4 p-5 transition-shadow group-hover:shadow-[0_6px_18px_rgb(27_29_38/0.12)]"
                  style={{ borderTopColor: o.farbe }}
                >
                  <span className="flex items-center gap-3">
                    <OrgMarke id={o.id} name={o.name} farbe={o.farbe} hatLogo={o.hatLogo} groesse={48} />
                    <span className="min-w-0 text-lg leading-snug font-bold group-hover:underline">{o.name}</span>
                  </span>
                  {o.beschreibung && <p className="line-clamp-3 text-sm leading-relaxed text-text-zweit">{o.beschreibung}</p>}
                  <span className="mt-auto text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("org.assets", { n: zahl(o.assets) })}</span>
                </Flaeche>
              </Link>
            </li>
          ))}
        </ul>
      </Zustand>
    </>
  );
}

/** Oeffentliche Organisationsseite unter `/organisationen/:slug`. */
export function Organisationsseite() {
  const { slug } = useParams();
  const { t } = useT();
  return (
    <>
      <Link to="/organisationen" className="self-start text-sm font-semibold text-text-hinweis hover:text-text">
        {t("org.zurueck")}
      </Link>
      <OrgAnsicht slug={slug ?? ""} />
    </>
  );
}

/**
 * Profilkopf, Kennzahlen und die eigene Asset-Liste einer Organisation. Dieselbe Ansicht
 * oeffentlich und im Backoffice; dort fuehren die Asset-Links ins Backoffice und eine private
 * Organisation bekommt einen Hinweis.
 */
export function OrgAnsicht({ slug, basisPfad, privatHinweis }: { slug: string; basisPfad?: string; privatHinweis?: ReactNode }) {
  const { t, zahl } = useT();
  const { daten: o, fehler, laedt } = useDaten<Organisation & { kennzahlen: Kennzahlen }>(`/api/organisationen/${encodeURIComponent(slug)}`);

  return (
    <Zustand laedt={laedt && !o} fehler={fehler === "nicht-gefunden" ? null : fehler} leer={fehler === "nicht-gefunden"} leerText={t("org.nichtGefunden")}>
      {o && (
        <>
          {!o.oeffentlich && privatHinweis}
          <Flaeche className="flex flex-col gap-5 border-t-4 p-6 sm:flex-row sm:items-start sm:p-8" style={{ borderTopColor: o.farbe }}>
            <OrgMarke id={o.id} name={o.name} farbe={o.farbe} hatLogo={o.hatLogo} groesse={88} />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Augenbraue>{t("nav.organisationen")}</Augenbraue>
              <h1 className="text-[32px] leading-tight font-bold tracking-[-0.02em] sm:text-4xl">{o.name}</h1>
              {o.beschreibung && <p className="max-w-[52rem] text-[15px] leading-relaxed whitespace-pre-line text-text-zweit">{o.beschreibung}</p>}
              {(o.webseite || o.kontaktEmail) && (
                <dl className="flex flex-wrap gap-x-8 gap-y-2 pt-1 text-[15px]">
                  {o.webseite && (
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("org.webseite")}</dt>
                      <dd>
                        <a href={o.webseite} target="_blank" rel="noreferrer noopener" className="font-semibold text-primaer-dunkel hover:underline">
                          {o.webseite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                        </a>
                      </dd>
                    </div>
                  )}
                  {o.kontaktEmail && (
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[11px] font-semibold tracking-[0.08em] text-text-hinweis uppercase">{t("org.kontakt")}</dt>
                      <dd>
                        <a href={`mailto:${o.kontaktEmail}`} className="font-semibold text-primaer-dunkel hover:underline">
                          {o.kontaktEmail}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </Flaeche>
          <Kennzahlenreihe
            className="lg:grid-cols-5"
            werte={[
              { zahl: zahl(o.kennzahlen.assets), text: t("kz.assets") },
              { zahl: zahl(o.kennzahlen.neuHeute), text: t("kz.neuHeute"), ton: "var(--color-art-registriert)" },
              { zahl: zahl(o.kennzahlen.updates), text: t("kz.updates"), ton: "var(--color-art-aktualisiert)" },
              { zahl: zahl(o.kennzahlen.pcns), text: t("kz.pcns"), ton: "var(--color-art-pcn)" },
              { zahl: zahl(o.kennzahlen.abkuendigungen), text: t("kz.abkuendigungen"), ton: "var(--color-art-abkuendigung)" },
            ]}
          />
          <Assetliste organisationId={o.id} titel={t("org.assetsVon", { name: o.name })} basisPfad={basisPfad} />
        </>
      )}
    </Zustand>
  );
}
