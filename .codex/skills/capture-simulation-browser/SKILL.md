---
name: capture-simulation-browser
description: Capture reproducible screenshots and recordings from real Sim Lab browser simulations with Playwright. Use when creating tutorial image assets, documenting parameter experiments, visually checking a simulation, or building evidence for an article or PDF.
---

# Capture Simulation Browser

Capture the actual running Docusaurus site. Never substitute generated UI frames when the simulation can be opened in a browser.

## Workflow

1. Read the target `manifest.yaml`, tutorial, and component selectors.
2. Start the site with `npm start` or serve the production build.
3. Copy `scripts/capture-template.mjs` into the simulation folder as `capture-actual-app.mjs` when a script does not exist.
4. Use stable `data-testid`, label, role, or text locators. Avoid CSS implementation details.
5. Capture the baseline and each tutorial checkpoint after waiting for observable state.
6. Save ordered assets under the simulation's `assets/` folder.
7. Embed each asset immediately below the tutorial action it supports.
8. Run `npm run validate:simulations` and visually inspect every capture.

For video, use Playwright's `recordVideo` browser-context option and copy the finalized `.webm` into the simulation's assets. Keep recordings short and focused on one experiment.

Read `references/capture-checklist.md` before finalizing a new capture script.
