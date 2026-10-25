const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('ui.html', 'utf8');
const namingStart = source.indexOf('function sanitizeTargetedFilenamePart');
const namingEnd = source.indexOf('function getJobExportFormat', namingStart);
const folderStart = source.indexOf('function getSubfolder');
const folderEnd = source.indexOf('function getTargetedEmailMarketsByPhase', folderStart);
const copyStart = source.indexOf('function getCopyFallbackFrames');
const copyEnd = source.indexOf('// ── Subfolder', copyStart);
assert.ok(namingStart >= 0 && namingEnd > namingStart, 'manual NSP naming helpers are present');
assert.ok(folderStart >= 0 && folderEnd > folderStart, 'manual NSP folder helper is present');
assert.ok(copyStart >= 0 && copyEnd > copyStart, 'manual NSP copy fallback helper is present');

const context = {
  getMidSeasonPhaseFolderLabel() { return ''; },
  getNvsChannelFolder(channel) { return channel; },
  document: { getElementById() { return { value: '' }; } }
};
vm.createContext(context);
vm.runInContext(source.slice(namingStart, namingEnd), context);
vm.runInContext(source.slice(folderStart, folderEnd), context);
vm.runInContext(source.slice(copyStart, copyEnd), context);

const base = {
  fileSetup: 'nsp-store-appearance', nspManual: true,
  width: 1824, height: 934, isComp: false, channel: 'CXP', label: 'CXP DT'
};
assert.equal(
  context.makeManualNspFilename(base, 2, '28-09-26', 'NIKRA1013', 'HO26 NSP NMMF Eliud Kipchoge'),
  '28-09-26_[NIKRA1013] HO26 NSP NMMF Eliud Kipchoge_CXP-DT_3648x1868'
);
assert.equal(context.getSubfolder(base, 1), 'CXP/Slices');

const email = { ...base, channel: 'Nike Email', label: 'Hero MB', width: 375, height: 500, subfolderSection: 'Hero' };
assert.equal(
  context.makeManualNspFilename(email, 2, '28-09-26', 'NIKRA1013', 'HO26 NSP NMMF Eliud Kipchoge'),
  '28-09-26_[NIKRA1013] HO26 NSP NMMF Eliud Kipchoge_Nike Email_Hero-MB_375x500@2x'
);
assert.equal(context.getSubfolder(email, 1), 'Nike Email/Slices/Hero');

const supporting = { ...email, label: 'Supporting 2', subfolderSection: 'Supporting' };
assert.equal(
  context.makeManualNspFilename(supporting, 2, '28-09-26', 'NIKRA1013', 'HO26 NSP NMMF Eliud Kipchoge'),
  '28-09-26_[NIKRA1013] HO26 NSP NMMF Eliud Kipchoge_Nike Email_Supporting 2_375x500@2x'
);

const comp = { ...base, isComp: true };
assert.equal(context.getDefaultExportFormat(comp), 'PNG');
assert.equal(context.getSubfolder(comp, 1), 'CXP/Comps');
assert.equal(context.getSubfolder({ ...base, channel: 'Paid Media' }, 1), 'Paid Media');
assert.equal(context.getSubfolder({ ...base, channel: 'Social' }, 1), 'Social');

const cxpComp = { id: 'cxp-comp', fileSetup: 'nsp-store-appearance', nspManual: true, channel: 'CXP' };
const emailSlice = { id: 'email-slice', fileSetup: 'nsp-store-appearance', nspManual: true, channel: 'Nike Email' };
assert.deepEqual(
  Array.from(context.getCopyFallbackFrames([cxpComp], [emailSlice], { 'cxp-comp': true }, { 'email-slice': true }), (frame) => frame.id),
  ['cxp-comp', 'email-slice'],
  'selected manual Email slices provide copy when no Email comp exists'
);
assert.equal(context.shouldCreateNspCopy({ fileSetup: 'nsp-store-appearance', nspManual: true, channel: 'CXP' }), true);
assert.equal(context.shouldCreateNspCopy({ fileSetup: 'nsp-store-appearance', nspManual: true, channel: 'Nike Email' }), true);
assert.equal(context.shouldCreateNspCopy({ fileSetup: 'nsp-store-appearance', nspManual: false, channel: 'CXP' }), false);

console.log('nsp-manual-output.test.js: ok');
