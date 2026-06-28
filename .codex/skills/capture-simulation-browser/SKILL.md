---
name: capture-simulation-browser
description: Capture reproducible screenshots and recordings from real Sim Lab browser simulations with Playwright. Use when creating tutorial image assets, documenting parameter experiments, visually checking a simulation, or building evidence for an article or PDF.
---

# Capture Simulation Browser

Capture the actual running Docusaurus site. Never substitute generated UI frames when the simulation can be opened in a browser.

## Workflow

1. Read the target `manifest.yaml`, tutorial, and component selectors.
2. Identify the simulation engine and run its source model first. Browser captures must show that engine's output; do not replace Mesa, another framework, or a headless model with a visually similar JavaScript reimplementation.
3. Start the site with `npm start` or serve the production build.
4. Copy `scripts/capture-template.mjs` into the simulation folder as `capture-actual-app.mjs` when a script does not exist.
5. Use stable `data-testid`, label, role, or text locators. Avoid CSS implementation details.
6. Launch a headed browser by default so the run is observable. Permit `HEADLESS=true` only for CI or an explicitly requested background run.
7. Perform every tutorial action through Playwright controls, capture the resulting metrics, and take a screenshot at each checkpoint.
8. Save ordered assets under the simulation's `assets/` folder and structured outputs in `experiment-results.json`.
9. Embed each asset and its observed results immediately below the tutorial action it supports.
10. Run `npm run validate:simulations` and visually inspect every capture.

For video, use Playwright's `recordVideo` browser-context option and copy the finalized `.webm` into the simulation's assets. Keep recordings short and focused on one experiment.

Read `references/capture-checklist.md` before finalizing a new capture script.
