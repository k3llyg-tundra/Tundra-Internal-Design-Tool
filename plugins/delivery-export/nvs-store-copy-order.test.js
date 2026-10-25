const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('ui.html', 'utf8');
const start = source.indexOf('function sortNvsStoreCarouselLayers');
const end = source.indexOf('// ── Build .docx', start);
assert.ok(start >= 0 && end > start, 'store carousel ordering helper is present');

const context = {};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const asset = { isAsset: true, assetGroup: 'Carousel 2', assetLabel: 'Carousel2-Default' };
const layers = [
  asset,
  { layer: 'Headline', text: 'PARTICIPATING STORES' },
  { layer: 'Headline', text: 'Store A' },
  { layer: 'Headline', text: 'Store B' },
  { layer: 'Body copy', text: 'Address A' },
  { layer: 'Body copy', text: 'Address B' }
];

const ordered = context.sortNvsStoreCarouselLayers(layers);
assert.deepEqual(Array.from(ordered, (layer) => layer.text || layer.assetLabel), [
  'Carousel2-Default',
  'PARTICIPATING STORES',
  'Store A',
  'Address A',
  'Store B',
  'Address B'
]);

const ordinary = [{ layer: 'Headline', text: 'One' }, { layer: 'Body copy', text: 'Two' }];
assert.equal(context.sortNvsStoreCarouselLayers(ordinary), ordinary);
assert.equal(context.isNvsDefaultCarouselAsset({ isAsset: true, assetLabel: '[Carousel1-Default]' }), true);
assert.equal(context.isNvsDefaultCarouselAsset({ isAsset: true, assetLabel: 'Carousel2-Default_2' }), true);
assert.equal(context.isNvsDefaultCarouselAsset({ isAsset: true, assetLabel: 'Carousel1-Frame 1' }), false);
assert.equal(context.getNvsCarouselAssetDisplayLabel({ assetGroup: 'Carousel 1', assetLabel: 'Carousel-Frame 1' }), 'Carousel1-Frame 1');
assert.equal(context.getNvsCarouselAssetDisplayLabel({ assetGroup: 'Carousel 2', assetLabel: 'Carousel-Default' }), 'Carousel2-Default');
assert.equal(context.getNvsCarouselAssetDisplayLabel({ assetGroup: 'Hero', assetLabel: 'Hero' }), 'Hero');
console.log('nvs-store-copy-order.test.js: ok');
