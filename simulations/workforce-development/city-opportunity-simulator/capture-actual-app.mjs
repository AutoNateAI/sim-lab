import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, 'assets');
const appUrl = process.env.SIM_URL ?? 'http://127.0.0.1:3000/simulations/workforce-development/city-opportunity-simulator';
await mkdir(output, {recursive: true});

const browser = await chromium.launch({channel: 'chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
await page.goto(appUrl, {waitUntil: 'networkidle'});
const simulator = page.getByTestId('city-opportunity-simulator');
await simulator.waitFor({state: 'visible'});
await simulator.screenshot({path: resolve(output, '01-baseline-simulation.png')});

const seatControl = page.getByLabel('Training seats');
await seatControl.fill('72');
await page.waitForTimeout(250);
await simulator.screenshot({path: resolve(output, '02-expanded-training.png')});

await browser.close();
console.log(`Captured actual app screenshots in ${output}`);
