#!/usr/bin/env node
/**
 * Fetches Grand Rapids road network from Overpass API and saves gr-osm-roads.json.
 * Run once: node simulations/workforce-development/city-opportunity-simulator/fetch-gr-osm.mjs
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// GR bounding box: south,west,north,east
const BBOX = '42.88,-85.72,43.02,-85.56';

// Sim world dimensions
const W = 24000;
const H = 16000;
const GR_BOUNDS = { minLon: -85.72, maxLon: -85.56, minLat: 42.88, maxLat: 43.02 };

function lonToX(lon) {
  return ((lon - GR_BOUNDS.minLon) / (GR_BOUNDS.maxLon - GR_BOUNDS.minLon)) * W;
}
function latToY(lat) {
  return (1 - (lat - GR_BOUNDS.minLat) / (GR_BOUNDS.maxLat - GR_BOUNDS.minLat)) * H;
}

const OVERPASS_QUERY = `[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"](${BBOX});
  way["waterway"~"^(river|stream)$"](${BBOX});
);
out geom;`;

async function fetchOSM() {
  console.log('Fetching GR road network from Overpass API...');

  const resp = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'sim-lab-gr-osm-fetch/1.0',
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });

  if (!resp.ok) {
    throw new Error(`Overpass API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  console.log(`Received ${data.elements.length} OSM elements`);

  const roads = [];
  const waterways = [];

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.geometry) continue;

    const points = el.geometry.map((node) => [
      Math.round(lonToX(node.lon)),
      Math.round(latToY(node.lat)),
    ]);

    if (el.tags?.waterway) {
      waterways.push({ id: String(el.id), kind: el.tags.waterway, points });
    } else if (el.tags?.highway) {
      roads.push({ id: String(el.id), kind: el.tags.highway, points });
    }
  }

  // Sort by importance for rendering order (primary drawn last = on top)
  const ORDER = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, residential: 5 };
  roads.sort((a, b) => (ORDER[b.kind] ?? 9) - (ORDER[a.kind] ?? 9));

  const output = { roads, waterways, bounds: GR_BOUNDS, worldSize: { w: W, h: H } };
  const outPath = join(__dir, 'gr-osm-roads.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`Saved ${roads.length} roads, ${waterways.length} waterways → ${outPath}`);
  console.log('Done! Re-run the dashboard to see real GR streets.');
}

fetchOSM().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
