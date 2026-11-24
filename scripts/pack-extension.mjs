// Packs the Chrome extension into a zip.
//   node scripts/pack-extension.mjs            -> adsnoop-extension.zip (talks to adsnoop.co.uk)
//   node scripts/pack-extension.mjs --preview  -> adsnoop-extension-preview.zip (talks to preview.adsnoop.co.uk)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const preview = process.argv.includes('--preview');
const src = path.resolve('extension');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adsnoop-ext-'));
const dir = path.join(tmp, 'adsnoop-extension');
fs.cpSync(src, dir, {recursive: true, filter: f => !/README\.md$/.test(f)});
if (preview) {
  const cfg = path.join(dir, 'config.js');
  fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace("'https://adsnoop.co.uk'", "'https://preview.adsnoop.co.uk'"));
  const man = path.join(dir, 'manifest.json'), m = JSON.parse(fs.readFileSync(man, 'utf8'));
  m.name = 'AdSnoop (preview)';
  fs.writeFileSync(man, JSON.stringify(m, null, 2) + '\n');
}
const out = path.resolve(preview ? 'adsnoop-extension-preview.zip' : 'adsnoop-extension.zip');
fs.rmSync(out, {force: true});
execFileSync('zip', ['-qr', out, 'adsnoop-extension'], {cwd: tmp});
fs.rmSync(tmp, {recursive: true, force: true});
console.log('Packed', out);
