# Ibsen Networks – ARCHITECTURE

## Teknisk stack

- Frontend: React + Vite (ESM, `type: "module"`).
- Bygg: `npm run build` → output til `docs/` (for GitHub Pages).
- Data: statisk JSON-fil `public/ibsen_networks.json` (kopieres til `docs/` ved build).
- Hosting: GitHub Pages med `base: '/ibsen_play/'` i `vite.config.js`.

## Filstruktur (frontend)

- `index.html` – rot for Vite/React.
- `src/main.jsx` – entrypoint, monterer `<App />`.
- `src/App.jsx` – hovedkomponent:
  - laster `./ibsen_networks.json`,
  - dropdown for stykker (titler uten underscores),
  - globalt talenettverk + scrollbart panel med ett nettverk per akt,
  - statistikkpanel (Bechdel, dialoger, ordtall),
  - info-modal.
- `public/ibsen_networks.json` – alle nettverksdata.
- `docs/` – bygget PWA for GitHub Pages.
- `legacy/DATASTRUCTURE_UPDATE.md` – kontrakt for datastruktur (top-level FEMALE_CHARACTERS, plays med speech/co-nettverk, acts, dialogs, bechdel).
- `data/` – plass for Python-skript som genererer `ibsen_networks.json` fra TEI.

## UI-arkitektur (nåværende)

- Header med tittel, lastet-antall og Info-knapp (modal).
- Selektor for stykker.
- Innhold:
  - Venstre (grid-col 2fr): globalt talenettverk (fargede noder etter kjønn).
  - Høyre (grid-col 1fr): scrollbart aktpanel med alle akter.
- Under: statistikk-kort (Bechdel, dialogtall, ordtall stykke/akt).
- Responsiv: grid → stacked på smale skjermer.

## Dataflyt (kort)

1. `App` laster `ibsen_networks.json` én gang på mount.
2. `FEMALE_CHARACTERS` brukes til å sette node-kjønn (F/M/?).
3. Globalt nettverk: `play.speech_network`.
4. Aktpanel: `play.acts[*].speech_network`.
5. Statistikk: `play.bechdel`, `play.dialogs`, `play.word_counts`, `play.act_word_counts`.

## Vedlikehold / for LLM

- Data-generering: bruk Python-skriptet i `data/` (når lagt inn) for å regenerere `public/ibsen_networks.json` fra TEI-XML. Output må matche kontrakten i `legacy/DATASTRUCTURE_UPDATE.md`.
- Build/deploy: `npm run build` (output i `docs/`), så push til GitHub Pages.
- Caching: `sw.js` er minimal (ingen cache); hard refresh etter deploy.
- Styling/layout: se `src/App.jsx` for grid/scroll-arkitektur og kjønnsfarger. Responsivt fallback til stacked.

## 2025-12-18 – Animert player (frontend refaktor)

- Fokus: kun animasjon av replikk-nettverk som PWA på Pages.
- Layout: topprad med kontroll-kluster (prev/play/pause/stop/next) og stykkevelger; hastighet og status/seeker under; graf fyller panelet.
- Ikoner: inline SVG for spillkontroller (robust på Android/Chromebook), ingen emoji/Unicode-avhengighet.
- Animasjon: “force-light” der noder har ankre, får gjensidig drag per aktiv replikk, svakt anchor-drag, clamping til viewport, drag-and-drop via pointer events (touch + mus).
- Noder: starter lik størrelse, vokser kumulativt med ord; opasitet fader til 20 % når inaktiv, full opasitet ved aktivitet.
- Kanter: tykkelse = historisk vekt; opasitet fader separat (viser siste aktivitet som tydeligere spor av allianser).
- Størrelse: SVG måler wrapper-diven (ikke vindu) for å holde seg innenfor tildelt panel.
- Deploy: `npm run build` → `docs/` (Pages), base `/ibsen_play/`; service worker-registrering midlertidig deaktivert i `src/main.jsx` for å unngå cache-stale under utvikling.

## Dataflyt

1. `App` laster `ibsen_networks.json` én gang på mount.
2. JSON forventes å ha formen:

   ```json
   {
     "plays": [
       {
         "id": "...",
         "title": "Rosmersholm_1886",
         "mean_drama": ...,
         "mean_cast": ...,
         "max_cast": ...,
         "n_scenes": ...,
         "acts": [...],
         "networks": {
           "speech": {...},
           "cooccurrence": {...}
         }
       }
     ]
   }
