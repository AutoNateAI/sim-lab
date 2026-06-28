import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const output = new URL('./assets/', import.meta.url);
await mkdir(output, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: process.env.HEADLESS === 'true'});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, deviceScaleFactor: 1});
await page.goto(process.env.SIM_URL, {waitUntil: 'networkidle'});
const simulation = page.getByTestId('simulation-root');
await simulation.waitFor({state: 'visible'});
await simulation.screenshot({path: new URL('assets/01-baseline.png', import.meta.url)});
await browser.close();
