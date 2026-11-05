import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ApiFehler } from "../api.ts";
import { Feld, Fehlerhinweis, Knopf, knopfKlassen } from "../bausteine/basis.tsx";
import { AxonLogo } from "../bausteine/logos.tsx";
import keyvisual from "../assets/keyvisual.webp";
import { useT } from "../i18n/sprache.tsx";
import { startziel, useKonto } from "../konto.tsx";
import { Sprachwahl } from "../rahmen.tsx";

/** Anmeldekarte ueber dem Keyvisual, wie in der HMI-App (messeapp/client/src/pages/Login.tsx). */
export function Anmelden() {
  const { t } = useT();
  const konto = useKonto();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  if (konto.geprueft && konto.nutzer) return <Navigate to={startziel(konto)} replace />;

  async function absenden(e: FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);
    try {
      const s = await konto.anmelden(email, passwort);
      navigate(startziel(s), { replace: true });
    } catch (f) {
      const code = f instanceof ApiFehler ? f.code : "verbindung";
      setFehler(code === "anmeldung-falsch" ? t("anm.falsch") : code === "zu-viele" ? t("anm.zuViele") : t("anm.verbindung"));
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-grund px-4 py-12">
      <img src={keyvisual} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full object-cover" />
      <main className="relative flex w-full max-w-[420px] flex-col gap-7 bg-flaeche p-6 shadow-[0_18px_48px_rgba(27,29,38,0.13)] sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <AxonLogo art="anmeldung" />
          <Sprachwahl />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-[0.14em] text-primaer-dunkel uppercase">{t("app.name")}</span>
          <h1 className="text-[32px] leading-tight font-bold tracking-[-0.02em]">{t("anm.titel")}</h1>
        </div>

        {fehler && <Fehlerhinweis>{fehler}</Fehlerhinweis>}

        <form className="flex flex-col gap-4.5" onSubmit={(e) => void absenden(e)}>
          <label className="flex flex-col gap-2 text-[13px] font-semibold">
            {t("anm.email")}
            <Feld type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
          </label>
          <label className="flex flex-col gap-2 text-[13px] font-semibold">
            {t("anm.passwort")}
            <Feld type="password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoComplete="current-password" />
          </label>
          <Knopf type="submit" className="mt-1.5 h-12 text-base" laedt={laedt} disabled={!email || !passwort}>
            {laedt ? t("anm.pruefen") : t("anm.titel")}
          </Knopf>
        </form>
        {/* Als eigener Knopf statt kleinem Textlink (Nutzervorgabe 05.11.2026). */}
        <div className="flex flex-col gap-4 border-t border-linie pt-6">
          <Link to="/" className={knopfKlassen("rand", "h-12 w-full text-base")}>
            <span aria-hidden="true">←</span>
            {t("anm.zurueck")}
          </Link>
        </div>
      </main>
    </div>
  );
}
