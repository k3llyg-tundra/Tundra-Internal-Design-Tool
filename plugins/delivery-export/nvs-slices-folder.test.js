const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('ui.html', 'utf8');
const start = source.indexOf('function getSubfolder');
const end = source.indexOf('function getTargetedEmailMarketsByPhase', start);
assert.ok(start >= 0 && end > start, 'NVS folder builder is present');

const context = {
  getNvsChannelFolder(channel) { return channel; },
  getMidSeasonPhaseFolderLabel() { return ''; },
  document: { getElementById() { return { value: '' }; } }
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

const base = {
  fileSetup: 'targeted-comms',
  phase: 'Reminder',
  channel: 'Nike App',
  isComp: false,
  deliveryType: 'Thread'
};

assert.equal(
  context.getSubfolder({ ...base, subfolderSection: 'Carousel 1' }, 1),
  'Reminder/Nike App/Slices/Thread/Carousel/Carousel 1'
);
assert.equal(
  context.getSubfolder({ ...base, subfolderSection: 'Carousel 2' }, 1),
  'Reminder/Nike App/Slices/Thread/Carousel/Carousel 2'
);
console.log('nvs-slices-folder.test.js: ok');
