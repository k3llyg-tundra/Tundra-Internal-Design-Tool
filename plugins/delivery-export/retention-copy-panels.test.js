const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('code.js', 'utf8');
const start = source.indexOf('function separateRetentionEmailPanels(');
const end = source.indexOf('function mergeAutomaticAssetReferences(', start);
const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

for (const productPanels of [3, 4]) {
  const layers = [];
  for (let p = 1; p <= productPanels; p++) layers.push({ panel: 'P' + p, layer: 'Headline', text: 'Product ' + p, y: p * 100 });
  layers.push({ panel: 'P' + productPanels, layer: 'Headline', text: 'Explore More', y: 500 });
  layers.push({ panel: 'P' + productPanels, layer: 'CTA', text: 'Running', y: 520 });
  layers.push({ panel: 'P' + productPanels, layer: 'Heading', text: 'Shopping With Us is Easy', y: 600 });
  layers.push({ panel: 'P' + productPanels, layer: 'CTA', text: 'Shipping Perks', y: 620, shoppingTout: true });
  layers.push({ panel: 'P1', layer: '__asset__', assetLabel: 'Swoosh Footer', isAsset: true, y: -1000000 });
  const frames = [{ channel: 'Nike Email', layers }];
  context.separateRetentionEmailPanels(frames);
  assert.equal(layers.find(l => l.text === 'Explore More').panel, 'P' + (productPanels + 1));
  assert.equal(frames[0].layers.find(l => l.assetLabel === 'Swoosh Footer').panel, 'P' + (productPanels + 2));
  assert.equal(layers.find(l => l.text === 'Shopping With Us is Easy').panel, 'P' + (productPanels + 3));
  assert.equal(layers.find(l => l.text === 'Shipping Perks').panel, 'P' + (productPanels + 3));
}
const missingSwoosh = [{ channel: 'Nike Email', layers: [{ panel: 'P1', layer: 'Headline', text: 'Hero', y: 0 }, { panel: 'P1', layer: 'Heading', text: 'Shopping With Us is Easy', y: 100 }] }];
context.separateRetentionEmailPanels(missingSwoosh);
assert.equal(missingSwoosh[0].layers.find(l => l.isAsset).assetLabel, 'Swoosh Footer');
const app = [{ channel: 'Nike App', layers: [{ panel: 'P1', text: 'Explore More' }] }];
context.separateRetentionEmailPanels(app);
assert.equal(app[0].layers[0].panel, 'P1');
console.log('retention-copy-panels.test.js: ok');
