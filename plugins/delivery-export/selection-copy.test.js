const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function attach(node, parent = null) {
  node.parent = parent;
  node.visible = node.visible !== false;
  node.locked = false;
  node.x = node.x || 0;
  node.y = node.y || 0;
  node.children = node.children || [];
  node.children.forEach((child) => attach(child, node));
  node.findAll = function findAll(predicate) {
    const found = [];
    function walk(current) {
      (current.children || []).forEach((child) => {
        if (predicate(child)) found.push(child);
        walk(child);
      });
    }
    walk(node);
    return found;
  };
  return node;
}

function text(id, name, characters, y) {
  return attach({ id, type: 'TEXT', name, characters, y, absoluteTransform: [[1, 0, 0], [0, 1, y]] });
}

function frame(id, name, x, y, children) {
  return attach({ id, type: 'FRAME', name, x, y, width: 375, height: 800, children });
}

async function scanSelection(selection) {
  const messages = [];
  const nodes = {};
  selection.forEach(function indexTree(root) {
    (function walk(node) {
      nodes[node.id] = node;
      (node.children || []).forEach(walk);
    })(root);
  });
  const figma = {
    showUI() {},
    ui: { postMessage(message) { messages.push(message); }, onmessage: null },
    currentPage: { id: 'page', selection },
    root: { name: 'Test file', children: [], findChild() { return null; } },
    getNodeById(id) { return nodes[id] || null; },
    async getNodeByIdAsync(id) { return nodes[id] || null; },
    closePlugin() {}
  };
  const context = { figma, __html__: '', console, Uint8Array, Date, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('code.js', 'utf8'), context);
  await figma.ui.onmessage({ type: 'SCAN_SELECTED_COPY' });
  return messages.find((message) => message.type === 'SELECTED_COPY_RESULT');
}

(async function () {
  const email = frame('email', 'Phase 2 / Nike Email / Comps / Nike Email Light', 0, 0, [
    text('subject', 'Subject Line', 'Limited Edition: Nick Daicos Brownlow Tee', 10),
    text('body', 'Body', 'Celebrate an unforgettable season.', 100),
    text('nav', 'Navigation', 'Men Women Kids', 5)
  ]);
  const app = frame('app', 'Phase 2 / Nike App / Comps / Spotlight', 500, 0, [
    text('headline', 'Headline', 'Nick Daicos Brownlow Tee', 20)
  ]);
  const divider = frame('divider', 'Divider', 1000, 0, [text('divider-title', 'Title', 'Divider', 0)]);
  const section = attach({ id: 'section', type: 'SECTION', name: 'Phase 2', children: [email, app, divider] });

  const result = await scanSelection([section]);
  assert.ok(result, 'selection scan posts a result');
  assert.deepEqual(Array.from(result.frames, (item) => item.channel), ['Nike Email', 'Nike App']);
  assert.deepEqual(Array.from(result.frames, (item) => item.name), [email.name, app.name]);
  assert.deepEqual(Array.from(result.frames[0].layers, (layer) => layer.layer), ['Subject Line', 'Body copy']);
  assert.equal(result.frames[0].layers.some((layer) => layer.text === 'Men Women Kids'), false);

  const retailors = frame('rtl', 'Retailers Email / Comp', 0, 0, [
    text('rtl-headline', '[COPY] [P1] Headline', 'Available at Nike Melbourne Central', 20)
  ]);
  retailors.locked = true;
  const unknown = frame('unknown', 'Final comp', 500, 0, [
    text('unknown-cta', 'CTA', 'Learn More', 30),
    text('mode-label', '[Light Mode]', 'Light mode annotation', 5),
    attach({ id: 'legal-group', type: 'GROUP', name: 'Legal - Footer Info', y: 40, children: [
      text('legal-body', 'Body', 'Strictly limited quantities. Available while stocks last.', 45)
    ] })
  ]);
  const directResult = await scanSelection([unknown, retailors]);
  assert.deepEqual(Array.from(directResult.frames, (item) => item.channel), ['Retailors Email', 'Unclassified']);
  assert.equal(directResult.frames[0].layers[0].layer, 'Headline');
  assert.equal(directResult.frames[1].layers.some((layer) => layer.text === 'Light mode annotation'), false);
  assert.equal(directResult.frames[1].layers.find((layer) => layer.text.indexOf('Strictly limited') === 0).layer, 'T&Cs');
  console.log('selection-copy.test.js: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
