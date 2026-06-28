import {chromium} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'assets');
const resultsPath = resolve(here, 'experiment-results.json');
const appUrl = process.env.SIM_URL ?? 'http://127.0.0.1:3000/simulations/workforce-development/city-opportunity-simulator';
const headless = process.env.HEADLESS === 'true';
await mkdir(output, {recursive: true});

const scenarios = [
  {id: 'baseline', label: 'Baseline', screenshot: '01-baseline-simulation.png'},
  {id: 'expanded-outreach', label: 'Outreach 16%', screenshot: '02-expanded-outreach.png'},
  {id: 'expanded-training', label: 'Training seats 72', screenshot: '03-expanded-training.png'},
  {id: 'expanded-employer-demand', label: 'Openings 160', screenshot: '04-expanded-employer-demand.png'},
];

const experiments = [];
for (const scenario of scenarios) {
  // A fresh process avoids headed-Chrome surface reuse/occlusion artifacts.
  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    slowMo: headless ? 0 : 120,
    args: ['--disable-gpu', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1, colorScheme: 'light'});
  await page.goto(appUrl, {waitUntil: 'networkidle'});
  await page.locator('html[data-has-hydrated="true"]').waitFor();
  const simulator = page.getByTestId('city-opportunity-simulator');
  await simulator.waitFor({state: 'visible'});
  await page.getByRole('button', {name: 'Reset model'}).click();
  await page.getByRole('button', {name: scenario.label, exact: true}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="simulation-results"] strong')?.textContent?.length);
  await page.waitForTimeout(300);

  const metrics = {};
  const cards = page.getByTestId('simulation-results').locator(':scope > div');
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    metrics[(await card.locator('span').innerText()).trim()] = (await card.locator('strong').innerText()).trim();
  }
  const engine = (await simulator.locator('header, div').filter({hasText: /^MESA [\d.]+ OUTPUT/}).first().locator('span').innerText()).trim();
  experiments.push({id: scenario.id, mesa_engine: engine, metrics, screenshot: `assets/${scenario.screenshot}`});
  await simulator.screenshot({path: resolve(output, scenario.screenshot), animations: 'disabled'});
  await page.close();
  await browser.close();
}

await writeFile(resultsPath, `${JSON.stringify({captured_at: new Date().toISOString(), app_url: appUrl, headed: !headless, experiments}, null, 2)}\n`);
console.log(`Captured ${experiments.length} headed tutorial experiments in ${output}`);
console.log(JSON.stringify(experiments, null, 2));
