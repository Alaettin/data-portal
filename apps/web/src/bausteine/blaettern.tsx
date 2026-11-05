import { useT } from "../i18n/sprache.tsx";
import { Knopf, cn } from "./basis.tsx";

/**
 * Die Seitenumschaltung aus der HMI-App (messeapp/client/src/bausteine/blaettern.tsx).
 * Geblaettert wird auf dem Server; die Seite steht in der Adresse (siehe `useListenzustand`).
 *
 * Erscheint nur, wenn es mehr als eine Seite gibt. Ein Fenster von hoechstens fuenf Seiten
 * um die aktuelle, damit die Leiste bei 390 px nicht ueber den Rand laeuft.
 */
export function Blaetterleiste({
  seite,
  gesamt,
  jeSeite,
  aufSeite,
}: {
  seite: number;
  gesamt: number;
  jeSeite: number;
  aufSeite: (nummer: number) => void;
}) {
  const { t, zahl } = useT();
  const seiten = Math.max(1, Math.ceil(gesamt / jeSeite));
  if (seiten <= 1) return null;

  const von = gesamt === 0 ? 0 : (seite - 1) * jeSeite + 1;
  const bis = Math.min(seite * jeSeite, gesamt);
  const fenster = 5;
  const sichtbar =
    seiten <= fenster
      ? Array.from({ length: seiten }, (_, i) => i + 1)
      : Array.from({ length: fenster }, (_, i) => Math.min(Math.max(1, seite - Math.floor(fenster / 2)), seiten - fenster + 1) + i);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[13px] text-text-hinweis">{t("blaettern.zeige", { von: zahl(von), bis: zahl(bis), gesamt: zahl(gesamt) })}</span>
      <nav aria-label={t("blaettern.seiten")} className="flex flex-wrap gap-2">
        <Knopf art="rand" className="h-9 w-11 px-0" aria-label={t("blaettern.vorige")} disabled={seite <= 1} onClick={() => aufSeite(seite - 1)}>
          ←
        </Knopf>
        {sichtbar.map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === seite ? "page" : undefined}
            onClick={() => aufSeite(n)}
            className={cn("size-9 rounded-full text-[13px] font-bold", n === seite ? "bg-text text-white" : "text-text-hinweis hover:bg-black/5")}
          >
            {n}
          </button>
        ))}
        <Knopf art="rand" className="h-9 w-11 px-0" aria-label={t("blaettern.naechste")} disabled={seite >= seiten} onClick={() => aufSeite(seite + 1)}>
          →
        </Knopf>
      </nav>
    </div>
  );
}
