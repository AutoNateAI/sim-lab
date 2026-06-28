import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';

const root = resolve('simulations');
const markdown = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory() && !path.endsWith(join('pdf', 'build'))) walk(path);
    else if (['.md', '.mdx'].includes(extname(path))) markdown.push(path);
  }
}
walk(root);

let images = 0;
for (const file of markdown) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split('#')[0];
    if (/^(https?:|data:)/.test(link)) continue;
    const target = resolve(dirname(file), link);
    if (!existsSync(target)) throw new Error(`Broken image in ${file}: ${link}`);
    images += 1;
  }
}
console.log(`Validated ${markdown.length} simulation documents and ${images} local images.`);
