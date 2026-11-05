/**
 * Kopfzeile und Inhaltsspalte nach dem Rahmen der HMI-App (messeapp/client/src/layout/Rahmen.tsx).
 * Ab `lg` eine Reiterzeile, darunter dieselben Eintraege im Menue hinter drei Strichen.
 * Besucherbereich und Backoffice teilen den Rahmen, nur die Reiter und die rechte Seite
 * unterscheiden sich.
 */

import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { cn, knopfKlassen } from "./bausteine/basis.tsx";
import { Marke } from "./bausteine/logos.tsx";
import type { Schluessel } from "./i18n/de.ts";
import { useT, type Sprache } from "./i18n/sprache.tsx";
import { useKonto } from "./konto.tsx";
import { useStrom } from "./strom.tsx";

export type Reiter = { pfad: string; text: Schluessel; genau?: boolean };

function istAktiv(pathname: string, r: Reiter): boolean {
  return r.genau === true ? pathname === r.pfad : pathname === r.pfad || pathname.startsWith(`${r.pfad}/`);
}

export function Sprachwahl() {
  const { sprache, setzeSprache, t } = useT();
  return (
    <div role="radiogroup" aria-label={t("sprache.wahl")} className="flex shrink-0 rounded-full border border-linie-feld p-0.5">
      {(["de", "en"] as Sprache[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={sprache === s}
          lang={s}
          onClick={() => setzeSprache(s)}
          className={cn(
            "h-7 rounded-full px-2.5 text-xs font-bold tracking-wide uppercase",
            sprache === s ? "bg-text text-white" : "text-text-hinweis hover:text-text",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

/** Kleiner Punkt: gruen, solange der Live-Strom verbunden ist. */
export function Liveanzeige() {
  const { verbunden } = useStrom();
  const { t } = useT();
  return (
    <span className="hidden items-center gap-1.5 text-xs font-semibold text-text-hinweis md:flex" title={verbunden ? t("allg.live") : t("allg.getrennt")}>
      <span className={cn("size-2 rounded-full", verbunden ? "bg-primaer" : "bg-linie-feld")} aria-hidden="true" />
      {verbunden ? t("allg.live") : t("allg.getrennt")}
    </span>
  );
}

export function Rahmen({
  reiter,
  markenziel,
  rechts,
  menueExtras,
  band,
}: {
  reiter: Reiter[];
  markenziel: string;
  rechts: ReactNode;
  menueExtras: { text: string; aktion: () => void }[];
  /** Zeile ueber dem Kopf, die sagt, in welchem Bereich man ist (Backoffice). */
  band?: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="min-h-[100dvh] bg-grund text-text">
      {band}
      <header className="bg-flaeche">
        <div className="flex min-h-14 items-center gap-3 border-b border-linie px-4 sm:gap-4 sm:px-6">
          <Marke art="kopf" ziel={markenziel} />
          <span className="ml-auto hidden min-w-0 items-center gap-3 sm:flex">{rechts}</span>
          <span className="ml-auto flex items-center gap-2 sm:ml-0 lg:hidden">
            <span className="sm:hidden">
              <Sprachwahl />
            </span>
            <Hauptmenue reiter={reiter} extras={menueExtras} />
          </span>
        </div>
        <nav aria-label={t("nav.haupt")} className="hidden border-b border-linie lg:block">
          <div className="mx-auto flex max-w-[1200px] gap-1 px-4">
            {reiter.map((r) => (
              <NavLink
                key={r.pfad}
                to={r.pfad}
                end={r.genau === true}
                className={({ isActive }) =>
                  cn(
                    "flex h-[46px] shrink-0 items-center px-4 text-sm",
                    isActive ? "font-semibold text-text shadow-[inset_0_-2px_0_var(--color-primaer)]" : "font-medium text-text-hinweis hover:text-text",
                  )
                }
              >
                {t(r.text)}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-16 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}

function Hauptmenue({ reiter, extras }: { reiter: Reiter[]; extras: { text: string; aktion: () => void }[] }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useT();
  const eintrag = "flex h-11 cursor-pointer items-center px-4 text-sm outline-none select-none data-[highlighted]:bg-grund";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={t("allg.menue")} className="flex size-10 items-center justify-center border border-linie text-text">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 flex w-[min(16rem,calc(100vw-2rem))] flex-col bg-flaeche py-1 shadow-[0_18px_48px_rgba(27,29,38,0.22)]">
          {reiter.map((r) => (
            <DropdownMenu.Item
              key={r.pfad}
              onSelect={() => navigate(r.pfad)}
              className={cn(
                eintrag,
                istAktiv(pathname, r) ? "font-semibold text-text shadow-[inset_3px_0_0_var(--color-primaer)]" : "font-medium text-text-hinweis",
              )}
            >
              {t(r.text)}
            </DropdownMenu.Item>
          ))}
          {extras.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-linie" />}
          {extras.map((x) => (
            <DropdownMenu.Item key={x.text} onSelect={x.aktion} className={cn(eintrag, "font-medium text-text")}>
              {x.text}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const BESUCHER: Reiter[] = [
  { pfad: "/", text: "nav.uebersicht", genau: true },
  { pfad: "/organisationen", text: "nav.organisationen" },
];

/** Der offene Bereich. Rechts: Sprache, und je nach Sitzung "Anmelden" oder "Backoffice". */
export function BesucherRahmen() {
  const { t } = useT();
  const { nutzer, organisation, abmelden } = useKonto();
  const { auffrischen } = useStrom();
  const navigate = useNavigate();
  const ziel = nutzer?.rolle === "admin" ? "/verwaltung/organisationen" : organisation ? `/backoffice/${organisation.id}` : "/anmelden";
  const text = nutzer ? t("nav.backoffice") : t("nav.anmelden");

  /** Auf der Seite bleiben und sie ohne Anmeldung neu laden (private Inhalte verschwinden dann). */
  async function ausloggen() {
    await abmelden();
    auffrischen();
  }

  return (
    <Rahmen
      reiter={BESUCHER}
      markenziel="/"
      rechts={
        <>
          <Liveanzeige />
          <Sprachwahl />
          <Link to={ziel} className={knopfKlassen(nutzer ? "primaer" : "rand", "h-[34px] px-3.5 text-[13px]")}>
            {text}
            {nutzer && <span aria-hidden="true">→</span>}
          </Link>
          {nutzer && (
            <button type="button" onClick={() => void ausloggen()} className={knopfKlassen("rand", "h-[34px] px-3.5 text-[13px]")}>
              {t("nav.abmelden")}
            </button>
          )}
        </>
      }
      menueExtras={[{ text, aktion: () => navigate(ziel) }, ...(nutzer ? [{ text: t("nav.abmelden"), aktion: () => void ausloggen() }] : [])]}
    />
  );
}
