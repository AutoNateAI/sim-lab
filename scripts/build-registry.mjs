import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, resolve, join} from 'node:path';
import {parse} from 'yaml';

const root = resolve('simulations');
const output = resolve('registry/simulations.json');
const check = process.argv.includes('--check');
const manifests = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name === 'manifest.yaml') manifests.push(path);
  }
}
walk(root);

const required = ['id', 'title', 'summary', 'industry', 'status', 'odd_version', 'model_version', 'engine', 'created_at', 'route', 'agents', 'metrics', 'tags', 'artifacts'];
const ids = new Set();
const simulations = manifests.map((path) => {
  const manifest = parse(readFileSync(path, 'utf8'));
  for (const field of required) if (manifest[field] === undefined) throw new Error(`${path} is missing ${field}`);
  if (!/^[a-z][a-z0-9-]*_\d{3}$/.test(manifest.id)) throw new Error(`${path} has invalid id ${manifest.id}`);
  if (ids.has(manifest.id)) throw new Error(`Duplicate simulation id: ${manifest.id}`);
  ids.add(manifest.id);
  const folder = dirname(path);
  const expected = {odd: 'odd.md', code: 'code.md', tutorial: 'tutorial.md', browser_capture: 'capture-actual-app.mjs'};
  for (const [artifact, filename] of Object.entries(expected)) {
    if (manifest.artifacts[artifact] && !existsSync(join(folder, filename))) throw new Error(`${manifest.id} claims ${artifact} but ${filename} is missing`);
  }
  if (manifest.artifacts.pdf && (!existsSync(join(folder, 'pdf')) || !readdirSync(join(folder, 'pdf')).some((name) => name.endsWith('.pdf')))) throw new Error(`${manifest.id} claims pdf but no PDF exists`);
  if (manifest.artifacts.browser_visualization && !readdirSync(folder).some((name) => name.endsWith('.tsx'))) throw new Error(`${manifest.id} claims browser_visualization but no TSX component exists`);
  for (const field of ['experiment_results', 'model_output']) {
    if (manifest[field] && !existsSync(join(folder, manifest[field]))) throw new Error(`${manifest.id} declares ${field} but ${manifest[field]} is missing`);
  }
  manifest.created_at = String(manifest.created_at);
  return manifest;
}).sort((a, b) => a.id.localeCompare(b.id));

const generatedAt = simulations.map((simulation) => simulation.created_at).sort().at(-1) ?? null;
const payload = `${JSON.stringify({generated_at: generatedAt, simulations}, null, 2)}\n`;
if (check) {
  if (readFileSync(output, 'utf8') !== payload) throw new Error('registry/simulations.json is stale. Run npm run registry:build.');
  console.log(`Registry is current: ${simulations.length} simulation(s).`);
} else {
  writeFileSync(output, payload);
  console.log(`Wrote ${simulations.length} simulation(s) to ${output}.`);
}
