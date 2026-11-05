import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { useT } from "../i18n/sprache.tsx";
import { Fehlerhinweis, Knopf } from "./basis.tsx";

/**
 * Dialoge aus der HMI-App (messeapp/client/src/bausteine/dialog.tsx). Radix bringt
 * Fokusfalle, Escape, Scroll-Sperre und die ARIA-Verdrahtung mit.
 *
 * Ab `sm` mittig, darunter ein Blatt am unteren Rand (Daumenzone). `dvh` statt `vh`,
 * weil die Adressleiste mobiler Browser ein- und ausfaehrt.
 */
const LAGE = [
  "fixed z-50 flex flex-col bg-flaeche",
  "max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[85dvh] max-sm:rounded-t-xl",
  "sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
  "shadow-[0_18px_48px_rgba(27,29,38,0.22)]",
].join(" ");

const KNOPFLEISTE =
  "flex flex-wrap justify-end gap-3 max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:justify-stretch max-sm:border-t max-sm:border-linie max-sm:bg-flaeche max-sm:p-4 max-sm:[&>*]:flex-1";

/** Rueckfrage vor einer Handlung, die sich nicht zurueckholen laesst. */
export function Rueckfrage({
  offen,
  aufOffen,
  titel,
  children,
  bestaetigenText,
  art = "primaer",
  laeuft = false,
  fehler = null,
  aufBestaetigen,
}: {
  offen: boolean;
  aufOffen: (offen: boolean) => void;
  titel: string;
  children: ReactNode;
  bestaetigenText: string;
  art?: "primaer" | "gefahr";
  laeuft?: boolean;
  fehler?: string | null;
  aufBestaetigen: () => void;
}) {
  const { t } = useT();
  return (
    <RadixDialog.Root open={offen} onOpenChange={aufOffen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content className={`${LAGE} gap-5 overflow-y-auto p-6 sm:w-[min(32rem,calc(100vw-2rem))] sm:p-7`} aria-describedby={undefined}>
          <RadixDialog.Title className="text-2xl font-bold tracking-[-0.01em]">{titel}</RadixDialog.Title>
          <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-text-zweit">{children}</div>
          {fehler !== null && <Fehlerhinweis>{fehler}</Fehlerhinweis>}
          <div className={KNOPFLEISTE}>
            <RadixDialog.Close asChild>
              <Knopf art="rand" disabled={laeuft}>
                {t("allg.abbrechen")}
              </Knopf>
            </RadixDialog.Close>
            <Knopf art={art} disabled={laeuft} onClick={aufBestaetigen}>
              {laeuft ? t("allg.laeuft") : bestaetigenText}
            </Knopf>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Ein Fenster mit Formular: Felder, Fehler, Abbrechen und Absenden. */
export function Formularfenster({
  offen,
  aufOffen,
  titel,
  absendenText,
  laeuft = false,
  fehler = null,
  aufAbsenden,
  children,
}: {
  offen: boolean;
  aufOffen: (offen: boolean) => void;
  titel: string;
  absendenText: string;
  laeuft?: boolean;
  fehler?: string | null;
  aufAbsenden: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <RadixDialog.Root open={offen} onOpenChange={aufOffen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content className={`${LAGE} overflow-y-auto p-6 sm:w-[min(36rem,calc(100vw-2rem))] sm:p-7`} aria-describedby={undefined}>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              aufAbsenden();
            }}
          >
            <RadixDialog.Title className="text-2xl font-bold tracking-[-0.01em]">{titel}</RadixDialog.Title>
            <div className="flex flex-col gap-4">{children}</div>
            {fehler !== null && <Fehlerhinweis>{fehler}</Fehlerhinweis>}
            <div className={KNOPFLEISTE}>
              <RadixDialog.Close asChild>
                <Knopf art="rand" disabled={laeuft}>
                  {t("allg.abbrechen")}
                </Knopf>
              </RadixDialog.Close>
              <Knopf type="submit" laedt={laeuft}>
                {absendenText}
              </Knopf>
            </div>
          </form>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Ein Fenster, das nur etwas zeigt; nichts zu entscheiden, nur zu schliessen. */
export function Schaufenster({
  offen,
  aufOffen,
  titel,
  breit = false,
  children,
}: {
  offen: boolean;
  aufOffen: (offen: boolean) => void;
  titel: string;
  breit?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <RadixDialog.Root open={offen} onOpenChange={aufOffen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <RadixDialog.Content
          className={`${LAGE} gap-4 overflow-y-auto p-6 sm:max-h-[90dvh] ${breit ? "sm:w-[min(60rem,calc(100vw-2rem))]" : "sm:w-[min(34rem,calc(100vw-2rem))]"}`}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-xl font-bold tracking-[-0.01em]">{titel}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button type="button" aria-label={t("allg.schliessen")} className="flex size-9 shrink-0 items-center justify-center text-text-hinweis hover:text-text">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
