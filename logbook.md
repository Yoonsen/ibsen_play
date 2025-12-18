# Ibsen Networks – LOGBOOK

## 2025-12-01

- Opprettet nytt repo/katalog `ibsen_networks` for frontend + data.
- Lagt inn:
  - `ibsen_networks.json` i `public/` (samlet nettverks- og scene-data for Ibsens skuespill).
  - Vite + React-konfig (`vite.config.js`, `src/App.jsx`, `src/main.jsx`).
- Fikk Vite-devserveren til å kjøre (`npm run dev`), og ser nå:
  - liste over alle skuespill,
  - valg av enkeltstykke med visning av `mean_drama`, `mean_cast`, `max_cast`, `n_scenes` der de finnes.
- Definert begrepet **dramafaktor**:
  - actual_pairs / possible_pairs per scene,
  - aggregert til mean_drama per stykke.
- Identifisert “L-formen” i rommet:
  - få karakterer → høy tetthet (kammerdrama),
  - mange karakterer → lav tetthet (episk/ensemble),
  - nesten ingen stykker med få + lav tetthet eller mange + høy tetthet.
- Opprettet:
  - `manifest.md` – formål og scope for appen.
  - `architecture.md` – kort beskrivelse av stack, layout og dataflyt.
  - `todo.md` – liste over videre arbeid (scatterplot, nettverk, PWA).
  - `logbook.md` – denne loggen.

## 2025-12-10

- UI-utvidelser: global stat-chips, søkbar combobox for stykker, par-intensitet (topp 10) med sortering, dialog-modal med filter/sortering/badges.
- Taler-/ordtabell basert på faktiske `word_counts` (ikke overgangsestimat); heatmap per akt/karakter.
- Bechdel-dialogliste med filter (ingen mannlige pron), sortering (lengde/ord/pron), og per-par intensitet også inne i dialog-modal.
- Skjuler verk uten orddata (0-ord).
- Dokumentasjon/vedlikehold: data-README m/ID-normalisering (URN/dhlabid), manifest/architecture oppdatert tidligere; datastruktur-dokument flyttet til `legacy/`.
- Scenenettverk fra dialoger (akt/scene-velger + stepper), gjenbruker globalt layout for stabilitet.
- Plan: se på `parsed.json` og eventuelt koble inn fulltekst for utdrag og navigasjon.

## 2025-12-16

- Lade inn TEI-XML i `data/raw/plays/` og kjørte ny parser (`data/scripts/parse_tei.py`) som bygger `ibsen_parsed.json` og `ibsen_networks.json`; kopiert til `public/ibsen_networks.json`.
- Oppdatert datascripts-README og parser til å bruke acts/scenes/speeches direkte fra TEI; kjører eksporten via `ibsen_networks_acts.py`.
- Frontend: chips-toggle for tale- vs scenenettverk, scenestripe for ordfordeling per karakter og veksling (replikk-segmenter) med utvidet fargepalett per taler.
- La inn `data/gendered_ibsen.json` som grunnfil for kjønning; `ibsen_networks_acts.py` bruker nå kun base-FEMALE_CHARACTERS + denne filen (ingen heuristikker). Regenerert nettverkene.

## 2025-12-18

- Strippet frontend til ren animasjonsvisning av skuespill (PWA / Pages). Kontroller i topprad, graf som fyller panelet, auto-pause per akt, seekbar, speed-justering.
- Force-light oppdatert: noder og kanter fader på inaktivitet (min 20 %), tykkelse kumulativ, anchor-drag for stabilitet, drag-and-drop m/ pointer events (touch).
- UI: inline SVG-ikoner (play/pause/stop/prev/next/fast) for konsistent visning på Android/Chromebook; liten burgunder tittel; build-tag i header.
- Grafen måler egen container for størrelse (ingen overflow). Kant-opasitet reflekterer nylig aktivitet; tykkelse viser historisk styrke.
- Bygg/push til `docs/` (GitHub Pages), base `/ibsen_play/`; service worker registrering fortsatt deaktivert under utvikling for å unngå cache-stale.
