#!/usr/bin/env node
// Builds dist/master-carton-planner.html: the page template with the engine inlined,
// so the planner ships as one self-contained file (only three.js and jsPDF load from cdnjs).
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p));

const template = read('src/app.html').toString('utf8');
const engine = read('src/engine.js').toString('utf8');

for (const marker of ['/*ENGINE*/']) {
  if (!template.includes(marker)) {
    console.error(`src/app.html is missing the ${marker} marker`);
    process.exit(1);
  }
}

// function replacements, so "$" sequences in the sources are kept literally
const body = template.replace('/*ENGINE*/', () => engine);

// a complete document, so the file opens on its own in any browser. This is the same minimal head the
// claude.ai Artifact viewer adds, so the file can also be published there unchanged.
const head = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
  + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
const page = head + body + '</body></html>';

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'master-carton-planner.html');
fs.writeFileSync(out, page);
console.log(`Built ${path.relative(root, out)} (${(page.length / 1024).toFixed(0)} KB)`);
