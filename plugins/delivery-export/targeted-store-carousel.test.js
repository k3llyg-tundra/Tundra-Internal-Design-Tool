const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function attach(node, parent = null) {
  node.parent = parent;
  node.visible = node.visible !== false;
  node.locked = false;
  node.children = node.children || [];
  node.children.forEach((child) => attach(child, node));
  return node;
}

const context = {
  figma: {
    showUI() {},
    ui: { postMessage() {}, onmessage: null },
    root: { children: [], findChild() { return null; } },
    currentPage: { id: 'page', selection: [] }
  },
  __html__: '',
  console,
  Uint8Array,
  Date,
  setTimeout,
  clearTimeout
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('code.js', 'utf8'), context);

assert.equal(context.isTargetedSliceTarget('Store Carousel'), true);
assert.equal(context.isTargetedSliceTarget('Store-Carousel [P2]'), true);
assert.equal(context.isTargetedSliceTarget('[P2] Carousel-Frame 10'), true);
assert.equal(context.isTargetedSliceTarget('[P2] Carousel-Default'), true);
assert.equal(context.getTargetedCarouselGroup('[P2] Carousel-Frame3', []), 'Carousel');
assert.equal(context.getTargetedCarouselGroup('[P2] Carousel-Default', []), 'Carousel');
assert.equal(context.getTargetedCarouselGroup('[P2] Carousel-Frame3', ['Reminder', 'Nike App', 'Store Carousel']), 'Carousel 2');
assert.equal(context.getTargetedCarouselGroup('[P2] Carousel-Frame 2', ['Reminder', 'Nike App', 'Shoes / Apparel Carousel']), 'Carousel 1');
assert.equal(context.getTargetedCarouselGroup('[P2] Carousel-Frame 2', ['Reminder', 'Nike App', 'Carousel Shoes / Apparel']), 'Carousel 1');
assert.equal(context.getTargetedCarouselGroup('[P3] Carousel1-Frame 1', []), 'Carousel 1');
assert.equal(context.getTargetedCarouselGroup('[P2] Carousel2-Frame 3', []), 'Carousel 2');
assert.equal(context.isTargetedSliceTarget('[P3] Carousel1-Frame 1'), true);
assert.equal(context.isTargetedSliceTarget('[P2] Carousel2-Frame 3'), true);

const child = attach({ id: 'layout', type: 'FRAME', name: 'Supporting 1' });
const storeCarousel = attach({
  id: 'store-carousel',
  type: 'COMPONENT',
  name: 'Store Carousel',
  children: [child]
});

const candidates = context.resolveTargetedSliceCandidates([
  { node: storeCarousel, ancestry: ['Reminder', 'Nike App'] },
  { node: child, ancestry: ['Reminder', 'Nike App', 'Store Carousel'] }
]);

assert.deepEqual(Array.from(candidates, (item) => item.node.id), ['store-carousel']);

const duplicateDefaults = [
  { label: 'Carousel-Default', assetLabel: 'Carousel-Default', isCarousel: true, assetGroup: 'Carousel', phase: 'Reminder', channel: 'Nike App', deliveryType: 'App', absoluteX: 1600, absoluteY: 8700 },
  { label: 'Carousel-Default', assetLabel: 'Carousel-Default', isCarousel: true, assetGroup: 'Carousel', phase: 'Reminder', channel: 'Nike App', deliveryType: 'App', absoluteX: 1200, absoluteY: 8700 }
];
context.disambiguateTargetedDuplicateSliceLabels(duplicateDefaults);
assert.deepEqual(Array.from(duplicateDefaults, (item) => item.assetLabel), ['Carousel-Default_2', 'Carousel-Default_1']);

const selectedDefault = [
  { label: 'Carousel-Default', assetLabel: 'Carousel-Default', isCarousel: true, assetGroup: 'Carousel', phase: 'Reminder', channel: 'Nike App', deliveryType: 'App' }
];
context.disambiguateTargetedDuplicateSliceLabels(selectedDefault);
assert.equal(selectedDefault[0].assetLabel, 'Carousel-Default');

const designSpace = attach({ id: 'design', type: 'PAGE', name: 'Design Space', children: [
  attach({ id: 'send', type: 'SECTION', name: 'Reminder', children: [
    attach({ id: 'thread', type: 'FRAME', name: 'Thread', children: [
      attach({ id: 'carousel-1', type: 'FRAME', name: 'Shoes / Apparel Carousel', children: [
        attach({ id: 'c1-frame-1', type: 'INSTANCE', name: '[P2] Carousel1-Frame 1', width: 335, height: 335 }),
        attach({ id: 'c1-default', type: 'INSTANCE', name: '[P2] Carousel1-Default', width: 335, height: 335 })
      ] }),
      attach({ id: 'carousel-2', type: 'FRAME', name: 'Store Carousel', children: [
        attach({ id: 'c2-default', type: 'INSTANCE', name: '[P3] Carousel2-Default', width: 335, height: 335 })
      ] })
    ] })
  ] })
] });
const reviewPage = attach({ id: 'review', type: 'PAGE', name: 'Client Review', children: [] });
context.figma.root.children = [designSpace, reviewPage];
context.figma.root.findChild = (predicate) => context.figma.root.children.find(predicate) || null;

const scannedSlices = context.getFramesOnPage('review', 'slices', 'targeted-comms', {});
assert.deepEqual(Array.from(scannedSlices, (item) => item.id), ['c1-frame-1', 'c1-default', 'c2-default']);
assert.deepEqual(Array.from(scannedSlices, (item) => item.subfolderSection), ['Carousel 1', 'Carousel 1', 'Carousel 2']);
console.log('targeted-store-carousel.test.js: ok');
