const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function attach(node, parent = null) {
  node.parent = parent;
  node.visible = node.visible !== false;
  node.locked = false;
  node.children = node.children || [];
  node.children.forEach((child) => attach(child, node));
  node.findAll = function findAll(predicate) {
    const found = [];
    (function walk(current) {
      (current.children || []).forEach((child) => {
        if (predicate(child)) found.push(child);
        walk(child);
      });
    })(node);
    return found;
  };
  return node;
}

function asset(id, name, width, height) {
  return attach({ id, type: 'FRAME', name, width, height, fills: [{ type: 'SOLID' }] });
}

const page = attach({ id: 'manual-page', type: 'PAGE', name: 'Manual exports', children: [
  attach({ id: 'cxp-dt-comp', type: 'FRAME', name: 'CXP / Comps / [NIKRA1013] Campaign_CXP-DT_COMP@2x', width: 1924, height: 944, fills: [{ type: 'SOLID' }], children: [
    asset('cxp-dt-icon', 'CXP DT Logo', 120, 60)
  ] }),
  attach({ id: 'cxp-mb-comp', type: 'FRAME', name: 'CXP / Comps / [NIKRA1013] Campaign_CXP-MB_COMP@2x', width: 600, height: 750, fills: [{ type: 'SOLID' }], children: [] }),
  attach({ id: 'cxp-slices', type: 'SECTION', name: 'CXP / Slices /', children: [
    asset('cxp-dt', 'CXP DT 1824 x 934', 1824, 934)
  ] }),
  attach({ id: 'email-slices', type: 'SECTION', name: 'Nike Email / Slices /', children: [
    attach({ id: 'hero-group', type: 'FRAME', name: 'Hero', width: 1100, height: 900, children: [
      asset('hero-dt', 'Hero DT', 640, 853)
    ] }),
    asset('supporting', 'Supporting 1', 375, 375)
  ] }),
  attach({ id: 'social-paid', type: 'SECTION', name: 'Social + Paid Media', children: [
    asset('meta', 'Meta In-Feed Static', 1080, 1350)
  ] })
] });
const emailCompPage = attach({ id: 'email-comp-page', type: 'PAGE', name: 'Email comps', children: [
  attach({ id: 'email-light-comp', type: 'FRAME', name: 'Nike Email / Comps / [NIKRA1013] Campaign_Nike Email_Hero-DT_COMP_LIGHT MODE@2x', width: 1280, height: 1706, fills: [{ type: 'SOLID' }], children: [
    asset('email-light-icon', 'Nike Logo', 120, 60),
  ] })
] });
const emptyReview = attach({ id: 'review', type: 'PAGE', name: 'Client Review', children: [] });
const emptyDesignSpace = attach({ id: 'design', type: 'PAGE', name: 'Design Space', children: [] });

const messages = [];
const context = {
  figma: {
    showUI() {},
    ui: { postMessage(message) { messages.push(message); }, onmessage: null },
    root: { name: '[NIKRA1013] HO26 NSP NMMF Eliud Kipchoge Store Appearance Announcement _ Digital Assets', children: [emptyReview, emptyDesignSpace, page, emailCompPage], findChild(predicate) { return this.children.find(predicate) || null; } },
    currentPage: emptyReview,
    async setCurrentPageAsync(nextPage) { this.currentPage = nextPage; }
  },
  __html__: '', console, Uint8Array, Date, setTimeout, clearTimeout
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('code.js', 'utf8'), context);

assert.equal(context.isNspManualPage(page), true);
const parsedContainer = context.getNspManualContainerMeta('CXP / Comps /');
assert.equal(parsedContainer.channel, 'CXP');
assert.equal(parsedContainer.kind, 'Comps');

const comps = context.getNspManualFrames(page, 'comps', {});
assert.deepEqual(Array.from(comps, (frame) => frame.id), ['cxp-dt-comp', 'cxp-mb-comp']);
assert.ok(comps.every((frame) => frame.nspManual && frame.isComp && frame.scales[0] === 2));
assert.deepEqual(Array.from(comps, (frame) => frame.label), ['CXP DT', 'CXP MB']);

const slices = context.getNspManualFrames(page, 'slices', {});
assert.deepEqual(Array.from(slices, (frame) => frame.id), ['cxp-dt', 'hero-dt', 'supporting', 'meta', 'meta::Social']);
assert.equal(slices.some((frame) => frame.id === 'hero-group'), false, 'Hero grouping frame is not exported as an asset');
assert.equal(slices.find((frame) => frame.id === 'hero-dt').subfolderSection, 'Hero');
assert.equal(slices.find((frame) => frame.id === 'supporting').subfolderSection, 'Supporting');
assert.equal(slices.find((frame) => frame.id === 'meta').channel, 'Paid Media');
assert.equal(slices.find((frame) => frame.id === 'meta::Social').channel, 'Social');
assert.equal(slices.find((frame) => frame.id === 'meta').scales[0], 1);

(async function scanThroughMessageHandler() {
  await context.figma.ui.onmessage({ type: 'SCAN_FRAMES', pageId: emptyReview.id, role: 'slices', fileSetup: 'nsp-store-appearance', options: {} });
  const result = messages.find((message) => message.type === 'FRAMES_RESULT');
  assert.ok(result, 'manual NSP scan returns frames without Design Space');
  assert.equal(result.frames.length, 5);
  await context.figma.ui.onmessage({ type: 'SCAN_FRAMES', pageId: page.id, role: 'comps', fileSetup: 'nsp-store-appearance', options: {} });
  const compResults = messages.filter((message) => message.type === 'FRAMES_RESULT' && message.role === 'comps');
  const combinedComps = compResults[compResults.length - 1].frames;
  assert.deepEqual(Array.from(combinedComps, (frame) => frame.id), ['cxp-dt-comp', 'cxp-mb-comp']);
  assert.equal(combinedComps.some((frame) => /icon/.test(frame.id)), false, 'nested comp elements are not exported');
  await context.figma.ui.onmessage({ type: 'SCAN_FRAMES', pageId: emailCompPage.id, role: 'comps', fileSetup: 'nsp-store-appearance', options: {} });
  const latestCompResult = messages.filter((message) => message.type === 'FRAMES_RESULT' && message.role === 'comps').pop();
  assert.deepEqual(Array.from(latestCompResult.frames, (frame) => frame.id), ['email-light-comp'], 'only the selected review page contributes comps');
  console.log('nsp-manual-mode.test.js: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
