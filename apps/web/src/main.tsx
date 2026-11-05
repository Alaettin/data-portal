import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Anmelden } from "./bereiche/anmelden.tsx";
import { BackofficeRahmen, BackofficeStart, OrgBereich } from "./bereiche/backoffice/rahmen.tsx";
import { BoEreignisse } from "./bereiche/backoffice/ereignisse.tsx";
import { BoAssetDetail, BoEndpunkte, BoOrgSeite, BoProfil, Konto } from "./bereiche/backoffice/seiten.tsx";
import { AssetDetail } from "./bereiche/besucher/asset-detail.tsx";
import { Organisationen, Organisationsseite } from "./bereiche/besucher/organisationen.tsx";
import { Uebersicht } from "./bereiche/besucher/uebersicht.tsx";
import { VerwNutzer, VerwOrganisationen } from "./bereiche/verwaltung/verwaltung.tsx";
import { SprachAnbieter } from "./i18n/sprache.tsx";
import { KontoAnbieter } from "./konto.tsx";
import { BesucherRahmen } from "./rahmen.tsx";
import { StromAnbieter } from "./strom.tsx";
import "./styles.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <SprachAnbieter>
      <KontoAnbieter>
        <StromAnbieter>
          <BrowserRouter>
            <Routes>
              <Route element={<BesucherRahmen />}>
                <Route index element={<Uebersicht />} />
                <Route path="organisationen" element={<Organisationen />} />
                <Route path="organisationen/:slug" element={<Organisationsseite />} />
                <Route path="assets/:eid/:item" element={<AssetDetail />} />
              </Route>
              <Route path="anmelden" element={<Anmelden />} />
              <Route element={<BackofficeRahmen />}>
                <Route path="backoffice" element={<BackofficeStart />} />
                <Route path="backoffice/:orgId" element={<OrgBereich />}>
                  <Route index element={<BoOrgSeite />} />
                  <Route path="endpunkte" element={<BoEndpunkte />} />
                  <Route path="ereignisse" element={<BoEreignisse />} />
                  <Route path="profil" element={<BoProfil />} />
                  <Route path="assets/:eid/:item" element={<BoAssetDetail />} />
                </Route>
                <Route path="konto" element={<Konto />} />
              </Route>
              <Route element={<BackofficeRahmen nurAdmin />}>
                <Route path="verwaltung" element={<Navigate to="/verwaltung/organisationen" replace />} />
                <Route path="verwaltung/organisationen" element={<VerwOrganisationen />} />
                <Route path="verwaltung/nutzer" element={<VerwNutzer />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </StromAnbieter>
      </KontoAnbieter>
    </SprachAnbieter>
  </StrictMode>,
);
