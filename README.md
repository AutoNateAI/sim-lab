# Simulations

An open, executable library for learning how real-world systems behave. Every simulation is organized by industry and includes:

- an interactive browser model;
- an ODD (Overview, Design concepts, Details) protocol;
- readable source-code notes;
- a screenshot-supported tutorial;
- a reproducible PDF export path.

The first model is the [City Opportunity Simulator](simulations/workforce-development/city-opportunity-simulator/index.mdx), a seeded workforce-development model of the path from public budget to resident awareness, training, and employment.

## Local development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install --cache .npm-cache
npm run mesa:generate
npm start
```

Open `http://localhost:3000/`.

## Quality checks

```bash
npm run check
npm run capture:first
```

`npm run capture:first` launches headed Chrome by default and walks every tutorial scenario. Use `HEADLESS=true npm run capture:first` only for unattended capture.

## Publishing

Every push to `main` runs `.github/workflows/deploy.yml`. The workflow validates and builds the Docusaurus site, then publishes the static build to the `gh-pages` branch.

## Discoverability contract

Every simulation must include `manifest.yaml`. Run `npm run registry:build` after adding or changing one. CI rejects stale registry data, broken tutorial images, invalid manifests, type errors, and failed site builds.

Live site: <https://sims.autonateai.com/>
