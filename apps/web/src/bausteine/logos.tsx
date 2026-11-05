import { Link } from "react-router";
import axon from "../assets/axon-logo.svg";
import { useT } from "../i18n/sprache.tsx";
import { cn } from "./basis.tsx";

/** Breite je Stelle, die Hoehe ergibt sich aus dem Seitenverhaeltnis. */
const MASSE = {
  kopf: "w-[72px]",
  anmeldung: "w-[84px]",
} as const;

export function AxonLogo({ art, className }: { art: keyof typeof MASSE; className?: string }) {
  return <img src={axon} alt="Neoception AXON" className={cn("block h-auto", MASSE[art], className)} />;
}

/** AXON-Logo, Trennstrich, App-Name gruen und gesperrt, wie in der HMI-App. */
export function Marke({ art, ziel }: { art: keyof typeof MASSE; ziel?: string }) {
  const { t } = useT();
  const logo = <AxonLogo art={art} />;
  return (
    <span className="flex min-w-0 items-center gap-3 sm:gap-4">
      {ziel !== undefined ? (
        <Link to={ziel} aria-label="Axon Data Portal" className="flex shrink-0">
          {logo}
        </Link>
      ) : (
        logo
      )}
      <span aria-hidden="true" className="h-7 w-px shrink-0 bg-linie" />
      <span className="min-w-0 truncate text-xs font-semibold tracking-[0.14em] text-primaer-dunkel uppercase">{t("app.name")}</span>
    </span>
  );
}
