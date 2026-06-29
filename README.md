# Simulations

An open, executable library for learning how real-world systems behave. Every simulation is organized by industry and includes:

- an interactive browser model;
- an ODD (Overview, Design concepts, Details) protocol;
- readable source-code notes;
- a screenshot-supported tutorial;
- a reproducible PDF export path.

The first model is the [City Opportunity Simulator](simulations/workforce-development/city-opportunity-simulator/index.mdx), a seeded workforce-development model of the path from public budget to resident awareness, training, and employment.

Sim Lab is growing into a simulation research system: Codex helps define the ODD, implement the Mesa model, construct the replay world, run controlled experiments, and turn observations into public Docusaurus articles and PDFs. Read the [research cockpit and world roadmap](simulations/vision.md).

## Local development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install --cache .npm-cache
npm run mesa:generate
npm start
```

Open `http://localhost:3000/`.

To start the standalone dashboard app in a second terminal:

```bash
npm run dashboard:dev
```

Open `http://127.0.0.1:5174/`. Dark mode is the default dashboard theme.

To start the **WoC Simulation Studio** (3D immersive view):

```bash
npm run woc-sim:dev
```

Open `http://127.0.0.1:5175/`. Requires the sibling repo `world-of-claudecraft` checked out at `../world-of-claudecraft` — WoC's Three.js and character GLBs are resolved from there at dev time.

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

## Simulation Studio (`apps/woc-sim`)

A standalone Three.js + React app that runs the workforce simulation inside the World of ClaudeCraft fantasy world. Agents are rendered as rigged KayKit character models (knight, mage, druid, ranger, barbarian, paladin, rogue) walking the procedurally generated Eastbrook Vale terrain.

### Architecture

```
apps/woc-sim/
  src/scene.ts      — WocScene class: terrain, buildings, trees, character GLBs,
                      per-agent AnimationMixer (idle ↔ walk crossfade), status orbs
  src/main.tsx      — React shell: clock, week scrubber, status legend
  vite.config.ts    — resolves Three.js + /@fs/ asset paths from world-of-claudecraft
```

Character GLBs are loaded from `world-of-claudecraft/public/models/chars/players/` via Vite's `/@fs/` dev-server passthrough. They use Meshopt compression — the GLTFLoader is configured with `MeshoptDecoder` automatically.

### Roadmap

The Simulation Studio is growing into a full experiment-to-video pipeline:

| Layer | Status | Description |
|---|---|---|
| **Experiment designer** | Planned | Form-based UI to configure agent archetypes, population size, constraints |
| **Mesa runner** | Planned | Run headless simulations and stream results into the 3D world |
| **Story filter** | Planned | Surface success/struggle agents; click to follow with camera |
| **Follow-cam** | Planned | God view ↔ agent-follow camera with smooth lerp |
| **Auto-capture** | Planned | MediaRecorder canvas capture + frame stitching for production video |
| **CLI skills** | Planned | Claude Code skills that turn conversational descriptions into experiment configs and narrative JSON |

The CLI interface is intentional: Claude Code connects directly to the codebase, so experiment ideas described in the terminal translate into code and data changes visible immediately in the GUI — no integration layer needed.
