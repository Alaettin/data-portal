/**
 * Fachliche Bausteine: Markierungen je Ereignisart, Produktbild, Organisationsmarke,
 * Vorher/Nachher. Alle in den Design-Werten der HMI-App.
 */

import type { Aenderung } from "@datenportal/core";
import { Link } from "react-router";
import { bildUrl, orgLogoUrl, type Art, type AssetKurz } from "../api.ts";
import type { Schluessel } from "../i18n/de.ts";
import { useT } from "../i18n/sprache.tsx";
import { cn, Markierung } from "./basis.tsx";

export const ART_FARBE: Record<Art | "abkuendigung", string> = {
  registriert: "var(--color-art-registriert)",
  "submodel-neu": "var(--color-art-aktualisiert)",
  "submodel-geaendert": "var(--color-art-aktualisiert)",
  pcn: "var(--color-art-pcn)",
  abkuendigung: "var(--color-art-abkuendigung)",
  unbekannt: "var(--color-text-hinweis)",
};

/** Markierung fuer ein Ereignis; eine PCN mit Abkuendigung bekommt Rot. */
export function ArtMarkierung({ art, abkuendigung = false }: { art: Art; abkuendigung?: boolean }) {
  const { t } = useT();
  const schluessel = abkuendigung ? "abkuendigung" : art;
  return <Markierung text={t(`art.${schluessel}` as Schluessel)} farbe={ART_FARBE[schluessel]} />;
}

/** Status eines Assets in Listen: das Wichtigste zuerst, hoechstens zwei Markierungen. */
export function AssetStatus({ a }: { a: AssetKurz }) {
  const { t } = useT();
  const teile = [];
  if (a.abgekuendigt) teile.push(<Markierung key="ab" text={t("art.abkuendigung")} farbe={ART_FARBE.abkuendigung} />);
  else if (a.anzahlPcns > 0) teile.push(<Markierung key="pcn" text={t("art.pcn")} farbe={ART_FARBE.pcn} />);
  if (a.anzahlUpdates > 0) {
    const text = a.anzahlUpdates === 1 ? t("art.update1") : t("art.updates", { n: a.anzahlUpdates });
    teile.push(<Markierung key="up" text={text} farbe={ART_FARBE["submodel-geaendert"]} />);
  }
  if (teile.length === 0 && a.registriert) teile.push(<Markierung key="reg" text={t("art.registriert")} farbe={ART_FARBE.registriert} />);
  return <span className="flex flex-wrap gap-1.5 max-sm:justify-end">{teile}</span>;
}

/**
 * Produktbild oder ein ruhiger Platzhalter mit Symbol, quadratisch. Weisser Grund und
 * `mix-blend-multiply`: Produktfotos haben meist einen weissen oder fast weissen Rand, der
 * sonst als hellgrauer Kasten im Rahmen stand. Der Innenabstand waechst mit der Groesse.
 */
export function Produktbild({ a, groesse = 48, className }: { a: AssetKurz; groesse?: number; className?: string }) {
  const { t } = useT();
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-linie bg-white", className)}
      style={{ width: groesse, height: groesse, padding: Math.round(groesse * 0.07) }}
    >
      {a.hatBild ? (
        <img src={bildUrl(a)} alt="" className="size-full object-contain mix-blend-multiply" loading="lazy" />
      ) : (
        <svg
          width={groesse * 0.45}
          height={groesse * 0.45}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-linie-feld"
          role="img"
          aria-label={t("detail.keinBild")}
        >
          <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
          <path d="m3 8 9 5 9-5" />
          <path d="M12 13v8" />
        </svg>
      )}
    </span>
  );
}

/**
 * Die Organisationsfarbe als Akzent fuer Text und Linien auf weissem Grund, oder null, wenn
 * sie dafuer zu hell ist (Kontrast unter 3:1, WCAG fuer grossen und fetten Text). Dann bleibt
 * der Standardakzent. Flaechen und Baender nehmen die Farbe immer.
 */
export function lesbareFarbe(farbe: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(farbe.trim());
  if (!m) return null;
  const kanal = (i: number) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const helligkeit = 0.2126 * kanal(0) + 0.7152 * kanal(2) + 0.0722 * kanal(4);
  return 1.05 / (helligkeit + 0.05) >= 3 ? `#${m[1]}` : null;
}

/** Logo der Organisation oder ihr Anfangsbuchstabe in ihrer Farbe. */
export function OrgMarke({ id, name, farbe, hatLogo, groesse = 40 }: { id: number; name: string; farbe: string; hatLogo: boolean; groesse?: number }) {
  if (hatLogo) {
    return (
      <span className="flex shrink-0 items-center justify-center border border-linie bg-flaeche" style={{ width: groesse, height: groesse }}>
        <img src={orgLogoUrl(id)} alt="" className="size-full object-contain p-1" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center font-bold text-white"
      style={{ width: groesse, height: groesse, background: farbe, fontSize: groesse * 0.42 }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Organisationsname als Link mit Farbpunkt. */
export function OrgLink({ slug, name, farbe }: { slug: string; name: string; farbe: string }) {
  return (
    <Link to={`/organisationen/${slug}`} className="inline-flex items-center gap-2 font-medium hover:underline">
      <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: farbe }} />
      {name}
    </Link>
  );
}

/** Vorher/Nachher: alter Wert durchgestrichen, neuer kraeftig in Blau. */
export function Aenderungen({ liste, max = 6 }: { liste: Aenderung[]; max?: number }) {
  const { t } = useT();
  if (liste.length === 0) return <p className="text-sm text-text-hinweis">{t("aenderung.keine")}</p>;
  const leer = t("allg.leerWert");
  return (
    <ul className="flex flex-col gap-1.5">
      {liste.slice(0, max).map((a) => (
        <li key={a.pfad} className="border-l-2 border-art-aktualisiert bg-grund px-3 py-2">
          <div className="truncate font-mono text-[11px] text-text-hinweis">{a.pfad}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[15px]">
            {a.vorher !== null && <span className="text-text-hinweis line-through">{a.vorher || leer}</span>}
            {a.nachher !== null ? (
              <span className="font-semibold text-art-aktualisiert">{a.nachher || leer}</span>
            ) : (
              <span className="text-sm text-text-hinweis">{t("aenderung.entfernt")}</span>
            )}
          </div>
        </li>
      ))}
      {liste.length > max && <li className="px-1 text-sm text-text-hinweis">{t("aenderung.weitere", { n: liste.length - max })}</li>}
    </ul>
  );
}
