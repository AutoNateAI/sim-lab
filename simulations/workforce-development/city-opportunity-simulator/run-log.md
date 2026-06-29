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

## 2026-06-28 — hourly spatial city model

- Added a Mesa-authored city contract with a residential street grid, education organizations, support services, and a business district.
- Distributed resident homes deterministically along streets and assigned individual weekday start/end schedules.
- Added walking, biking, and driving modes with seeded speed variation and finite road-constrained travel.
- Added deterministic lane separation as the first collision-avoidance rule; agents cannot teleport between destinations or travel across turf.
- Added a 2,689-position hourly clock across 16 seven-day weeks and connected the Phaser replay to hour/day/week state.
- Added dawn, daylight, dusk, and night overlays and updated the dashboard capture at week 0, day 1, 11:00.

Spatial artifacts: `world.json` and `hourly_clock.csv`.

## 2026-06-28 — continuous travel and time access

- Replaced direct coordinate tweens with continuous interpolation along Mesa-authored route segments.
- Advanced the dashboard in 15-minute steps and treated start time as target arrival time, making commute distance visible.
- Added directional lanes, signal stops, following gaps, queue delay, home entry, and hidden at-home state.
- Added resident priority, active days, weekly time budget, action hours, commute hours, and time-access effects to every pipeline transition.
- Regenerated all four seeded Mesa run bundles under model version 2.1.0.

Dashboard verification URL: `http://127.0.0.1:5174/`.
Tutorial capture URL: `http://127.0.0.1:3001/simulations/workforce-development/city-opportunity-simulator` (headed Chrome).
Final tutorial image files were re-rendered with the same script in headless mode after macOS headed-window occlusion produced corrupted pixels.
- Added persistent destination labels for the support center, north and south training centers, and west and east employer hubs.
