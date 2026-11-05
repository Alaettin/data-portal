import { Link } from "react-router";
import { assetPfad, type AssetKurz, type Kennzahlen } from "../../api.ts";
import { Abschnitt, cn, Kennzahlenreihe, Seitenkopf, Zustand } from "../../bausteine/basis.tsx";
import { OrgLink, Produktbild } from "../../bausteine/fach.tsx";
import { useT } from "../../i18n/sprache.tsx";
import { frischSchluessel, useDaten, useStrom } from "../../strom.tsx";
import { Assetliste } from "./assetliste.tsx";

export function Uebersicht() {
  const { t, zahl } = useT();
  const kz = useDaten<Kennzahlen & { organisationen: number }>("/api/uebersicht").daten;

  return (
    <>
      <Seitenkopf augenbraue={t("dash.augenbraue")} titel={t("dash.titel")} unter={t("dash.unter")} />
      <Kennzahlenreihe
        werte={[
          { zahl: kz ? zahl(kz.assets) : "·", text: t("kz.assets") },
          { zahl: kz ? zahl(kz.neuHeute) : "·", text: t("kz.neuHeute"), ton: "var(--color-art-registriert)" },
          { zahl: kz ? zahl(kz.updates) : "·", text: t("kz.updates"), ton: "var(--color-art-aktualisiert)" },
          { zahl: kz ? zahl(kz.pcns) : "·", text: t("kz.pcns"), ton: "var(--color-art-pcn)" },
          { zahl: kz ? zahl(kz.abkuendigungen) : "·", text: t("kz.abkuendigungen"), ton: "var(--color-art-abkuendigung)" },
          { zahl: kz ? zahl(kz.organisationen) : "·", text: t("kz.organisationen") },
        ]}
      />
      <NeuRegistriert />
      <Assetliste />
    </>
  );
}

/** Die zuletzt registrierten Assets als Kacheln; frisch eingetroffene leuchten kurz auf. */
function NeuRegistriert() {
  const { t, vorWann } = useT();
  const { frisch } = useStrom();
  const { daten, fehler, laedt } = useDaten<AssetKurz[]>("/api/assets/neu?limit=8");

  return (
    <Abschnitt titel={t("neu.titel")}>
      <Zustand laedt={laedt && !daten} fehler={fehler} leer={daten?.length === 0} leerText={t("neu.leer")}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {daten?.map((a) => (
            <li key={`${a.endpunktId}/${a.itemId}`}>
              <div className={cn("flex h-full gap-3 border border-linie p-3 transition-colors hover:border-linie-feld", frisch.has(frischSchluessel(a)) && "neu-eingetroffen")}>
                <Produktbild a={a} groesse={56} />
                <div className="flex min-w-0 flex-col gap-1">
                  <Link to={assetPfad(a)} className="line-clamp-2 leading-snug font-semibold hover:underline">
                    {a.name ?? a.itemId}
                  </Link>
                  <span className="truncate text-[13px]">
                    <OrgLink slug={a.organisationSlug} name={a.organisation} farbe={a.organisationFarbe} />
                  </span>
                  {a.registriert && (
                    <time dateTime={a.registriert} className="text-xs text-text-hinweis">
                      {vorWann(a.registriert)}
                    </time>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Zustand>
    </Abschnitt>
  );
}
