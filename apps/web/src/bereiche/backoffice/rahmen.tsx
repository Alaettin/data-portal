import type { CSSProperties } from "react";
import { Link, Navigate, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import { lesbareFarbe } from "../../bausteine/fach.tsx";
import type { Endpunkt, Kennzahlen, OrganisationProfil } from "../../api.ts";
import { Auswahl, cn, Knopf, knopfKlassen, Seitenkopf, Zustand } from "../../bausteine/basis.tsx";
import type { Schluessel } from "../../i18n/de.ts";
import { useT } from "../../i18n/sprache.tsx";
import { useKonto } from "../../konto.tsx";
import { Liveanzeige, Rahmen, Sprachwahl, type Reiter } from "../../rahmen.tsx";
import { useDaten } from "../../strom.tsx";

/** Alles hinter der Anmeldung. Ohne Sitzung zur Anmeldung, mit falscher Rolle zur eigenen Startseite. */
export function BackofficeRahmen({ nurAdmin = false }: { nurAdmin?: boolean }) {
  const konto = useKonto();
  const { t } = useT();
  const navigate = useNavigate();
  if (!konto.geprueft) return null;
  if (!konto.nutzer) return <Navigate to="/anmelden" replace />;
  const admin = konto.nutzer.rolle === "admin";
  if (nurAdmin && !admin) return <Navigate to={`/backoffice/${konto.organisation?.id ?? ""}`} replace />;

  const reiter: Reiter[] = admin
    ? [
        { pfad: "/verwaltung/organisationen", text: "verw.organisationen" },
        { pfad: "/verwaltung/nutzer", text: "verw.nutzer" },
        { pfad: "/backoffice", text: "nav.backoffice" },
        { pfad: "/konto", text: "bo.konto" },
      ]
    : [
        { pfad: `/backoffice/${konto.organisation?.id ?? ""}`, text: "nav.backoffice" },
        { pfad: "/konto", text: "bo.konto" },
      ];

  async function abmelden() {
    await konto.abmelden();
    navigate("/", { replace: true });
  }

  return (
    <Rahmen
      reiter={reiter}
      markenziel={admin ? "/verwaltung/organisationen" : `/backoffice/${konto.organisation?.id ?? ""}`}
      band={
        // Dunkles Band: man sieht immer, dass man im Backoffice ist, und kommt mit einem Klick
        // ins oeffentliche Portal (Nutzervorgabe 05.11.2026, vorher nur ein Textlink im Kopf).
        <div className="bg-text text-white">
          <div className="flex min-h-10 items-center gap-3 px-4 text-[13px] sm:px-6">
            <span className="min-w-0 truncate">
              <b className="font-bold tracking-[0.08em] uppercase">{t("nav.backoffice")}</b>
              <span className="text-white/70"> · {admin ? t("nav.verwaltung") : (konto.organisation?.name ?? "")}</span>
            </span>
            <Link to="/" className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
              {t("nav.zumOeffentlichen")}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      }
      rechts={
        <>
          <Liveanzeige />
          <Sprachwahl />
          <span className="hidden max-w-[14rem] min-w-0 truncate text-sm font-medium md:inline">{konto.nutzer.name}</span>
          <Knopf art="rand" className="h-[34px] px-3.5 text-[13px]" onClick={() => void abmelden()}>
            {t("nav.abmelden")}
          </Knopf>
        </>
      }
      menueExtras={[
        { text: t("nav.zumPortal"), aktion: () => navigate("/") },
        { text: t("nav.abmelden"), aktion: () => void abmelden() },
      ]}
    />
  );
}

export type OrgDaten = { organisation: OrganisationProfil; kennzahlen: Kennzahlen; endpunkte: Endpunkt[] };

export function useOrg() {
  return useOutletContext<{ orgId: number; daten: OrgDaten }>();
}

/** `/backoffice` ohne Organisation: Organisationsnutzer in die eigene, Admin in die erste. */
export function BackofficeStart() {
  const konto = useKonto();
  const { t } = useT();
  const { daten, fehler, laedt } = useDaten<{ id: number }[]>(konto.nutzer?.rolle === "admin" ? "/api/admin/organisationen" : null);
  if (konto.nutzer?.rolle !== "admin") return <Navigate to={`/backoffice/${konto.organisation?.id ?? ""}`} replace />;
  const erste = daten?.[0];
  if (erste) return <Navigate to={`/backoffice/${erste.id}`} replace />;
  return (
    <Zustand laedt={laedt} fehler={fehler} leer leerText={t("bo.keineOrg")}>
      {null}
    </Zustand>
  );
}

const UNTERREITER: { pfad: string; text: Schluessel }[] = [
  { pfad: "", text: "bo.organisationsseite" },
  { pfad: "/endpunkte", text: "bo.endpunkte" },
  { pfad: "/ereignisse", text: "bo.ereignisse" },
  { pfad: "/profil", text: "bo.profil" },
];

/** Kopf und Unterreiter einer Organisation; laedt ihre Daten einmal fuer alle Unterseiten. */
export function OrgBereich() {
  const { orgId } = useParams();
  const konto = useKonto();
  const { t } = useT();
  const navigate = useNavigate();
  const admin = konto.nutzer?.rolle === "admin";
  const { daten, fehler, laedt } = useDaten<OrgDaten>(`/api/backoffice/${orgId}`);
  const alle = useDaten<{ id: number; name: string }[]>(admin ? "/api/admin/organisationen" : null).daten;
  const basis = `/backoffice/${orgId}`;

  return (
    <Zustand laedt={laedt && !daten} fehler={fehler === "nicht-gefunden" ? null : fehler} leer={fehler === "nicht-gefunden"} leerText={t("fehler.nicht-gefunden")}>
      {daten && (
        <>
          <Seitenkopf
            augenbraue={t("bo.augenbraue")}
            titel={daten.organisation.name}
            rechts={
              <div className="flex flex-wrap items-center gap-3">
                {admin && alle && alle.length > 1 && (
                  <Auswahl aria-label={t("bo.organisation")} value={orgId} onChange={(e) => navigate(`/backoffice/${e.target.value}`)} className="w-auto">
                    {alle.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Auswahl>
                )}
                {daten.organisation.oeffentlich && (
                  <Link to={`/organisationen/${daten.organisation.slug}`} className={knopfKlassen("rand")}>
                    {t("bo.oeffentlich")}
                  </Link>
                )}
              </div>
            }
          />
          {/* Der aktive Reiter traegt die Hauptfarbe der Organisation (bei zu heller Farbe den Standard). */}
          <nav
            aria-label={t("bo.augenbraue")}
            className="flex gap-1 overflow-x-auto border-b border-linie"
            style={{ "--reiter": lesbareFarbe(daten.organisation.farbe) ?? "var(--color-primaer)" } as CSSProperties}
          >
            {UNTERREITER.map((r) => (
              <NavLink
                key={r.pfad}
                to={`${basis}${r.pfad}`}
                end
                className={({ isActive }) =>
                  cn(
                    "flex h-11 shrink-0 items-center px-4 text-sm",
                    isActive ? "font-semibold text-text shadow-[inset_0_-3px_0_var(--reiter)]" : "font-medium text-text-hinweis hover:text-text",
                  )
                }
              >
                {t(r.text)}
              </NavLink>
            ))}
          </nav>
          <Outlet context={{ orgId: Number(orgId), daten }} />
        </>
      )}
    </Zustand>
  );
}
