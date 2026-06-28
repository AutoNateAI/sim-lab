# Run log

## 2026-06-28 — version 1

- Implemented a seeded 240-resident workforce pipeline.
- Added controls for budget, outreach, concurrent training seats, and job openings.
- Added ODD protocol, code notes, and first controlled-experiment tutorial.
- Capture target: default model and high-capacity comparison in the real Docusaurus site.

Debug order: URL/base path → simulator selector → control selector → result render → screenshot path.

## 2026-06-28 — Mesa source and headed browser evidence

- Replaced the TypeScript simulation engine with Mesa 3.5.1 `Model`, `Agent`, and `DataCollector` output.
- Generated four seeded scenario series in `mesa-results.json`.
- Generated four seeded scenario run folders under `runs/` and wrote `runs/index.json` plus `mesa-results.json` for compatibility.
- Ran the production Docusaurus build through headed Chrome using Playwright.
- Captured baseline, outreach 16%, training seats 72, and openings 160.
- Persisted observed browser metrics in `experiment-results.json`.
- Disabled headed-Chrome GPU occlusion and waited for Docusaurus hydration before capture.

Capture URL: `http://127.0.0.1:3000/simulations/workforce-development/city-opportunity-simulator`.

## 2026-06-28 — internal research cockpit

- Added a standalone Vite/React/Phaser dashboard that reads the checked-in Mesa run bundles.
- Added whole-board replay, pan and zoom, pause and timeline controls, scenario reports, and default dark-mode AutoNateAI branding.
- Added single-agent and Shift-click group following with persistent camera framing and visible follow markers.
- Documented the roadmap for Codex-assisted board construction, homes, mobility modes, physics, research capture, and Docusaurus/PDF report production.
- Captured the baseline dashboard at week 2 for the public roadmap and dashboard README.

Capture URL: `http://127.0.0.1:5174/`.
Scenario: `workforce_001-baseline-seed42`.
Asset: `simulations/assets/sim-dashboard-dark.png`.
