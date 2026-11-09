const fs = require('fs');
const vm = require('vm');

(async function () {
  const page = { id: 'page-1', type: 'PAGE', name: 'Design Space' };
  const gifBytes = new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0]);
  const secondGifBytes = new Uint8Array([71, 73, 70, 56, 57, 97, 2, 0]);
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const jpgBytes = new Uint8Array([255, 216, 255, 217]);
  let fallbackExportSettings = null;

  const imageNode = {
    id: 'image-1', type: 'RECTANGLE', name: 'Prepared animation', visible: true, locked: false,
    fills: [
      { type: 'IMAGE', imageHash: 'top-gif', visible: true, scaleMode: 'FILL' },
      { type: 'IMAGE', imageHash: 'second-gif', visible: true, scaleMode: 'FILL' }
    ]
  };
  Object.defineProperty(imageNode, 'itemReverseZIndex', {
    get() { throw new TypeError('node.itemReverseZIndex: no such property itemReverseZIndex on RECTANGLE node'); }
  });
  Object.defineProperty(imageNode, 'children', {
    get() { throw new TypeError('node.children: no such property children on RECTANGLE node'); }
  });
  const gifFrame = {
    id: 'gif-1', type: 'COMPONENT', name: '[GIF] [P2] Supporting 1', visible: true, locked: false,
    width: 375, height: 375, fills: [{ type: 'SOLID' }], children: [imageNode],
    async exportAsync(settings) { fallbackExportSettings = settings; return jpgBytes; }
  };
  imageNode.parent = gifFrame;

  const invalidGifFrame = {
    id: 'gif-invalid', type: 'FRAME', name: '[GIF] Supporting 2', visible: true, locked: false,
    width: 375, height: 375, fills: [{ type: 'SOLID' }], children: [],
    async exportAsync(settings) { fallbackExportSettings = settings; return jpgBytes; }
  };
  const coveredGifFrame = {
    id: 'gif-covered', type: 'FRAME', name: '[GIF] Supporting 3', visible: true, locked: false,
    width: 375, height: 375,
    fills: [
      { type: 'IMAGE', imageHash: 'top-png', visible: true, scaleMode: 'FILL' },
      { type: 'IMAGE', imageHash: 'second-gif', visible: true, scaleMode: 'FILL' }
    ],
    children: [],
    async exportAsync(settings) { fallbackExportSettings = settings; return jpgBytes; }
  };
  const lockedGifNode = {
    id: 'locked-image', type: 'RECTANGLE', name: 'Locked prepared GIF', visible: true, locked: true,
    fills: [{ type: 'IMAGE', imageHash: 'top-gif', visible: true, scaleMode: 'FILL' }]
  };
  const lockedGifFrame = {
    id: 'gif-locked', type: 'FRAME', name: '[GIF] DT Hero', visible: true, locked: false,
    width: 750, height: 1120, fills: [{ type: 'SOLID' }], children: [lockedGifNode],
    async exportAsync(settings) { fallbackExportSettings = settings; return jpgBytes; }
  };
  lockedGifNode.parent = lockedGifFrame;

  const underlyingGifNode = {
    id: 'underlying-gif', type: 'RECTANGLE', name: 'Animated artwork', visible: true, locked: false,
    fills: [{ type: 'IMAGE', imageHash: 'top-gif', visible: true, scaleMode: 'FILL' }]
  };
  const pngOverlayNode = {
    id: 'png-overlay', type: 'RECTANGLE', name: 'Logo overlay', visible: true, locked: false,
    fills: [{ type: 'IMAGE', imageHash: 'top-png', visible: true, scaleMode: 'FILL' }]
  };
  const overlayGifFrame = {
    id: 'gif-overlay', type: 'FRAME', name: '[GIF] MB Hero', visible: true, locked: false,
    width: 375, height: 560, fills: [{ type: 'SOLID' }], children: [underlyingGifNode, pngOverlayNode],
    async exportAsync(settings) { fallbackExportSettings = settings; return jpgBytes; }
  };
  underlyingGifNode.parent = overlayGifFrame;
  pngOverlayNode.parent = overlayGifFrame;

  const messages = [];
  const nodes = {
    [gifFrame.id]: gifFrame,
    [invalidGifFrame.id]: invalidGifFrame,
    [coveredGifFrame.id]: coveredGifFrame,
    [lockedGifFrame.id]: lockedGifFrame,
    [overlayGifFrame.id]: overlayGifFrame
  };
  const images = {
    'top-gif': { async getBytesAsync() { return gifBytes; } },
    'second-gif': { async getBytesAsync() { return secondGifBytes; } },
    'top-png': { async getBytesAsync() { return pngBytes; } }
  };
  const figma = {
    showUI() {},
    root: { children: [page], findChild(fn) { return fn(page) ? page : null; } },
    currentPage: page,
    async getNodeByIdAsync(id) { return nodes[id] || null; },
    getImageByHash(hash) { return images[hash] || null; },
    ui: { postMessage(message) { messages.push(message); } }
  };
  const context = { __html__: '', console, figma, Uint8Array };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + '/code.js', 'utf8'), context);

  if (!context.isTargetedSliceTarget('[GIF] [P2] Supporting 1')) {
    throw new Error('Targeted Comms does not discover a GIF-only tagged asset');
  }
  if (!context.isRetentionSliceTarget('[GIF] [P2] Supporting 1')) {
    throw new Error('Shared GIF support is incompatible with Retention discovery');
  }

  const baseJob = {
    frameName: gifFrame.name, label: 'Supporting 1', filename: 'supporting-1',
    fallbackFilename: 'supporting-1_[GIF TO BE EXPORTED]',
    subfolder: 'Launch/Nike Email/Slices/Supporting', format: 'GIF', scale: 2,
    isComp: false, isGif: true, pageId: page.id, fileSetup: 'targeted-comms'
  };

  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [Object.assign({}, baseJob, { frameId: gifFrame.id })] });
  const success = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (!success.success || success.isPlaceholder) throw new Error('Valid uploaded GIF was not exported directly');
  if (success.filename !== 'supporting-1.gif') throw new Error('GIF filename contract is incorrect: ' + success.filename);
  if (success.bytes[6] !== 1) throw new Error('Exporter did not choose the top visible GIF fill');

  messages.length = 0;
  fallbackExportSettings = null;
  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [Object.assign({}, baseJob, { frameId: invalidGifFrame.id })] });
  const fallback = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (!fallback.success || !fallback.isPlaceholder) throw new Error('Missing GIF source did not produce a non-blocking placeholder');
  if (fallback.filename !== 'supporting-1_[GIF TO BE EXPORTED].jpg') throw new Error('Fallback filename is not explicit: ' + fallback.filename);
  if (fallback.intendedGifFilename !== 'supporting-1.gif') throw new Error('Fallback omitted the intended GIF filename');
  if (!fallback.placeholderAnnotation || !fallback.placeholderAnnotation.includes('supporting-1.gif')) {
    throw new Error('Fallback omitted its image annotation');
  }
  if (!fallbackExportSettings || fallbackExportSettings.format !== 'JPG') throw new Error('Fallback did not render a JPG reference');

  messages.length = 0;
  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [Object.assign({}, baseJob, { frameId: lockedGifFrame.id })] });
  const lockedResult = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (!lockedResult.success || lockedResult.isPlaceholder || lockedResult.filename !== 'supporting-1.gif') {
    throw new Error('Readable GIF bytes inside a locked child were not exported');
  }

  messages.length = 0;
  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [Object.assign({}, baseJob, { frameId: overlayGifFrame.id })] });
  const overlayResult = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (!overlayResult.success || overlayResult.isPlaceholder || overlayResult.filename !== 'supporting-1.gif') {
    throw new Error('Visible PNG/JPG artwork prevented discovery of the valid GIF source');
  }

  messages.length = 0;
  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [Object.assign({}, baseJob, { frameId: coveredGifFrame.id })] });
  const coveredResult = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (!coveredResult.success || coveredResult.isPlaceholder || coveredResult.bytes[6] !== 2) {
    throw new Error('Exporter did not continue to a valid GIF fill after a visible non-GIF fill');
  }

  messages.length = 0;
  const retentionJob = Object.assign({}, baseJob, {
    frameId: gifFrame.id,
    filename: '[NIKRA1003] FA26 Retention Offense_Week 9_Nike Email_Supporting 1_375x375@2x',
    fallbackFilename: '[NIKRA1003] FA26 Retention Offense_Week 9_Nike Email_Supporting 1_375x375@2x_[GIF TO BE EXPORTED]',
    subfolder: 'Week 9/Nike Email/Slices/Supporting',
    fileSetup: 'retention-offense'
  });
  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [retentionJob] });
  const retention = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (retention.filename !== retentionJob.filename + '.gif' || retention.subfolder !== retentionJob.subfolder || retention.isPlaceholder) {
    throw new Error('Shared GIF exporter changed the Retention filename/folder contract');
  }

  messages.length = 0;
  await figma.ui.onmessage({ type: 'EXPORT_BATCH', jobs: [Object.assign({}, retentionJob, { frameId: invalidGifFrame.id })] });
  const retentionFallback = messages.find(message => message.type === 'EXPORT_RESULT').result;
  if (!retentionFallback.isPlaceholder || retentionFallback.filename !== retentionJob.fallbackFilename + '.jpg' || retentionFallback.subfolder !== retentionJob.subfolder) {
    throw new Error('Retention GIF fallback does not preserve its stream-owned filename/folder');
  }

  let scanId = 0;
  function scanNode(type, name, x, children) {
    const item = {
      id: 'scan-' + (++scanId), type, name, x: x || 0, y: 0,
      absoluteTransform: [[1, 0, x || 0], [0, 1, 0]],
      visible: true, locked: false, width: 375, height: 375,
      fills: [{ type: 'SOLID' }], children: children || []
    };
    item.children.forEach(child => { child.parent = item; });
    return item;
  }
  const scannedGif = scanNode('COMPONENT', '[GIF] [P2] Supporting 1', 200, [
    scanNode('RECTANGLE', 'Prepared animation', 200, [])
  ]);
  const designPage = scanNode('PAGE', 'Design Space', 0, [
    scanNode('FRAME', '[SEND] Reminder', 0, []),
    scanNode('FRAME', 'Reminder', 200, [
      scanNode('FRAME', 'Nike Email', 200, [
        scanNode('FRAME', 'Slices', 200, [scannedGif])
      ])
    ])
  ]);
  const scanRoot = { name: '[NIKRA1003] FA26 NVS September Promo | Targeted Comms', children: [designPage], findChild(fn) { return this.children.find(fn); } };
  designPage.parent = scanRoot;
  const scanFigma = { showUI() {}, root: scanRoot, currentPage: designPage, ui: { postMessage() {} } };
  const scanContext = { __html__: '', console, figma: scanFigma, Uint8Array };
  vm.createContext(scanContext);
  vm.runInContext(fs.readFileSync(__dirname + '/code.js', 'utf8'), scanContext);
  const scanned = scanContext.getFramesOnPage(designPage.id, 'slices', 'targeted-comms', { includeStreamPages: false });
  if (scanned.length !== 1) throw new Error('Real NVS Design Space scan did not return the GIF asset');
  if (!scanned[0].isGif || scanned[0].phase !== 'Reminder' || scanned[0].channel !== 'Nike Email' || scanned[0].subfolderSection !== 'Supporting') {
    throw new Error('NVS GIF scan metadata is incorrect: ' + JSON.stringify(scanned[0]));
  }

  console.log('GIF export fixture: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
