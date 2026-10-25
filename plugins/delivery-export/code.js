// ─────────────────────────────────────────────
// Tundra Bulk Export — code.js
// ─────────────────────────────────────────────

figma.showUI(__html__, { width: 500, height: 700, title: "Tundra Delivery Export - GIF / NVS / Promo" });

var EXPORTABLE_TYPES = ["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "IMAGE-SVG"];

function isExportable(n) {
  return EXPORTABLE_TYPES.includes(n.type);
}

// Designers commonly use a generically named "Frame" as a temporary WIP
// container. It is never a delivery asset, regardless of capitalisation or
// surrounding whitespace.
function isWorkingFrame(node) {
  return !!node && node.type === 'FRAME' && (node.name || '').trim().toLowerCase() === 'frame';
}

// ── Tag convention ────────────────────────────
// Channel:   section named "Nike App" / "Nike Email", or frame tag [Nike App] / [App] / [Nike Email] / [Email]
// [COMP]     — comp frame (goes to Comps/)
// [GIF]      — uploaded animated image (exports original GIF bytes when available)
// [COPY]     — copy layer (text nodes, for .docx)
// [ASSET]    — asset reference layer (for .docx)
// [P1]–[P4]  — panel tags for multi-panel comps
//
// On frames without section ancestry (e.g. comp frames):
//   Tags BEFORE the channel tag → audience folders  e.g. [COMP] [Women's] [App] Push Notification
//   Tags AFTER  the channel tag → subfolders        e.g. [Nike Email] [Hero] DT
//
// On frames inside a channel section (channel comes from section, not tag):
//   Any unknown tag → subfolder                     e.g. [Hero] [GIF] DT (inside Nike Email section)

// ── Shared tag sets ───────────────────────────
var SYSTEM_TAGS   = { 'COMP':1,'GIF':1,'ANIMATED':1,'SLICE':1,'SLICES':1,'COPY':1,'ASSET':1,'P1':1,'P2':1,'P3':1,'P4':1 };
var CHANNEL_TAGS  = { 'APP':1,'EMAIL':1,'NIKE APP':1,'NIKE EMAIL':1,'NIKE':1 };
var SYSTEM_STRIP  = ['COMP','GIF','ANIMATED','SLICE','SLICES','COPY','ASSET','P1','P2','P3','P4'];
var CHANNEL_STRIP = ['APP','EMAIL','NIKE APP','NIKE EMAIL','NIKE'];

function isSystemTag(tag) {
  var up = (tag || '').toUpperCase().trim();
  return !!SYSTEM_TAGS[up] || /^P\d+$/.test(up);
}

function parseTags(name) {
  var tags = [];
  var re = /\[([^\]]+)\]/g;
  var m;
  while ((m = re.exec(name)) !== null) tags.push(m[1].toUpperCase());
  return tags;
}

function getChannelFromTags(tags) {
  if (tags.indexOf('APP') !== -1)        return 'Nike App';
  if (tags.indexOf('NIKE APP') !== -1)   return 'Nike App';
  if (tags.indexOf('EMAIL') !== -1)      return 'Nike Email';
  if (tags.indexOf('NIKE EMAIL') !== -1) return 'Nike Email';
  return null;
}

function getScales(channel, isComp, name, fileSetup) {
  if (fileSetup === 'mid-season-promo') return [channel === 'Paid Media' ? 1 : 2];
  // NSP delivery convention: production stills and Email comps are @2x;
  // CXP review comps and motion remain native @1x.
  if (fileSetup === 'nsp-store-appearance') {
    if (channel === 'Social Motion') return [1];
    if (isComp && channel === 'CXP') return [1];
    return [2];
  }
  if (fileSetup === 'targeted-comms' && channel === 'Nike App') return [1];
  if (isComp) return [2];
  // Email slices default to @2x. The UI lets the user choose a different
  // export scale before starting the export.
  return [2];
}

function parseMidSeasonSourceName(name) {
  var parts = String(name || '').split('/').map(function(part) { return part.trim(); }).filter(Boolean);
  var markerIndex = -1;
  for (var i = 0; i < parts.length; i++) if (/^(Slices|Comp|Comps)$/i.test(parts[i])) { markerIndex = i; break; }
  var channel = parts[1];
  if (!/^(Nike\.com|Nike Email|Nike App|Nike App Shop Home|Paid Media)$/i.test(channel)) return null;
  if (markerIndex < 0 && /^Paid Media$/i.test(channel) && parts.length >= 4 && /\d+\s*x\s*\d+/i.test(parts[parts.length - 1])) {
    return {
      phase: parts[0], channel: 'Paid Media', kind: 'Slices', between: parts.slice(2, -1),
      filename: parts[parts.length - 1], parts: parts, implicitPaidMedia: true
    };
  }
  if (markerIndex < 2 || markerIndex >= parts.length - 1) return null;
  return {
    phase: parts[0],
    channel: channel,
    kind: /^comps?$/i.test(parts[markerIndex]) ? 'Comps' : 'Slices',
    between: parts.slice(2, markerIndex),
    filename: parts.slice(markerIndex + 1).join('_'),
    parts: parts
  };
}

function collectMidSeasonSources(root, wantedKind, selectedPhase) {
  var candidates = [];
  var wantedPhase = normaliseWorkspaceName(selectedPhase || '');
  if (!wantedPhase) return candidates;
  function walk(node) {
    if (!node || isUnavailableForExport(node)) return;
    var parsed = parseMidSeasonSourceName(node.name);
    if (parsed && parsed.kind === wantedKind && isExportable(node)) {
      if (normaliseWorkspaceName(parsed.phase) === wantedPhase) candidates.push({ node: node, parsed: parsed });
      return;
    }
    var containerPhase = String(node.name || '').match(/^\s*(Phase\s+\d+)\s*$/i);
    if (wantedPhase && containerPhase && normaliseWorkspaceName(containerPhase[1]) !== wantedPhase) return;
    if ('children' in node && node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
  }
  walk(root);
  return candidates.filter(function(candidate) {
    var current = candidate.node.parent;
    while (current && current !== root) {
      var ancestor = parseMidSeasonSourceName(current.name);
      if (ancestor && ancestor.kind === wantedKind) return false;
      current = current.parent;
    }
    return true;
  });
}

function hasMidSeasonUtilityBenefits(node) {
  if (!node || node.visible === false) return false;
  var searchable = String(node.name || '');
  if (node.type === 'TEXT') searchable += ' ' + String(node.characters || '');
  if (/Utility\s+Benefits|Shopping\s+With\s+Us\s+Is\s+Easy/i.test(searchable)) return true;
  if ('children' in node && node.children) {
    for (var i = 0; i < node.children.length; i++) {
      if (hasMidSeasonUtilityBenefits(node.children[i])) return true;
    }
  }
  return false;
}

function preferMidSeasonPaidMediaSources(designSources, campaignPaidSources) {
  if (!(campaignPaidSources || []).length) return designSources;
  function sourceKey(source) {
    var parsed = source.parsed || {};
    var phase = normaliseWorkspaceName(parsed.phase || '');
    var platform = normaliseWorkspaceName((parsed.between || [])[0] || '');
    var filename = String(parsed.filename || '').replace(/\.[^.]+$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
    return [phase, platform, filename].join('::');
  }
  var campaignSourceKeys = {};
  campaignPaidSources.forEach(function(source) {
    campaignSourceKeys[sourceKey(source)] = true;
  });
  return (designSources || []).filter(function(source) {
    if (source.parsed.channel !== 'Paid Media') return true;
    return !campaignSourceKeys[sourceKey(source)];
  });
}

function getMidSeasonFolderParts(meta, channel, paidMediaSlice) {
  if (channel === 'Paid Media' && (paidMediaSlice || meta.kind === 'Slices')) {
    var platform = meta.between[0] || null;
    var filename = String(meta.filename || '');
    var placement = null;
    if (/^Meta$/i.test(platform || '')) {
      placement = /1080\s*x\s*1920|Meta\s+Story/i.test(filename) ? 'Meta Story' : 'Meta In-Feed';
    } else if (/^Google PMAX$/i.test(platform || '')) {
      if (!/Always\s*On/i.test(filename)) placement = 'Promo';
      else if (/Version\s*1\b|(?:^|[_\s-])Mens?(?:[_\s.-]|$)/i.test(filename)) placement = "Men's Always On";
      else if (/Version\s*2\b|(?:^|[_\s-])Womens?(?:[_\s.-]|$)/i.test(filename)) placement = "Women's Always On";
    }
    if (!placement) return [meta.phase, channel].concat(meta.between).filter(Boolean);
    return [meta.phase, channel, platform, placement].filter(Boolean);
  }
  if (channel === 'Nike App') {
    return meta.kind === 'Slices'
      ? [meta.phase, channel, 'Slices'].concat(meta.between).filter(Boolean)
      : [meta.phase, channel, 'Comps'];
  }
  if (channel === 'Nike Email' && meta.kind === 'Slices') {
    var emailLeaf = /\[(?:DT|MB)\s+Hero\]/i.test(meta.filename || '') ? 'Hero' : null;
    return [meta.phase, channel, 'Slices', emailLeaf].filter(Boolean);
  }
  if (channel === 'Nike App Shop Home' && meta.kind === 'Slices') {
    return [meta.phase, channel, 'Slices'].concat(meta.between).filter(Boolean);
  }
  return [meta.phase, channel].concat(meta.between).concat([meta.kind]).filter(Boolean);
}

function getMidSeasonScales(channel, isComp, sourceName) {
  if (channel === 'Paid Media') return [1];
  if (isComp) return [2];
  var path = String(sourceName || '');
  if (channel === 'Nike App' || channel === 'Nike.com') return [1];
  if (channel === 'Nike App Shop Home' && /\/\s*IWC\s*\/\s*Slices\s*\//i.test(path)) return [1];
  return [2];
}

function getMidSeasonFrames(campaignPageId, role, options) {
  var campaignPage = figma.root.findChild(function(page) { return page.id === campaignPageId; });
  var page = role === 'slices' ? getDesignSpacePage() : campaignPage;
  if (!page) return [];
  var wantedKind = role === 'slices' ? 'Slices' : 'Comps';
  var selectedPhase = normaliseWorkspaceName(options && options.selectedPhase || '');
  var sources = collectMidSeasonSources(page, wantedKind, selectedPhase);
  var campaignPaidSources = collectMidSeasonSources(campaignPage, 'Slices', selectedPhase).filter(function(source) {
    return source.parsed.channel === 'Paid Media' && source.parsed.implicitPaidMedia;
  });
  if (role === 'slices') sources = preferMidSeasonPaidMediaSources(sources, campaignPaidSources);
  if (role === 'comps') {
    sources = sources.concat(campaignPaidSources.map(function(source) {
      return { node: source.node, parsed: Object.assign({}, source.parsed, { kind: 'Comps' }), paidMediaSlice: true };
    }));
  }
  return sources.map(function(source) {
    var node = source.node;
    var meta = source.parsed;
    var dimensionMatch = meta.filename.match(/(\d+)\s*x\s*(\d+)(?:@\d+x)?(?:\.[^.]+)?$/i);
    var channel = meta.channel.replace(/^nike\.com$/i, 'Nike.com');
    var folderParts = getMidSeasonFolderParts(meta, channel, source.paidMediaSlice);
    var label = meta.filename.replace(/^.*?_(?=\[[^\]]+\]|[^_]+_\d+x\d+)/, '');
    return {
      id: node.id, exportNodeId: node.id, name: node.name, label: label,
      pageId: page.id, pageName: page.name, deliveryName: '', fileSetup: 'mid-season-promo',
      assetType: meta.kind === 'Comps' ? 'Comp' : 'Slices', sourcePath: meta.parts,
      phase: meta.phase, width: dimensionMatch ? Number(dimensionMatch[1]) : Math.round(node.width),
      height: dimensionMatch ? Number(dimensionMatch[2]) : Math.round(node.height),
      channel: channel, deliveryType: meta.between[0] || channel,
      assetLabel: meta.kind === 'Slices' ? label : null, assetGroup: meta.between[meta.between.length - 1] || null,
      isComp: meta.kind === 'Comps', isGif: /\[GIF\]|\.gif$/i.test(meta.filename), forcePng: hasTransparentBackground(node),
      hasMidSeasonUtilityBenefits: meta.kind === 'Comps' && channel === 'Nike Email' && hasMidSeasonUtilityBenefits(node),
      scales: getMidSeasonScales(channel, meta.kind === 'Comps', node.name), audienceParts: [meta.phase], subfolderSection: meta.between.join('/'),
      midSeasonFolderParts: folderParts, midSeasonFilename: meta.filename,
      midSeasonCopyGroup: meta.between.join(' / '), detectGif: meta.kind === 'Slices'
    };
  });
}

function getTargetedFolderChannel(name, channel) {
  if (/thread/i.test(name || '')) return 'Thread';
  return channel === 'Nike Email' ? 'Email' : 'App';
}

function getTargetedDeliveryType(parts, channel) {
  var passedChannel = false;
  for (var i = 0; i < (parts || []).length; i++) {
    var part = (parts[i] || '').trim();
    if (/^thread$/i.test(part)) return 'Thread';
    if (/^(nike app|app)$/i.test(part)) { passedChannel = true; continue; }
    if (!passedChannel || channel === 'Nike Email') continue;
    if (/^(comp|comps|slice|slices|copy)$/i.test(part) || /^\[comp\]/i.test(part)) continue;
    if (part) return part.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return channel === 'Nike Email' ? 'Email' : 'App';
}

// Figma can terminate the plugin VM when a complex comp is rasterised beyond
// a 4096px edge. Keep ordinary exports untouched and cap only oversized
// Targeted Comms comps, which are already presentation-sized frames.
function getSafeExportScale(width, height, requestedScale, isComp, fileSetup) {
  return requestedScale || 1;
}

// Existing presentation comps use names such as "Comp [Light Mode]".
// Convert those human-friendly labels to the delivery convention.
function getCompLabel(name) {
  var raw = (name || '')
    .replace(/^\s*\[comp\]\s*/i, '')
    .replace(/^\s*comp\s*/i, '')
    .replace(/[\[\]]/g, '').trim();
  var lower = raw.toLowerCase();
  if (/comp\s*[-_]\s*light\b/.test(lower)) return 'COMP [LIGHT MODE]';
  if (/comp\s*[-_]\s*dark\b/.test(lower)) return 'COMP [DARK MODE]';
  if (/comp\s*[-_]\s*push\b/.test(lower)) return 'COMP [Push Notification]';
  if (/comp\s*[-_]\s*inbox\b/.test(lower)) return 'COMP [Inbox]';
  if (lower === 'light mode' || lower === 'light') return 'COMP [LIGHT MODE]';
  if (lower === 'dark mode' || lower === 'dark') return 'COMP [DARK MODE]';
  if (lower === 'inbox') return 'COMP [Inbox]';
  if (lower === 'push notification') return 'COMP [Push Notification]';
  return raw ? 'COMP [' + raw + ']' : 'COMP';
}

function getRetentionCompLabel(name) {
  var label = getCompLabel(name);
  var clean = (name || '').replace(/^\s*\[comp\]\s*/i, '').replace(/^\s*comp\s*/i, '').replace(/[\[\]]/g, '').trim();
  if (/^(?:comp\s*[-_]\s*)?spotlight$/i.test(clean)) return 'COMP [Spotlight]';
  return label;
}

function getRetentionChannelFromCompName(name) {
  var label = getRetentionCompLabel(name).toLowerCase();
  if (label.indexOf('spotlight') !== -1) return 'Nike App';
  return getChannelFromCompName(name);
}

// Campaign-page comps are deliberately clean top-level frames. Their label
// identifies the destination when they do not sit inside Nike App/Email
// sections or carry a channel tag.
function getChannelFromCompName(name) {
  var raw = (name || '').toLowerCase();
  if (/nike\s*email|\bemail\b/.test(raw)) return 'Nike Email';
  if (/nike\s*app|\bapp\b/.test(raw)) return 'Nike App';
  if (getTargetedMarket([name])) return 'Nike Email';
  var label = getCompLabel(name).toLowerCase();
  if (label.indexOf('light mode') !== -1 || label.indexOf('dark mode') !== -1) return 'Nike Email';
  if (label.indexOf('push notification') !== -1 || label.indexOf('inbox') !== -1 || label.indexOf('thread') !== -1) return 'Nike App';
  return null;
}

function isCompFrame(name, ancestry) {
  var tags = parseTags(name);
  if (tags.indexOf('COMP') !== -1 || /^comp\b/i.test(name) || /\bcomp\s*[-_]/i.test(name)) return true;
  return (ancestry || []).some(function(part) {
    var n = part.toLowerCase().trim();
    return n === 'comps' || n === 'comp';
  });
}

function hasTransparentBackground(node) {
  if (!('fills' in node)) return false;
  var fills = node.fills || [];
  if (!Array.isArray(fills)) return true;
  if (!fills.length) return true;
  for (var i = 0; i < fills.length; i++) {
    var paint = fills[i];
    if (paint.visible === false || (paint.opacity !== undefined && paint.opacity < 1)) continue;
    if (paint.type === 'SOLID') return false;
    if (paint.type && paint.type.indexOf('GRADIENT') === 0 && paint.gradientStops) {
      var opaque = paint.gradientStops.every(function(stop) {
        return !stop.color || stop.color.a === undefined || stop.color.a >= 1;
      });
      if (opaque) return false;
    }
  }
  return true;
}

function isLockedForExport(node) {
  var current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current.locked === true) return true;
    current = current.parent;
  }
  return false;
}

function isHiddenForExport(node) {
  var current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (current.visible === false) return true;
    current = current.parent;
  }
  return false;
}

function isUnavailableForExport(node) {
  return isLockedForExport(node) || isHiddenForExport(node);
}

// Client Review Thread comps are sometimes presentation wrappers several
// thousand pixels wide, with the real tall mobile layout aligned at the left.
// Export that inner layout so the wrapper's empty canvas is not rasterised.
// Keep the wrapper itself as the result id: it remains the naming/copy source.
function getThreadCompExportTarget(comp) {
  if (!comp || !comp.children) return comp;
  var candidates = [];

  function walk(node) {
    if (!node || isUnavailableForExport(node)) return;
    if (node !== comp && isExportable(node)) {
      var width = Number(node.width) || 0;
      var height = Number(node.height) || 0;
      var isTallMobileLayout = width >= 280 && width <= 800 && height >= 900 && height / width >= 1.5;
      if (isTallMobileLayout) {
        var nameHasThread = /thread/i.test(node.name || '');
        candidates.push({
          node: node,
          score: (nameHasThread ? 1000000 : 0) + height - Math.abs(width - 393) * 4
        });
      }
    }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
    }
  }

  walk(comp);
  candidates.sort(function(a, b) { return b.score - a.score; });
  return candidates.length ? candidates[0].node : comp;
}

function getStandardSliceSubfolder(name) {
  var n = (name || '').toLowerCase();
  if (/swoosh\s+footer/.test(n)) return 'Supporting';
  if (/\b(?:nike\s+run|nike\s+football\s+logo)\b/.test(n)) return 'Supporting';
  if (/\bhero\b/.test(n)) return 'Hero';
  if (/\bsupporting\b/.test(n)) return 'Supporting';
  return null;
}

function isTargetedCarouselGroupName(name) {
  var clean = getCleanTargetedAssetName(name);
  return (/^Carousel(?:\s*\d+|\s+.+)?$/i.test(clean) && !/^Carousel\s*\d*[\s-]+(?:Frame|Default)\b/i.test(clean)) ||
    /^(?:Store|Stores|Shoes\s*[/&-]\s*Apparel)\s+Carousel$/i.test(clean);
}

function getTargetedCarouselFolderName(name) {
  var clean = getCleanTargetedAssetName(name).replace(/\s+/g, ' ').trim();
  if (/^(?:Store|Stores)\s+Carousel$/i.test(clean)) return 'Carousel 2';
  if (/^Shoes\s*[/&-]\s*Apparel\s+Carousel$/i.test(clean)) return 'Carousel 1';
  if (/^Carousel\s+(?:Store|Stores)$/i.test(clean)) return 'Carousel 2';
  if (/^Carousel\s+Shoes\s*[/&-]\s*Apparel$/i.test(clean)) return 'Carousel 1';
  var numbered = clean.match(/^Carousel\s*(\d+)$/i);
  if (numbered) return 'Carousel ' + numbered[1];
  return clean.replace(/^carousel/i, 'Carousel');
}

function getTargetedCarouselGroup(name, ancestry) {
  var values = (ancestry || []).slice().reverse();
  values.push(getCleanTargetedAssetName(name));
  for (var i = 0; i < values.length; i++) {
    var clean = getCleanTargetedAssetName(values[i]);
    if (isTargetedCarouselGroupName(clean)) return getTargetedCarouselFolderName(clean);
  }
  var direct = getCleanTargetedAssetName(name).match(/^Carousel\s*(\d*)[\s-]+(?:Frame(?:\s*\d+)?\b|Default\b)/i);
  if (direct) return direct[1] ? 'Carousel ' + direct[1] : 'Carousel';
  return null;
}

function assignFlatTargetedCarouselGroups(frames) {
  var buckets = {};
  (frames || []).forEach(function(frame) {
    if (!frame.isCarousel || frame.assetGroup !== 'Carousel') return;
    var hasNamedContainer = (frame.sourcePath || []).slice(0, -1).some(isTargetedCarouselGroupName);
    if (hasNamedContainer) return;
    var key = [frame.phase || '', frame.channel || '', frame.deliveryType || '', frame.assetPanel || '', frame.market || ''].join('::');
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(frame);
  });
  Object.keys(buckets).forEach(function(key) {
    var positioned = buckets[key].map(function(frame, sourceOrder) {
      return { frame: frame, sourceOrder: sourceOrder };
    }).filter(function(item) {
      return Number.isFinite(item.frame.absoluteY) && Number.isFinite(item.frame.absoluteX);
    }).sort(function(a, b) {
      return a.frame.absoluteY - b.frame.absoluteY || a.frame.absoluteX - b.frame.absoluteX || a.sourceOrder - b.sourceOrder;
    });
    var rows = [];
    positioned.forEach(function(item) {
      var row = rows[rows.length - 1];
      if (!row || Math.abs(item.frame.absoluteY - row.y) > 8) {
        row = { y: item.frame.absoluteY, items: [] };
        rows.push(row);
      }
      row.items.push(item);
    });
    var ordered = [];
    rows.forEach(function(row) {
      row.items.sort(function(a, b) {
        return a.frame.absoluteX - b.frame.absoluteX || a.sourceOrder - b.sourceOrder;
      });
      ordered = ordered.concat(row.items.map(function(item) { return item.frame; }));
    });
    var unpositioned = buckets[key].filter(function(frame) {
      return !Number.isFinite(frame.absoluteY) || !Number.isFinite(frame.absoluteX);
    });
    ordered = ordered.concat(unpositioned);

    var ordinals = ordered.map(function(frame) {
      var sourceName = frame.assetLabel || frame.label || frame.name ||
        ((frame.sourcePath || [])[frame.sourcePath.length - 1]) || '';
      var clean = getCleanTargetedAssetName(sourceName);
      var match = clean.match(/(?:^|[\s_-])frame[\s_-]*(\d+)(?:\b|$)/i);
      return match ? parseInt(match[1], 10) : null;
    });
    var starts = ordinals.filter(function(ordinal) { return ordinal === 1; }).length;
    if (starts < 2 || ordinals[0] !== 1 || ordinals.some(function(ordinal) { return ordinal === null; })) return;

    var segments = [];
    for (var ordinalIndex = 0; ordinalIndex < ordinals.length; ordinalIndex++) {
      if (ordinals[ordinalIndex] === 1) segments.push([]);
      segments[segments.length - 1].push(ordinals[ordinalIndex]);
    }
    var validSegments = segments.every(function(segment) {
      return segment.every(function(ordinal, index) { return ordinal === index + 1; });
    });
    if (!validSegments) return;

    var carouselIndex = 0;
    for (var orderedIndex = 0; orderedIndex < ordered.length; orderedIndex++) {
      if (ordinals[orderedIndex] === 1) carouselIndex++;
      ordered[orderedIndex].assetGroup = 'Carousel ' + carouselIndex;
      ordered[orderedIndex].subfolderSection = ordered[orderedIndex].assetGroup;
    }
  });
  return frames;
}

// Design Space can temporarily contain multiple Carousel-Default component
// options while the client chooses final artwork. Keep both exportable without
// allowing identical labels to overwrite each other in the ZIP. Once only one
// option remains, its original unsuffixed delivery name is preserved.
function disambiguateTargetedDuplicateSliceLabels(frames) {
  var buckets = {};
  (frames || []).forEach(function(frame) {
    if (!frame.isCarousel) return;
    var label = String(frame.assetLabel || frame.label || '').trim();
    if (!label) return;
    var key = [frame.phase || '', frame.channel || '', frame.deliveryType || '', frame.assetGroup || '', frame.market || '', label.toLowerCase()].join('::');
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(frame);
  });
  Object.keys(buckets).forEach(function(key) {
    var duplicates = buckets[key];
    if (duplicates.length < 2) return;
    duplicates.sort(function(a, b) {
      return (a.absoluteY || 0) - (b.absoluteY || 0) || (a.absoluteX || 0) - (b.absoluteX || 0);
    });
    for (var duplicateIndex = 0; duplicateIndex < duplicates.length; duplicateIndex++) {
      var original = String(duplicates[duplicateIndex].assetLabel || duplicates[duplicateIndex].label || '').trim();
      duplicates[duplicateIndex].label = original + '_' + (duplicateIndex + 1);
      duplicates[duplicateIndex].assetLabel = duplicates[duplicateIndex].label;
    }
  });
  return frames;
}

function getRetentionSliceSubfolder(name) {
  var n = (name || '').toLowerCase();
  if (n.indexOf('header') !== -1) return 'Header';
  if (n.indexOf('hero') !== -1) return 'Hero';
  // Swoosh Footer is supporting creative, not the standalone Email footer.
  // Its optional [P#] tag controls copy placement only.
  if (/swoosh\s+footer/.test(n)) return 'Supporting';
  if (n.indexOf('[carousel]') !== -1 || n.indexOf('supporting') !== -1) return 'Supporting';
  if (n.indexOf('footer') !== -1) return 'Footer';
  if (n.indexOf('inbox') !== -1) return 'Inbox';
  return null;
}

// Panel tags remain supported as an optional placement hint, but ordinary
// Design Space slices no longer need them to appear in the copy document.
// Hero keeps its established P1 placement when no explicit panel is supplied.
function getAutomaticAssetPanel(name) {
  var explicit = getCopyPanel(name);
  if (explicit) return explicit;
  return /\bhero\b/i.test(name || '') ? 'P1' : null;
}

// Page names are the delivery source of truth, e.g. "Week 9 | Kids Monthly".
// Keeping this on every scanned frame lets one ZIP safely contain multiple weeks.
function getDeliveryName(pageName) {
  return (pageName || '').replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function normaliseWorkspaceName(name) {
  return (name || '').replace(/^🎨\s*/, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// A SEND marker names one complete delivery block without requiring every
// comp to be renamed or wrapped in a Figma Section. Slashes are meaningful in
// the canvas label but cannot be used in a single ZIP folder name.
function getSendMarkerName(node) {
  var match = (node && node.name || '').match(/^\s*\[send\]\s*(.+?)\s*$/i);
  if (!match) return null;
  return match[1].replace(/[\/\\]+/g, ' - ').replace(/[:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function getNodeAbsoluteY(node) {
  if (!node) return 0;
  if (node.absoluteTransform && node.absoluteTransform[1]) return Number(node.absoluteTransform[1][2]) || 0;
  var y = 0;
  var current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    y += Number(current.y) || 0;
    current = current.parent;
  }
  return y;
}

function collectSendMarkers(node, markers) {
  markers = markers || [];
  if (!node || isUnavailableForExport(node) || isArchiveContainer(node)) return markers;
  var markerName = getSendMarkerName(node);
  if (markerName) {
    markers.push({ node: node, phase: markerName, x: getNodeAbsoluteX(node), y: getNodeAbsoluteY(node) });
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) collectSendMarkers(node.children[i], markers);
  }
  return markers;
}

function getTopLevelPageBranch(node, page) {
  var current = node;
  while (current && current.parent && current.parent !== page && current.parent.type !== 'DOCUMENT') current = current.parent;
  return current || node;
}

function getPageSendMarkers(page) {
  return collectSendMarkers(page, []).map(function(marker) {
    var branch = getTopLevelPageBranch(marker.node, page);
    return { node: marker.node, branch: branch, phase: marker.phase, x: getNodeAbsoluteX(branch), y: getNodeAbsoluteY(branch) };
  });
}

function getSendMarkerLayout(markers) {
  if (!markers || !markers.length) return { axis: null, error: null, ordered: [] };
  var minX = markers[0].x, maxX = markers[0].x, minY = markers[0].y, maxY = markers[0].y;
  for (var i = 1; i < markers.length; i++) {
    minX = Math.min(minX, markers[i].x); maxX = Math.max(maxX, markers[i].x);
    minY = Math.min(minY, markers[i].y); maxY = Math.max(maxY, markers[i].y);
  }
  var axis = (maxY - minY) > (maxX - minX) ? 'vertical' : 'horizontal';
  var primarySpread = axis === 'vertical' ? maxY - minY : maxX - minX;
  var crossSpread = axis === 'vertical' ? maxX - minX : maxY - minY;
  if (markers.length > 1 && crossSpread > Math.max(8, primarySpread * 0.05)) {
    return { axis: axis, error: 'Ambiguous [SEND] marker layout. Align markers in one horizontal or vertical sequence.', ordered: [] };
  }
  var ordered = markers.slice().sort(function(a, b) { return axis === 'vertical' ? a.y - b.y : a.x - b.x; });
  var positions = {};
  for (var markerIndex = 0; markerIndex < ordered.length; markerIndex++) {
    var positionKey = String(Math.round(axis === 'vertical' ? ordered[markerIndex].y : ordered[markerIndex].x));
    if (positions[positionKey]) return { axis: axis, error: 'Ambiguous [SEND] marker order. Separate markers along one horizontal or vertical direction.', ordered: [] };
    positions[positionKey] = true;
  }
  return { axis: axis, error: null, ordered: ordered };
}

function getMarkerSendAssignmentFromMarkers(node, page, sendNames, pageMarkers) {
  var markers = (pageMarkers || []).filter(function(marker) {
    return isKnownSendPhase(marker.phase, sendNames || []);
  });
  if (!markers.length) return { phase: null, axis: null };

  var layout = getSendMarkerLayout(markers);
  if (layout.error) return { phase: null, axis: layout.axis, error: layout.error };
  var axis = layout.axis;
  var nodeBranch = getTopLevelPageBranch(node, page);
  var position = axis === 'vertical' ? getNodeAbsoluteY(nodeBranch) : getNodeAbsoluteX(nodeBranch);
  markers = layout.ordered;

  var selected = null;
  for (var markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    var markerPosition = axis === 'vertical' ? markers[markerIndex].y : markers[markerIndex].x;
    if (markerPosition <= position) selected = markers[markerIndex];
    else break;
  }
  return { phase: selected ? selected.phase : null, axis: axis };
}

function getMarkerSendAssignment(node, page, sendNames) {
  return getMarkerSendAssignmentFromMarkers(node, page, sendNames, getPageSendMarkers(page));
}

function validateDesignSpaceSendMarkers(page) {
  var markers = getPageSendMarkers(page);
  var seen = {};
  for (var i = 0; i < markers.length; i++) {
    var key = normaliseWorkspaceName(markers[i].phase);
    if (seen[key]) return 'Duplicate [SEND] name “' + markers[i].phase + '” in Design Space. Send names must be unique.';
    seen[key] = true;
  }
  return getSendMarkerLayout(markers).error;
}

function validateSendMarkers(page, sendNames, requireMarkers) {
  var markers = getPageSendMarkers(page);
  if (!markers.length) return requireMarkers ? 'Client Review is missing [SEND] markers required by Design Space.' : null;
  var seenNames = {};
  for (var i = 0; i < markers.length; i++) {
    if (!isKnownSendPhase(markers[i].phase, sendNames || [])) {
      return '[SEND] “' + markers[i].phase + '” does not match Design Space.';
    }
    var markerNameKey = normaliseWorkspaceName(markers[i].phase);
    if (seenNames[markerNameKey]) return 'Duplicate [SEND] name “' + markers[i].phase + '” in Client Review.';
    seenNames[markerNameKey] = true;
  }
  for (var sendIndex = 0; sendIndex < (sendNames || []).length; sendIndex++) {
    if (!seenNames[normaliseWorkspaceName(sendNames[sendIndex])]) {
      return 'Client Review is missing [SEND] “' + sendNames[sendIndex] + '”.';
    }
  }
  return getSendMarkerLayout(markers).error;
}

// Design Space is a dedicated Figma page. The selected campaign page holds
// final Comps and [COPY] layers, while its same-named section on this page
// holds the delivery Slices.
function getDesignSpacePage() {
  for (var i = 0; i < figma.root.children.length; i++) {
    var page = figma.root.children[i];
    if (normaliseWorkspaceName(page.name).indexOf('design space') !== -1) return page;
  }
  return null;
}

function findMatchingWeekSection(page, campaignPageName) {
  return resolveRetentionWeekSection(page, campaignPageName).section;
}

// Retention themes and their Design Space sections occasionally contain the
// same words in a different presentation order, for example:
//   "Women's Running New Arrivals"
//   "Women's New Arrivals (Running)"
// Prefer the established exact match, then compare a week number plus the
// complete unordered topic token set. Never guess when that key is ambiguous.
function getRetentionWeekKey(name) {
  var words = (name || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  var weekIndex = words.indexOf('week');
  if (weekIndex === -1 || !/^\d+$/.test(words[weekIndex + 1] || '')) return null;
  var weekNumber = words[weekIndex + 1];
  var topic = words.filter(function(word, index) {
    return index !== weekIndex && index !== weekIndex + 1;
  }).sort();
  if (!topic.length) return null;
  return 'week:' + weekNumber + '|topic:' + topic.join('|');
}

function resolveRetentionWeekSection(page, campaignPageName) {
  if (!page || !page.children) return { section: null, error: null };
  var wanted = normaliseWorkspaceName(campaignPageName);
  var exactMatches = [];
  for (var i = 0; i < page.children.length; i++) {
    var child = page.children[i];
    if (child.type === 'SECTION' && normaliseWorkspaceName(child.name) === wanted) exactMatches.push(child);
  }
  if (exactMatches.length === 1) return { section: exactMatches[0], error: null };
  if (exactMatches.length > 1) {
    return { section: null, error: 'Multiple Design Space sections exactly match the selected Retention theme. Rename the duplicate sections before scanning.' };
  }

  var wantedKey = getRetentionWeekKey(campaignPageName);
  if (!wantedKey) return { section: null, error: null };
  var semanticMatches = [];
  for (var semanticIndex = 0; semanticIndex < page.children.length; semanticIndex++) {
    var semanticChild = page.children[semanticIndex];
    if (semanticChild.type === 'SECTION' && getRetentionWeekKey(semanticChild.name) === wantedKey) semanticMatches.push(semanticChild);
  }
  if (semanticMatches.length === 1) return { section: semanticMatches[0], error: null };
  if (semanticMatches.length > 1) {
    return { section: null, error: 'Multiple Design Space sections match the selected Retention theme after normalising word order. Rename them so the match is unique.' };
  }
  return { section: null, error: null };
}

// Walk the tree collecting frames with their full section ancestry.
// containerIds = section IDs to skip from ancestry (treated as transparent).
function collectFramesWithAncestry(node, ancestry, frames, containerIds) {
  if (!node.children || isUnavailableForExport(node)) return;
  containerIds = containerIds || {};
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child)) continue;
    if (isExportable(child)) {
      frames.push({ node: child, ancestry: ancestry.slice() });
    } else {
      var isSection   = child.type === 'SECTION';
      var isContainer = isSection && containerIds[child.id];
      var newAncestry = (isSection && !isContainer) ? ancestry.concat(child.name) : ancestry;
      collectFramesWithAncestry(child, newAncestry, frames, containerIds);
    }
  }
}

// Slice assets often live inside a presentation comp rather than directly in
// a Slices section. Recognise the established Nike asset names (or [SLICE])
// while leaving ordinary layout frames out of the export list.
function isNestedSliceTarget(name) {
  var n = (name || '').toLowerCase().trim();
  return /\[(?:slice|asset)\]|\[gif\]|\[animated\]/.test(n) ||
    /\bhero\b/.test(n) ||
    /\b(?:logo|lockup|wordmark)\b|\bbrand\s+mark\b/.test(n) ||
    /^supporting\s+\d+\b/.test(n) ||
    /^swoosh footer\b/.test(n) ||
    /^\[asset\]\s*inbox\b/.test(n) ||
    /^inbox\b/.test(n);
}

function isTargetedSliceTarget(name) {
  var raw = name || '';
  var clean = raw.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\[(?:slice|asset|gif|animated)\]/i.test(raw) ||
    /\bhero\b/i.test(clean) ||
    /\b(?:logo|lockup|wordmark)\b|\bbrand\s+mark\b/i.test(clean) ||
    /^store[\s-]+carousel\b/i.test(clean) ||
    /^carousel\s*\d*(?:[\s-]+(?:frame|default))?\b/i.test(clean) ||
    /^supporting\s+\d+\b/i.test(clean) ||
    /^swoosh footer\b/i.test(clean) ||
    /^inbox\b/i.test(clean);
}

function hasTargetedSliceDescendant(node) {
  if (!node || !node.children) return false;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isTargetedSliceTarget(child.name) || hasTargetedSliceDescendant(child)) return true;
  }
  return false;
}

function getCleanTargetedAssetName(name) {
  return (name || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isExplicitTargetedAsset(name) {
  return /\[(?:asset|slice)\]/i.test(name || '');
}

function isResponsiveHeroName(name) {
  return /^(?:dt|mb)$/i.test(getCleanTargetedAssetName(name));
}

function hasNamedAncestor(node, name) {
  var current = node && node.parent;
  while (current) {
    if (getCleanTargetedAssetName(current.name).toLowerCase() === name.toLowerCase()) return true;
    current = current.parent;
  }
  return false;
}

function isNodeDescendantOf(node, ancestor) {
  var current = node && node.parent;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function isGenericTargetedAssetWrapper(name) {
  return /(?:^|\s)(?:wrapper|group|container)$/i.test(getCleanTargetedAssetName(name));
}

// Targeted Comms assets are frequently represented by a hierarchy rather than
// one fully descriptive frame name. Resolve that hierarchy once, before the
// shared metadata builder, and retain exactly one export boundary per asset.
function resolveTargetedSliceCandidates(raw) {
  var candidates = [];
  for (var i = 0; i < raw.length; i++) {
    var item = raw[i];
    var ownName = getCleanTargetedAssetName(item.node.name);
    var explicit = isExplicitTargetedAsset(item.node.name);
    var inheritedHero = isResponsiveHeroName(ownName) && hasNamedAncestor(item.node, 'Hero');
    var carouselGroup = getTargetedCarouselGroup(item.node.name, item.ancestry);
    if (!explicit && !isTargetedSliceTarget(item.node.name) && !inheritedHero) continue;
    item.resolvedAssetName = inheritedHero ? ownName.toUpperCase() + ' Hero' : null;
    item.resolvedAssetGroup = inheritedHero ? 'Hero' : carouselGroup;
    item.explicitTargetedAsset = explicit;
    candidates.push(item);
  }

  return candidates.filter(function(item) {
    var node = item.node;
    var cleanName = getCleanTargetedAssetName(node.name);
    var explicitDescendant = candidates.some(function(other) {
      return other !== item && other.explicitTargetedAsset && isNodeDescendantOf(other.node, node);
    });
    if (explicitDescendant) return false;

    // A plain Hero group containing responsive DT/MB assets supplies their
    // classification; it is not itself another deliverable.
    if (/^hero$/i.test(cleanName) && candidates.some(function(other) {
      return other !== item && other.resolvedAssetGroup === 'Hero' && isNodeDescendantOf(other.node, node);
    })) return false;
    if (isGenericTargetedAssetWrapper(cleanName) && candidates.some(function(other) {
      return other !== item && isNodeDescendantOf(other.node, node);
    })) return false;

    // Once a final asset boundary is found, its layout/image descendants are
    // implementation detail. Explicit descendants were handled above and win.
    var current = node.parent;
    while (current) {
      var ancestor = candidates.find(function(candidate) { return candidate.node === current; });
      var ancestorIsStructuralHero = ancestor && /^hero$/i.test(getCleanTargetedAssetName(ancestor.node.name)) &&
        candidates.some(function(other) {
          return other !== ancestor && other.resolvedAssetGroup === 'Hero' && isNodeDescendantOf(other.node, ancestor.node);
        });
      var ancestorIsGenericWrapper = ancestor && isGenericTargetedAssetWrapper(ancestor.node.name) &&
        candidates.some(function(other) { return other !== ancestor && isNodeDescendantOf(other.node, ancestor.node); });
      if (ancestor && !ancestorIsStructuralHero && !ancestorIsGenericWrapper && !item.explicitTargetedAsset) return false;
      current = current.parent;
    }
    return true;
  });
}

function collectNestedSliceTargets(node, ancestry, frames) {
  if (!node.children || isUnavailableForExport(node)) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child)) continue;
    var nextAncestry = child.type === 'SECTION' ? ancestry.concat(child.name) : ancestry;
    if (isExportable(child) && isNestedSliceTarget(child.name)) {
      frames.push({ node: child, ancestry: ancestry.slice() });
    }
    // Continue walking exportable parents: the asset may be nested in a comp.
    if (child.children) collectNestedSliceTargets(child, nextAncestry, frames);
  }
}

function isRetentionSliceTarget(name) {
  var n = (name || '').toLowerCase().trim();
  return /\[slice\]|\[gif\]|\[animated\]|\[carousel\]/.test(n) ||
    n.indexOf('hero') !== -1 || n.indexOf('header') !== -1 ||
    n.indexOf('supporting') !== -1 || n.indexOf('footer') !== -1 ||
    n.indexOf('inbox') !== -1;
}

function isRetentionWorkingFrame(node) {
  var name = node && node.name ? node.name : '';
  return /frame/i.test(name) && !/\[carousel\]/i.test(name);
}

function collectRetentionDesignSpaceSlices(node, ancestry, frames) {
  if (!node || !node.children) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isRetentionWorkingFrame(child) || isUnavailableForExport(child)) continue;
    var nextAncestry = child.type === 'SECTION' ? ancestry.concat(child.name) : ancestry;
    if (isExportable(child) && isRetentionSliceTarget(child.name)) {
      frames.push({ node: child, ancestry: ancestry.slice() });
      continue;
    }
    if (child.children) collectRetentionDesignSpaceSlices(child, nextAncestry, frames);
  }
}

var SHOPPING_TOUT_ASSET_WORDS = ['buy now pay later', 'shipping perks', '30 day returns', 'get help', 'express shipping', 'shipping cut off dates'];
var SHOPPING_TOUT_ALIASES = {
  'buy now pay later': ['buy now pay later'],
  'shipping perks': ['shipping perks', 'member shipping perks'],
  '30 day returns': ['30 day returns'],
  'get help': ['get help'],
  'express shipping': ['express shipping'],
  'shipping cut off dates': ['shipping cut off dates']
};

function normaliseToutText(value) {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function addShoppingToutMatches(value, references) {
  var normalised = normaliseToutText(value);
  if (!normalised) return;
  for (var i = 0; i < SHOPPING_TOUT_ASSET_WORDS.length; i++) {
    var key = SHOPPING_TOUT_ASSET_WORDS[i];
    var aliases = SHOPPING_TOUT_ALIASES[key] || [key];
    for (var j = 0; j < aliases.length; j++) {
      if (normalised.indexOf(normaliseToutText(aliases[j])) !== -1) {
        references[key] = true;
        break;
      }
    }
  }
}

function isShoppingToutAsset(name) {
  var normalised = normaliseToutText(name);
  return SHOPPING_TOUT_ASSET_WORDS.some(function(word) { return normalised.indexOf(normaliseToutText(word)) !== -1; });
}

function getShoppingToutReferences(node) {
  var references = {};
  function isInsideNikeEmail(child) {
    var current = child;
    while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
      if (getChannelFromCompName(current.name) === 'Nike Email') return true;
      if (/nike\s*app|\bapp\b/i.test(current.name || '')) return false;
      if (/nike\s*email|\bemail\b/i.test(current.name || '')) return true;
      current = current.parent;
    }
    return false;
  }
  function walk(child, insideShoppingTout) {
    if (!child || isUnavailableForExport(child)) return;
    var inTout = insideShoppingTout || /shopping\s+with\s+us\s+is\s+easy/i.test(child.name || '');
    var isTaggedCopyFallback = child.type === 'TEXT' && isRetentionCopyLayer(child.name);

    // The visible Shopping With Us is Easy component is the primary source
    // of truth. Tagged copy remains supported for older campaign pages.
    if (isInsideNikeEmail(child) && (inTout || isTaggedCopyFallback)) {
      addShoppingToutMatches((child.name || '') + ' ' + (child.characters || ''), references);
      if (child.componentProperties) {
        Object.keys(child.componentProperties).forEach(function(key) {
          var property = child.componentProperties[key];
          addShoppingToutMatches(key + ' ' + (property && property.value !== undefined ? property.value : ''), references);
        });
      }
    }
    if (child.children) for (var j = 0; j < child.children.length; j++) walk(child.children[j], inTout);
  }
  walk(node, false);
  return references;
}

function findSectionByName(node, wantedName) {
  if (!node || !node.children || isUnavailableForExport(node)) return null;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child)) continue;
    if (child.type === 'SECTION' && normaliseWorkspaceName(child.name) === normaliseWorkspaceName(wantedName)) return child;
    var found = findSectionByName(child, wantedName);
    if (found) return found;
  }
  return null;
}

// The shared Shopping With Us is Easy Tout sits outside each Week section.
// Export only utility icons explicitly mentioned in tagged campaign copy.
function collectShoppingToutAssets(node, frames, references) {
  if (!node || !node.children || isUnavailableForExport(node)) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child)) continue;
    var childName = (child.name || '').toLowerCase();
    var isReferenced = SHOPPING_TOUT_ASSET_WORDS.some(function(word) {
      return references[word] && childName.indexOf(word) !== -1;
    });
    if (isShoppingToutAsset(child.name) && isReferenced) {
      frames.push({ node: child, ancestry: ['Nike Email'], shoppingTout: true });
      continue;
    }
    if (child.children) collectShoppingToutAssets(child, frames, references);
  }
}

// ── Section ancestry helpers ──────────────────
var CHANNEL_SECTION_WORDS = ['app', 'email'];
function isChannelSection(name) {
  var n = name.toLowerCase();
  for (var j = 0; j < CHANNEL_SECTION_WORDS.length; j++) {
    if (n.indexOf(CHANNEL_SECTION_WORDS[j]) !== -1) return true;
  }
  return false;
}

// Nearest section containing "app" or "email" → channel
function getChannelFromSections(ancestry) {
  for (var i = ancestry.length - 1; i >= 0; i--) {
    var n = ancestry[i].toLowerCase();
    if (n.indexOf('email') !== -1) return 'Nike Email';
    if (n.indexOf('app') !== -1)   return 'Nike App';
  }
  return null;
}

// Sections before the channel section → audience (e.g. ["Women's", "Tease"])
function getAudienceFromSections(ancestry) {
  var parts = [];
  for (var i = 0; i < ancestry.length; i++) {
    if (isChannelSection(ancestry[i])) break;
    // Design Space is an organisational label, never an audience folder.
    if (ancestry[i].replace(/^🎨\s*/, '').toLowerCase().trim() !== 'design space') parts.push(ancestry[i]);
  }
  return parts.length ? parts : null;
}

// Sections after the channel section → subfolder (e.g. "Hero/Supporting")
function getSubfolderFromSections(ancestry) {
  var channelIdx = -1;
  for (var i = 0; i < ancestry.length; i++) {
    if (isChannelSection(ancestry[i])) { channelIdx = i; break; }
  }
  if (channelIdx === -1) return null;
  // Design Space is a delivery workspace, while Comps/Slices define the
  // asset type. Neither belongs in the downloaded folder path.
  var parts = ancestry.slice(channelIdx + 1).filter(function(part) {
    var n = part.toLowerCase().trim();
    return n !== 'comps' && n !== 'comp' && n !== 'slices' && n !== 'slice' &&
      n !== 'design space' && n !== 'copy source' && n !== 'copy';
  });
  return parts.length ? parts.join('/') : null;
}

// Extract audience or subfolder tags from frame name.
// mode 'before': tags before the channel tag → audience
// mode 'after':  tags after the channel tag → subfolder
//                if channelFromSection=true, all unknown tags qualify (no channel tag to split on)
function extractTagParts(frameName, mode, channelFromSection, excludeList) {
  var parts = [];
  var re = /\[([^\]]+)\]/g;
  var m;
  var passedChannel = (mode === 'after' && channelFromSection);
  while ((m = re.exec(frameName)) !== null) {
    var up  = m[1].toUpperCase().trim();
    var raw = m[1].trim();
    if (isSystemTag(up) || CHANNEL_TAGS[up]) {
      if (mode === 'after' && !channelFromSection && CHANNEL_TAGS[up]) passedChannel = true;
      continue;
    }
    if (mode === 'before') {
      if (CHANNEL_TAGS[up]) break; // reached channel tag
      parts.push(raw);
    } else {
      if (!passedChannel) continue;
      var lo = raw.toLowerCase();
      var excluded = excludeList && excludeList.some(function(e) { return e.toLowerCase() === lo; });
      if (!excluded) parts.push(raw);
    }
  }
  return parts;
}

// ── Frame scanning ────────────────────────────
function isTargetedStructureContainer(node) {
  var rawName = (node && node.name || '').trim();
  var name = rawName.toLowerCase();
  return /^(nike app|nike email|app|email|thread|comp|comps|slice|slices)$/.test(name) || isTargetedCarouselGroupName(rawName) || /^[A-Z]{2,3}$/.test(rawName) ||
    /(?:^|[|/])\s*(?:nike\s+)?(?:app|email)\s*(?:[|/]|$)/i.test(rawName);
}

function isReservedTargetedPart(name) {
  var rawName = (name || '').trim();
  return /^(nike app|nike email|app|email|thread|comp|comps|slice|slices|copy)$/i.test(rawName) || /^[A-Z]{2,3}$/.test(rawName) ||
    /client\s+review|design\s+space/i.test(name || '');
}

function isArchiveContainer(node) {
  return !!node && /(?:^|[^a-z])archive(?:$|[^a-z])/i.test((node.name || '').trim());
}

function getTargetedPhase(parts) {
  for (var i = 0; i < (parts || []).length; i++) {
    var part = (parts[i] || '').trim();
    if (part && !isReservedTargetedPart(part) && !/^\[comp\]/i.test(part)) return part;
  }
  return null;
}

function pageHasTargetedComps(page) {
  var found = false;
  function walk(node) {
    if (!node || found) return;
    if (node !== page && /^\s*\[comp\]/i.test(node.name || '')) { found = true; return; }
    if (node.children) for (var i = 0; i < node.children.length; i++) walk(node.children[i]);
  }
  walk(page);
  return found;
}

function getSendNamesFromDesignSpace(designSpace) {
  var names = [];
  var seen = {};
  var explicitMarkers = getPageSendMarkers(designSpace);
  if (explicitMarkers.length) {
    var markerLayout = getSendMarkerLayout(explicitMarkers);
    if (!markerLayout.error) explicitMarkers = markerLayout.ordered;
    for (var markerIndex = 0; markerIndex < explicitMarkers.length; markerIndex++) {
      var markerKey = normaliseWorkspaceName(explicitMarkers[markerIndex].phase);
      if (markerKey && !seen[markerKey]) {
        seen[markerKey] = true;
        names.push(explicitMarkers[markerIndex].phase);
      }
    }
    return names;
  }

  function containsChannel(node) {
    if (!node || !node.children || isArchiveContainer(node)) return false;
    for (var i = 0; i < node.children.length; i++) {
      var childName = (node.children[i].name || '').trim();
      if (/^(nike app|nike email|app|email|thread)$/i.test(childName)) return true;
      if (containsChannel(node.children[i])) return true;
    }
    return false;
  }
  function walk(node) {
    if (!node || !node.children || isArchiveContainer(node)) return;
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (isArchiveContainer(child)) continue;
      var nestedSendContainers = child.children ? child.children.filter(function(grandchild) {
        return !isReservedTargetedPart(grandchild.name) && !isArchiveContainer(grandchild) && containsChannel(grandchild);
      }) : [];
      if (nestedSendContainers.length) {
        for (var nestedIndex = 0; nestedIndex < nestedSendContainers.length; nestedIndex++) walk({ children: [nestedSendContainers[nestedIndex]] });
      } else if (containsChannel(child) && !isReservedTargetedPart(child.name)) {
        var key = normaliseWorkspaceName(child.name);
        if (key && !seen[key]) { seen[key] = true; names.push(child.name.trim()); }
      } else {
        walk(child);
      }
    }
  }
  walk(designSpace);
  return names;
}

function getDesignSpaceSendNames() {
  return getSendNamesFromDesignSpace(getDesignSpacePage());
}

function getTargetedStreamPages(reviewPage) {
  var sendNames = getDesignSpaceSendNames();
  var allowed = {};
  for (var i = 0; i < sendNames.length; i++) allowed[normaliseWorkspaceName(sendNames[i])] = true;
  return figma.root.children.filter(function(page) {
    return page !== reviewPage && !isArchiveContainer(page) && !/client\s+review|design\s+space/i.test(page.name || '') &&
      allowed[normaliseWorkspaceName(page.name)] && pageHasTargetedComps(page);
  });
}

function getTargetedStreamPageCandidates(reviewPage, sendNames) {
  var allowed = {};
  for (var i = 0; i < (sendNames || []).length; i++) allowed[normaliseWorkspaceName(sendNames[i])] = true;
  return figma.root.children.filter(function(page) {
    return page !== reviewPage && !isArchiveContainer(page) && !/client\s+review|design\s+space/i.test(page.name || '') &&
      allowed[normaliseWorkspaceName(page.name)];
  });
}

// If a Design Space send container is mislabelled, recover its phase from
// descendant names using the actual send-page names found in the document.
function getTargetedContainerPhase(node) {
  if (!node || !node.children) return null;
  var streamPages = getTargetedStreamPages(null);
  var counts = {};
  for (var pageIndex = 0; pageIndex < streamPages.length; pageIndex++) counts[streamPages[pageIndex].name] = 0;
  function countPhaseNames(current) {
    if (current !== node) {
      var haystack = ' ' + (current.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
      for (var phaseName in counts) {
        var needle = ' ' + phaseName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
        if (needle.trim() && haystack.indexOf(needle) !== -1) counts[phaseName]++;
      }
    }
    if (current.children) {
      for (var i = 0; i < current.children.length; i++) countPhaseNames(current.children[i]);
    }
  }
  countPhaseNames(node);
  var best = null;
  for (var phase in counts) {
    if (counts[phase] > 0 && (!best || counts[phase] > best.count)) best = { name: phase, count: counts[phase] };
  }
  return best ? best.name : null;
}

function getNodeAbsoluteX(node) {
  if (!node) return 0;
  if (node.absoluteTransform && node.absoluteTransform[0]) return Number(node.absoluteTransform[0][2]) || 0;
  var x = 0;
  var current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    x += Number(current.x) || 0;
    current = current.parent;
  }
  return x;
}

function getPhaseFromAncestors(comp, reviewPage, sendNames) {
  var current = comp ? comp.parent : null;
  while (current && current !== reviewPage && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    var currentName = normaliseWorkspaceName(current.name);
    for (var i = 0; i < (sendNames || []).length; i++) {
      var sendName = normaliseWorkspaceName(sendNames[i]);
      if (currentName === sendName || (' ' + currentName + ' ').indexOf(' ' + sendName + ' ') !== -1) return sendNames[i];
    }
    current = current.parent;
  }
  return null;
}

function isKnownSendPhase(phase, sendNames) {
  if (!phase) return false;
  var wanted = normaliseWorkspaceName(phase);
  for (var i = 0; i < (sendNames || []).length; i++) {
    if (normaliseWorkspaceName(sendNames[i]) === wanted) return true;
  }
  return false;
}

function getClientReviewCompPhase(comp, reviewPage, sendNames) {
  if (!comp || !reviewPage || !reviewPage.children) return null;
  var ancestorPhase = getPhaseFromAncestors(comp, reviewPage, sendNames || []);
  if (ancestorPhase) return ancestorPhase;
  var closest = null;
  for (var i = 0; i < reviewPage.children.length; i++) {
    var candidate = reviewPage.children[i];
    if (!/^divider$/i.test((candidate.name || '').trim()) || candidate.x > comp.x) continue;
    var phase = null;
    if (candidate.findAll) {
      var texts = candidate.findAll(function(node) { return node.type === 'TEXT'; });
      for (var textIndex = 0; textIndex < texts.length; textIndex++) {
        var match = (texts[textIndex].characters || '').match(/^\s*([^/]+?)\s*\//);
        if (match) { phase = match[1].trim(); break; }
      }
    }
    if (phase && (!closest || candidate.x > closest.x)) closest = { x: candidate.x, phase: phase };
  }
  return closest ? closest.phase : null;
}

function getReviewCompSignature(frame) {
  var name = (frame && frame.name || '').replace(/^\s*\[comp\]\s*/i, '').trim().toLowerCase();
  return [frame && frame.channel || '', frame && frame.market || '', name].join('::');
}

function distributeRepeatedCompPhases(frames, sendNames, positionMap) {
  if (!sendNames || sendNames.length < 2) return frames;
  var buckets = {};
  for (var i = 0; i < frames.length; i++) {
    var key = getReviewCompSignature(frames[i]);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push({ frame: frames[i], order: i });
  }
  Object.keys(buckets).forEach(function(key) {
    var bucket = buckets[key];
    // Explicit block markers are authoritative; reconciliation exists only
    // for legacy canvases that have no marker metadata.
    if (bucket.some(function(item) { return item.frame.sendAssignment === 'marker'; })) return;
    if (bucket.length < sendNames.length) return;
    var represented = {};
    for (var b = 0; b < bucket.length; b++) represented[normaliseWorkspaceName(bucket[b].frame.phase)] = true;
    if (Object.keys(represented).filter(Boolean).length >= sendNames.length) return;
    bucket.sort(function(a, b) {
      var difference = (positionMap[a.frame.id] || 0) - (positionMap[b.frame.id] || 0);
      return difference || a.order - b.order;
    });
    for (var index = 0; index < bucket.length; index++) {
      var phase = sendNames[index % sendNames.length];
      bucket[index].frame.phase = phase;
      bucket[index].frame.audienceParts = [phase];
    }
  });
  return frames;
}

function distributeRepeatedSlicePhases(frames, sendNames) {
  if (!sendNames || sendNames.length < 2) return frames;
  var buckets = {};
  for (var i = 0; i < frames.length; i++) {
    var frame = frames[i];
    var label = (frame.assetLabel || frame.name || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    var key = [frame.channel || '', frame.deliveryType || '', label, frame.width || 0, frame.height || 0].join('::');
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(frame);
  }
  Object.keys(buckets).forEach(function(key) {
    var bucket = buckets[key];
    if (bucket.length < sendNames.length) return;
    var represented = {};
    for (var b = 0; b < bucket.length; b++) represented[normaliseWorkspaceName(bucket[b].phase)] = true;
    if (Object.keys(represented).filter(Boolean).length >= sendNames.length) return;
    for (var index = 0; index < bucket.length; index++) {
      var phase = sendNames[index % sendNames.length];
      bucket[index].phase = phase;
      bucket[index].audienceParts = [phase];
    }
  });
  return frames;
}

// Targeted Comms review pages use frames as organisational folders (for
// example Reminder > Nike Email > Comp > AU), not only Figma sections.
// Treat those known wrapper frames as ancestry while keeping the actual comp
// below them as the export target.
function collectTargetedFrames(node, ancestry, frames, sourceGroupId, scanContext) {
  if (!node.children || isUnavailableForExport(node)) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child) || isArchiveContainer(child)) continue;
    var responsiveHeroAsset = isResponsiveHeroName(child.name) && ancestry.some(function(part) {
      return /^hero$/i.test(getCleanTargetedAssetName(part));
    });
    var structural = child.type === 'SECTION' || (!responsiveHeroAsset && child.children && (isTargetedStructureContainer(child) || (ancestry.length === 0 && !isReservedTargetedPart(child.name))));
    if (structural) {
      var isPhaseContainer = ancestry.length === 0 && !isReservedTargetedPart(child.name);
      var inferredPhase = isPhaseContainer && !(scanContext && scanContext.hasExplicitMarkers) ? getTargetedContainerPhase(child) : null;
      var structuralName = inferredPhase || child.name;
      var nextGroupId = isPhaseContainer ? child.id : sourceGroupId;
      collectTargetedFrames(child, ancestry.concat(structuralName), frames, nextGroupId, scanContext);
    } else if (isExportable(child)) {
      frames.push({ node: child, ancestry: ancestry.slice(), sourceGroupId: sourceGroupId || null });
      // Delivery assets such as the Nike Factory Store lockup can sit inside
      // an exportable Thread presentation wrapper. Keep walking so the nested
      // asset is evaluated independently by the targeted slice allowlist.
      if (child.children) collectTargetedFrames(child, ancestry.concat(child.name), frames, sourceGroupId, scanContext);
    } else if (child.children) {
      collectTargetedFrames(child, ancestry, frames, sourceGroupId, scanContext);
    }
  }
}

// NVS review layouts place the final [COMP] frames inside large presentation
// frames. The normal v34 walk stops at an exportable parent, which is correct
// for ordinary campaign pages but hides those nested finals. Descend through
// presentation wrappers and collect only explicitly named comps.
function collectTargetedCompFrames(node, ancestry, frames) {
  if (!node || !node.children || isUnavailableForExport(node)) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child) || isArchiveContainer(child)) continue;
    var structural = child.type === 'SECTION' || (child.children && isTargetedStructureContainer(child));
    var nextAncestry = structural ? ancestry.concat(child.name) : ancestry;
    if (isExportable(child) && isCompFrame(child.name, nextAncestry)) {
      frames.push({ node: child, ancestry: nextAncestry.slice(), sourceGroupId: null });
    }
    if (child.children) collectTargetedCompFrames(child, nextAncestry, frames);
  }
}

function getTargetedPart(ancestry, pattern) {
  for (var i = 0; i < ancestry.length; i++) {
    var part = (ancestry[i] || '').trim();
    if (pattern.test(part)) return part;
  }
  return null;
}

function getTargetedPathParts(name, ancestry) {
  var parts = [];
  (ancestry || []).concat(name || '').forEach(function(value) {
    String(value || '').split(/[|/]/).forEach(function(part) {
      part = part.trim();
      if (part) parts.push(part);
    });
  });
  return parts;
}

function getTargetedChannel(parts) {
  for (var i = 0; i < parts.length; i++) {
    if (/^nike email$/i.test(parts[i])) return 'Nike Email';
    if (/^nike app$/i.test(parts[i])) return 'Nike App';
    if (/^email$/i.test(parts[i])) return 'Nike Email';
    if (/^app$/i.test(parts[i])) return 'Nike App';
  }
  return null;
}

function getTargetedMarket(parts) {
  for (var i = 0; i < parts.length; i++) {
    var part = (parts[i] || '').trim();
    var compMatch = part.match(/^\s*\[comp\]\s*([^\s\[\]]+)\s*$/i);
    if (compMatch && /^[A-Z]{2,3}$/i.test(compMatch[1])) return compMatch[1].toUpperCase();
    if (/^[A-Z]{2,3}$/.test(part) && !/^(APP)$/i.test(part)) return part.toUpperCase();
  }
  return null;
}

function validateTargetedCompOutputMetadata(frames) {
  for (var i = 0; i < (frames || []).length; i++) {
    var frame = frames[i];
    if (frame.channel === 'Nike Email' && !frame.market) {
      return 'Could not determine an Email market for ' + frame.name + '. Add a market such as AU or NZ to its frame or parent name. Export stopped.';
    }
  }
  return null;
}

// NSP is intentionally separate from NVS: NSP uses channel folders and a
// structured Store / Phase / Audience send path, while NVS requires markets.
function getNspSendParts(node) {
  var match = String(node && node.name || '').match(/^\s*\[send\]\s*(.+?)\s*$/i);
  return match ? match[1].split('/').map(function(part) { return part.trim(); }).filter(Boolean) : [];
}

function getNspChannel(ancestry, name) {
  // Email utility logos can sit directly beneath the phase section rather
  // than inside the Email section. Their established Retention role makes
  // the channel unambiguous even when ancestry cannot supply it.
  if (/\b(?:nike\s+run|nike\s+football\s+logo)\b/i.test(name || '')) return 'Nike Email';
  // Client Review keeps Nike Email modes as top-level comps after its divider,
  // so the established mode names are their only channel signal.
  if (/^\s*\[comp\]\s*(?:light|dark)\s+mode\s*$/i.test(name || '')) return 'Nike Email';
  var values = (ancestry || []).concat(name || '');
  for (var i = values.length - 1; i >= 0; i--) {
    var value = String(values[i] || '').toLowerCase().trim();
    if (/retail(?:er'?s?|or'?s?)\s+email/.test(value)) return 'Retailors Email';
    if (/social\s+motion/.test(value)) return 'Social Motion';
    if (/\bcxp\b/.test(value)) return 'CXP';
    if (/nike\s+email|^email$/.test(value)) return 'Nike Email';
  }
  return null;
}

function isNspSliceTarget(node) {
  if (!node || !isExportable(node) || isWorkingFrame(node)) return false;
  return /\[(?:GIF|P\d+)\]|\b(?:DT Hero|MB Hero|Supporting\s*\d*|Swoosh Footer|Nike App Icon|Nike Run|Nike Football Logo|Landscape|Potrait|Portrait|IG-FB Story|TikTok)\b/i.test(node.name || '');
}

function collectNspFrames(node, ancestry, role, output) {
  if (!node || !node.children || isUnavailableForExport(node) || isArchiveContainer(node)) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child) || isArchiveContainer(child)) continue;
    var explicitComp = isExportable(child) && /^\s*\[comp\]/i.test(child.name || '');
    var explicitSlice = role === 'slices' && isNspSliceTarget(child);
    if ((role === 'comps' && explicitComp) || explicitSlice) {
      output.push({ node: child, ancestry: ancestry.slice() });
      // Match the Retention export-boundary convention: once a final asset is
      // found, nested instances are layout implementation details. In
      // particular, an MB Hero may contain a resized DT Hero instance and
      // must not produce a second DT delivery file.
      continue;
    }
    if (child.children) collectNspFrames(child, ancestry.concat(child.name || ''), role, output);
  }
}

function getNspPhaseName(value) {
  var match = String(value || '').match(/^\s*\[phase\]\s*(.+?)\s*$/i);
  return match ? match[1].trim() : null;
}

function getNspPhaseNames(page) {
  var names = [], seen = {};
  if (!page || !page.findAll) return names;
  page.findAll(function(node) {
    var name = getNspPhaseName(node.name);
    var key = normaliseWorkspaceName(name || '');
    if (name && !seen[key]) { seen[key] = true; names.push(name); }
    return false;
  });
  // A single recognisable NSP campaign section is unambiguous even when the
  // optional [PHASE] prefix has been removed from the current file.
  if (!names.length && page.children) {
    var campaignSections = page.children.filter(function(node) {
      if (node.type !== 'SECTION' || !node.children) return false;
      var childNames = node.children.map(function(child) { return String(child.name || ''); }).join(' | ');
      return /CXP Assets/i.test(childNames) && /Social Motion/i.test(childNames) && /Email/i.test(childNames);
    });
    if (campaignSections.length === 1) names.push(campaignSections[0].name.trim());
  }
  return names;
}

// Older/manual NSP files predate Design Space + Client Review. In those
// files the document name carries the campaign identity and slash-delimited
// canvas containers carry the delivery contract (for example CXP / Comps /).
function getNspManualContainerMeta(value) {
  var name = String(value || '').replace(/\s*\/\s*$/, '').trim();
  if (/^CXP\s*\/\s*Comps?$/i.test(name)) return { channel: 'CXP', kind: 'Comps' };
  if (/^CXP\s*\/\s*Slices?$/i.test(name)) return { channel: 'CXP', kind: 'Slices' };
  if (/^Nike\s+Email\s*\/\s*Comps?$/i.test(name)) return { channel: 'Nike Email', kind: 'Comps' };
  if (/^Nike\s+Email\s*\/\s*Slices?$/i.test(name)) return { channel: 'Nike Email', kind: 'Slices' };
  if (/^Social\s*\+\s*Paid\s+Media$/i.test(name)) return { channel: 'Paid Media', kind: 'Slices' };
  return null;
}

function parseNspManualSourceName(value) {
  var parts = String(value || '').split('/').map(function(part) { return part.trim(); }).filter(Boolean);
  var markerIndex = -1;
  for (var i = 0; i < parts.length; i++) if (/^(?:Comp|Comps|Slice|Slices)$/i.test(parts[i])) { markerIndex = i; break; }
  if (markerIndex < 1 || markerIndex >= parts.length - 1) return null;
  var rawChannel = parts[0];
  var channel = /^CXP$/i.test(rawChannel) ? 'CXP' : (/^Nike\s+Email$/i.test(rawChannel) ? 'Nike Email' : null);
  if (!channel) return null;
  return {
    channel: channel,
    kind: /^comps?$/i.test(parts[markerIndex]) ? 'Comps' : 'Slices',
    filename: parts.slice(markerIndex + 1).join('_'),
    parts: parts
  };
}

function getNspManualNamedSources(page, kind) {
  var sources = [];
  if (!page || !page.findAll) return sources;
  page.findAll(function(node) {
    var parsed = parseNspManualSourceName(node.name);
    if (parsed && parsed.kind === kind && isExportable(node) && !isUnavailableForExport(node)) sources.push({ node: node, parsed: parsed });
    return false;
  });
  return sources.filter(function(source) {
    var current = source.node.parent;
    while (current && current !== page) {
      var ancestor = parseNspManualSourceName(current.name);
      if (ancestor && ancestor.kind === kind) return false;
      current = current.parent;
    }
    return true;
  });
}

function getNspManualContainers(page) {
  var containers = [];
  if (!page || !page.findAll) return containers;
  page.findAll(function(node) {
    var meta = getNspManualContainerMeta(node.name);
    var parentMeta = node.parent && getNspManualContainerMeta(node.parent.name);
    if (meta && !parentMeta && node.children && !isUnavailableForExport(node)) containers.push({ node: node, meta: meta });
    return false;
  });
  return containers;
}

function isNspManualPage(page) {
  return getNspManualContainers(page).length > 0 || getNspManualNamedSources(page, 'Comps').length > 0 || getNspManualNamedSources(page, 'Slices').length > 0;
}

function cleanManualNspLabel(value) {
  var raw = String(value || '').replace(/\.(?:jpe?g|png|gif)$/i, '');
  var cxp = raw.match(/(?:^|[^A-Za-z0-9])CXP\s*[-_]\s*(DT|MB)(?:\b|_)/i);
  if (cxp) return 'CXP ' + cxp[1].toUpperCase();
  var email = raw.match(/(?:^|[^A-Za-z0-9])(DT|MB)\s+Hero\b|(?:^|[^A-Za-z0-9])Hero\s*[-_]\s*(DT|MB)(?:\b|_)/i);
  if (email) return 'Hero ' + String(email[1] || email[2]).toUpperCase();
  var supporting = raw.match(/(?:^|[^A-Za-z0-9])Supporting\s*[-_ ]?\s*(\d+)?\b/i);
  if (supporting) return 'Supporting' + (supporting[1] ? ' ' + supporting[1] : '');
  if (/\bSwoosh\s*[-_ ]?\s*Footer\b/i.test(raw)) return 'Swoosh Footer';
  if (/\b(?:IG|Instagram)(?:-FB)?\s+Story\b|\bMeta\s+Story\b/i.test(raw)) return 'Meta Story';
  if (/\bTikTok\b/i.test(raw)) return 'TikTok In-Feed';
  if (/\bReel\b/i.test(raw)) return 'Meta Reel';
  if (/\bMeta\s+In[- ]?Feed\s+Static\b/i.test(raw)) return 'Meta In-Feed Static';
  return raw
    .replace(/^.*?\b(?:CXP|Nike Email|Social\s*\+\s*Paid\s+Media)\b\s*[-_:]?\s*/i, '')
    .replace(/^.*?\s\/\s/, '')
    .replace(/^\s*\[?NIKRA\d+\]?[^_]*_/i, '')
    .replace(/\bCOMP\b/ig, ' ').replace(/[\[\]]/g, ' ')
    .replace(/(?:^|_)\d+\s*x\s*\d+(?:@\d+x)?$/i, '')
    .replace(/\s+/g, ' ').trim() || 'Asset';
}

function collectNspManualAssets(container, meta) {
  var candidates = [];
  function walk(node, ancestry, depth) {
    if (!node || isUnavailableForExport(node) || isArchiveContainer(node)) return;
    var children = node.children || [];
    var exportableChildren = children.filter(function(child) {
      return isExportable(child) && !isUnavailableForExport(child) && !isWorkingFrame(child);
    });
    var recognisable = !!parseNspManualSourceName(node.name) || /\b(?:DT|MB|Desktop|Mobile|Hero|Supporting|Swoosh|Landscape|Portrait|Potrait|Meta|TikTok|Instagram|Facebook|In[- ]?Feed|Story|Reel|Static)\b|\[COMP\]|\d+\s*x\s*\d+/i.test(node.name || '');
    var structuralGroup = /^\s*(?:Hero|Supporting)\s*$/i.test(node.name || '');
    if (isExportable(node) && !isWorkingFrame(node) && ((recognisable && !(structuralGroup && exportableChildren.length)) || (depth === 1 && !exportableChildren.length))) {
      candidates.push({ node: node, ancestry: ancestry.slice(), meta: meta });
      return;
    }
    for (var i = 0; i < children.length; i++) walk(children[i], ancestry.concat(node.name || ''), depth + 1);
  }
  for (var i = 0; i < (container.children || []).length; i++) walk(container.children[i], [], 1);
  return candidates;
}

function getNspManualFrames(page, role, options) {
  var frames = [];
  var wantedKind = role === 'comps' ? 'Comps' : 'Slices';
  var manualContainers = getNspManualContainers(page);
  getNspManualNamedSources(page, wantedKind).forEach(function(source) {
    manualContainers.push({
      node: { name: source.parsed.filename, children: [source.node] },
      meta: { channel: source.parsed.channel, kind: source.parsed.kind },
      canonicalSource: true
    });
  });
  manualContainers.forEach(function(container) {
    if (wantedKind !== container.meta.kind) return;
    var manualAssets = collectNspManualAssets(container.node, container.meta);
    // A manual comp section is a presentation canvas containing the final
    // comp plus nested browser chrome, logos and responsive instances. Keep
    // only the largest export boundary for each canonical comp identity.
    if (role === 'comps') {
      var largestByIdentity = {};
      manualAssets.forEach(function(item) {
        var candidatePath = [container.node.name].concat(item.ancestry, item.node.name).join(' ');
        var candidateLabel = cleanManualNspLabel(candidatePath);
        var candidateMode = /dark\s*mode/i.test(candidatePath) ? 'Dark Mode' : (/light\s*mode/i.test(candidatePath) ? 'Light Mode' : '');
        var candidateKey = [container.meta.channel, candidateLabel, candidateMode].join('::');
        var candidateArea = Number(item.node.width || 0) * Number(item.node.height || 0);
        var current = largestByIdentity[candidateKey];
        if (!current || candidateArea > current.area) largestByIdentity[candidateKey] = { item: item, area: candidateArea };
      });
      manualAssets = Object.keys(largestByIdentity).map(function(key) { return largestByIdentity[key].item; });
    }
    manualAssets.forEach(function(item) {
      var node = item.node;
      var sourcePath = [container.node.name].concat(item.ancestry, node.name);
      var rawName = sourcePath.join(' ').replace(/^\s*\[comp\]\s*/i, '').trim();
      var label = cleanManualNspLabel(rawName);
      var channel = item.meta.channel;
      var isComp = role === 'comps';
      var manualGroup = null;
      if (channel === 'Nike Email' && !isComp) {
        manualGroup = /supporting/i.test(rawName) ? 'Supporting' : (/swoosh/i.test(rawName) ? 'Swoosh Footer' : 'Hero');
      }
      var manualChannels = [channel];
      if (channel === 'Paid Media' && (/\bstory\b/i.test(rawName) || (/\bin[- ]?feed\b/i.test(rawName) && node.width !== node.height && !/tiktok|reel/i.test(rawName)))) {
        manualChannels.push('Social');
      } else if (channel === 'Paid Media' && (/carousel/i.test(rawName) || node.width === node.height)) {
        manualChannels = ['Social'];
      }
      manualChannels.forEach(function(outputChannel) {
        frames.push({
          id: node.id + (outputChannel === channel ? '' : '::' + outputChannel), exportNodeId: node.id, name: node.name, label: label,
          pageId: page.id, pageName: page.name, deliveryName: '', fileSetup: 'nsp-store-appearance',
          nspManual: true, nspStore: options && options.nspStore || '', phase: '', sendAssignment: 'filename',
          nspCompMode: /dark\s*mode/i.test(rawName) ? 'Dark Mode' : (/light\s*mode/i.test(rawName) ? 'Light Mode' : null),
          sourcePath: sourcePath, channel: outputChannel,
          assetType: isComp ? 'Comp' : 'Slices', deliveryType: outputChannel, market: '',
          width: Math.round(node.width), height: Math.round(node.height),
          absoluteX: getNodeAbsoluteX(node), absoluteY: getNodeAbsoluteY(node),
          isComp: isComp, isGif: false, forcePng: !isComp && hasTransparentBackground(node),
          scales: outputChannel === 'Paid Media' || outputChannel === 'Social' ? [1] : [2], audienceParts: [], subfolderSection: manualGroup
        });
      });
    });
  });
  var supportingFrames = frames.filter(function(frame) {
    return frame.channel === 'Nike Email' && !frame.isComp && /^Supporting$/i.test(frame.label || '');
  }).sort(function(a, b) {
    return a.absoluteX - b.absoluteX || a.absoluteY - b.absoluteY;
  });
  if (supportingFrames.length > 1) supportingFrames.forEach(function(frame, index) { frame.label = 'Supporting ' + (index + 1); });
  return frames;
}

function getNspFrames(page, role, phaseNames, reviewSendParts, options) {
  var raw = [], markers = getPageSendMarkers(page), frames = [];
  collectNspFrames(page, [], role, raw);
  for (var i = 0; i < raw.length; i++) {
    var item = raw[i], node = item.node;
    var ancestryPhase = null;
    for (var ancestryIndex = 0; ancestryIndex < item.ancestry.length; ancestryIndex++) {
      ancestryPhase = getNspPhaseName(item.ancestry[ancestryIndex]) || ancestryPhase;
    }
    var assignment = markers.length
      ? getMarkerSendAssignmentFromMarkers(node, page, markers.map(function(marker) { return marker.phase; }), markers)
      : { phase: ancestryPhase || ((phaseNames || []).length === 1 ? phaseNames[0] : null) };
    var selectedMarker = null;
    for (var markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      if (normaliseWorkspaceName(markers[markerIndex].phase) === normaliseWorkspaceName(assignment.phase)) selectedMarker = markers[markerIndex];
    }
    var sendParts = getNspSendParts(selectedMarker && selectedMarker.node);
    if (!sendParts.length && reviewSendParts && reviewSendParts.length) sendParts = reviewSendParts.slice();
    if (!sendParts.length && assignment.phase) sendParts = [assignment.phase];
    var channel = getNspChannel(item.ancestry, node.name);
    if (!channel) continue;
    var isComp = role === 'comps';
    // Social Motion is a final motion asset, not a review comp deliverable.
    if (isComp && channel === 'Social Motion') continue;
    var label = String(node.name || '').replace(/^\s*\[comp\]\s*/i, '').replace(/\[(?:GIF|P\d+)\]/gi, ' ').replace(/\s+/g, ' ').trim();
    var compVariant = /\bcxp\s+(?:dt|desktop)\b|\blandscape\b/i.test(node.name || '') ? 'DT' :
      (/\bcxp\s+(?:mb|mobile)\b|\bportrait\b/i.test(node.name || '') ? 'MB' : null);
    var compMode = isComp && /\blight\s+mode\b/i.test(node.name || '') ? 'Light Mode' :
      (isComp && /\bdark\s+mode\b/i.test(node.name || '') ? 'Dark Mode' : null);
    frames.push({
      id: node.id, exportNodeId: node.id, name: node.name, label: label,
      pageId: page.id, pageName: page.name, deliveryName: '', fileSetup: 'nsp-store-appearance',
      assetType: isComp ? 'Comp' : 'Slices', sourcePath: item.ancestry.concat(node.name),
      phase: ancestryPhase || assignment.phase, nspSendParts: sendParts, nspCompVariant: compVariant, nspCompMode: compMode,
      nspStore: options && options.nspStore || '',
      sendAssignment: assignment.phase ? 'marker' : null, market: '',
      width: Math.round(node.width), height: Math.round(node.height),
      absoluteX: getNodeAbsoluteX(node), absoluteY: getNodeAbsoluteY(node), channel: channel, deliveryType: channel,
      assetPanel: isComp ? null : getAutomaticAssetPanel(node.name), assetLabel: isComp ? null : label,
      assetGroup: isComp ? null : getStandardSliceSubfolder(node.name), isComp: isComp,
      isGif: !isComp && (channel === 'Social Motion' || parseTags(node.name).indexOf('GIF') !== -1),
      forcePng: !isComp && hasTransparentBackground(node),
      scales: getScales(channel, isComp, node.name, 'nsp-store-appearance'), audienceParts: sendParts,
      subfolderSection: isComp ? null : getStandardSliceSubfolder(node.name)
    });
  }
  return frames;
}

function getFramesOnPage(campaignPageId, role, fileSetup, options) {
  if (fileSetup === 'mid-season-promo') return getMidSeasonFrames(campaignPageId, role, options);
  var campaignPage = figma.root.findChild(function(n) { return n.id === campaignPageId; });
  if (!campaignPage) return [];

  // Slices live in the matching Week section of the separate Design Space
  // page. Comps remain on the campaign page selected in the UI.
  var isTargeted = fileSetup === 'targeted-comms';
  var isFlexible = isTargeted;
  if (isFlexible && role === 'comps' && (!options || options.includeStreamPages !== false) && /client\s+review/i.test(campaignPage.name || '')) {
    // App and Email comps live on sibling stream pages. This file keeps its
    // Thread comps directly on Client Review inherit the discovered send order.
    // Include only those direct Thread comps and assign their missing stream
    // deterministically so no unphased root folders can be produced.
    var directThreads = getFramesOnPage(campaignPage.id, role, fileSetup, { includeStreamPages: false }).filter(function(frame) {
      return /thread/i.test(frame.name || '');
    });
    var streamPages = getTargetedStreamPages(campaignPage);
    for (var directIndex = 0; directIndex < directThreads.length; directIndex++) {
      var directPhase = streamPages.length ? streamPages[directIndex % streamPages.length].name : null;
      if (!directPhase) continue;
      directThreads[directIndex].phase = directPhase;
      directThreads[directIndex].audienceParts = [directPhase];
      directThreads[directIndex].deliveryType = 'Thread';
    }
    var combined = directThreads;
    for (var sourceIndex = 0; sourceIndex < streamPages.length; sourceIndex++) {
      combined = combined.concat(getFramesOnPage(streamPages[sourceIndex].id, role, fileSetup, options));
    }
    var seenCombined = {};
    return combined.filter(function(frame) {
      if (seenCombined[frame.id]) return false;
      seenCombined[frame.id] = true;
      return true;
    });
  }
  var page = role === 'slices' ? getDesignSpacePage() : campaignPage;
  if (!page) return [];
  var flexibleSendNames = isFlexible ? getDesignSpaceSendNames() : [];
  var flexiblePageMarkers = isFlexible ? getPageSendMarkers(page) : [];

  var containerIds = {};
  var raw = [];

  var container = role === 'slices' && !isTargeted ? findMatchingWeekSection(page, campaignPage.name) : null;
  if (role === 'slices' && !isTargeted && !container) return [];
  if (isFlexible) {
    // Comps come from the discovered send review pages. Supporting delivery
    // assets come from matching stream sections in Design Space.
    if (role === 'comps') collectTargetedCompFrames(page, [page.name], raw);
    else collectTargetedFrames(page, [], raw, null, { hasExplicitMarkers: flexiblePageMarkers.length > 0 });
  } else if (container) {
    if (role === 'slices') {
      collectRetentionDesignSpaceSlices(container, [], raw);
    } else {
      if (container.type === 'SECTION') containerIds[container.id] = true;
      collectFramesWithAncestry(container, [], raw, containerIds);
    }
  } else {
    if (role === 'slices' && !isTargeted) collectRetentionDesignSpaceSlices(page, [], raw);
    else collectFramesWithAncestry(page, [], raw, containerIds);
  }

  if (role === 'slices' && !isTargeted) {
    var shoppingToutSection = findSectionByName(page, 'Shopping With Us is Easy Tout');
    var shoppingReferences = getShoppingToutReferences(campaignPage);
    collectShoppingToutAssets(shoppingToutSection, raw, shoppingReferences);
  }

  // A directly placed slice can be found by both collectors.
  var seenRaw = {};
  raw = raw.filter(function(item) {
    if (seenRaw[item.node.id]) return false;
    seenRaw[item.node.id] = true;
    return true;
  });
  if (role === 'slices' && isFlexible) raw = resolveTargetedSliceCandidates(raw);

  var result = [];
  for (var i = 0; i < raw.length; i++) {
    var f        = raw[i].node;
    var ancestry = raw[i].ancestry;
    var tags     = parseTags(f.name);

    // Copy Source is deliberately scanned separately from delivery assets.
    // Never show its copy-only frames in the Slices tab.
    var isCopySource = ancestry.some(function(part) {
      return part.toLowerCase().trim() === 'copy source';
    });
    if (isCopySource) continue;
    if (isUnavailableForExport(f)) continue;
    if (isWorkingFrame(f)) continue;

    var targetedParts = isFlexible ? getTargetedPathParts(f.name, ancestry) : [];
    var isComp = isFlexible
      ? targetedParts.some(function(part) { return /^comps?$/i.test(part); }) || isCompFrame(f.name, ancestry)
      : parseTags(f.name).indexOf('COMP') !== -1;

    // Channel: section name first, then frame tag, then the established
    // top-level comp label convention used on campaign pages.
    var targetedDeliveryType = isFlexible ? getTargetedDeliveryType(targetedParts, getTargetedChannel(targetedParts)) : null;
    // Retention slices deliberately take their channel only from the Nike App
    // or Nike Email section hierarchy. A channel-looking frame tag outside
    // those sections is not a substitute for the working plugin's structure.
    // Keep the broader tag/name fallbacks inside the Multi-send adapter.
    var channel = isFlexible
      ? ((targetedDeliveryType === 'Thread' ? 'Nike App' : getTargetedChannel(targetedParts)) ||
        getChannelFromSections(ancestry) || getChannelFromTags(tags) || (isComp ? getChannelFromCompName(f.name) : null))
      : (role === 'slices' ? getChannelFromSections(ancestry) : (isComp ? getRetentionChannelFromCompName(f.name) : null));
    if (!channel) continue;

    var channelFromSection = getChannelFromSections(ancestry) !== null;

    // Audience: sections before the channel section, or tags before the channel tag
    // Design Space sections are visual organisation only. For Slices, use
    // them solely to determine Nike App versus Nike Email—not audience or
    // delivery folders.
    var targetedPhase = isFlexible ? getTargetedPhase(targetedParts) : null;
    var markerAssignment = isFlexible ? getMarkerSendAssignmentFromMarkers(f, page, flexibleSendNames, flexiblePageMarkers) : { phase: null, axis: null };
    if (markerAssignment.phase) targetedPhase = markerAssignment.phase;
    if (!targetedPhase && isTargeted && !isReservedTargetedPart(page.name)) targetedPhase = (page.name || '').trim();
    var targetedMarket = isFlexible && channel === 'Nike Email' ? getTargetedMarket(targetedParts) : null;
    var audienceParts = isFlexible ? (targetedPhase ? [targetedPhase] : []) : [];
    if (isFlexible && !audienceParts.length && !channelFromSection) {
      audienceParts = extractTagParts(f.name, 'before', false, null);
    }

    // Subfolder: sections after the channel section, or unknown tags (after channel tag, or all if channel from section)
    var subfolderSection = isFlexible ? targetedMarket : (role === 'slices' ? null : getSubfolderFromSections(ancestry));
    if (!subfolderSection) {
      var sfParts = extractTagParts(f.name, 'after', channelFromSection, audienceParts);
      if (sfParts.length) subfolderSection = sfParts.join('/');
    }

    // Keep common delivery groups consistent regardless of their Figma
    // placement or tag order.
    if (role === 'slices') {
      var standardSliceSubfolder = isFlexible ? (raw[i].resolvedAssetGroup || getStandardSliceSubfolder(f.name)) : getRetentionSliceSubfolder(f.name);
      if (!isFlexible && channel === 'Nike App' && (standardSliceSubfolder === 'Hero' || standardSliceSubfolder === 'Supporting')) {
        subfolderSection = 'Spotlight/' + standardSliceSubfolder;
      } else if (standardSliceSubfolder) subfolderSection = standardSliceSubfolder;
      if (raw[i].shoppingTout) subfolderSection = 'Supporting/Shopping With Us is Easy';
    }

    // Keep each tab anchored to its intended source. This prevents ordinary
    // campaign layouts appearing in Slices and Design Space assets in Comps.
    if (role === 'slices' && isComp) continue;
    if (role === 'comps' && !isComp) continue;
    // Thread uses the same delivery-asset naming contract as App and Email.
    // Do not export presentation headers such as the wide frame named
    // "Section" merely because they sit inside the Thread container.
    if (isFlexible && role === 'slices' && !isTargetedSliceTarget(f.name) && !raw[i].resolvedAssetName) continue;

    // Build deduplication context — audience + channel + subfolder
    var contextWords = [];
    for (var ci = 0; ci < audienceParts.length; ci++) contextWords.push(audienceParts[ci].toLowerCase());
    if (channel) contextWords.push(channel.toLowerCase());
    if (subfolderSection) {
      var sfSplit = subfolderSection.split('/');
      for (var si = 0; si < sfSplit.length; si++) contextWords.push(sfSplit[si].toLowerCase());
    }

    // Build label: strip system/channel tags always; strip context words once to avoid duplication
    var usedContext = {};
    var label = f.name.replace(/\[([^\]]+)\]/g, function(match, inner) {
      var up = inner.toUpperCase().trim();
      if (SYSTEM_STRIP.indexOf(up) !== -1 || /^P\d+$/.test(up)) return '';
      if (CHANNEL_STRIP.indexOf(up) !== -1) return '';
      var lo = inner.toLowerCase().trim();
      for (var ci = 0; ci < contextWords.length; ci++) {
        if (lo === contextWords[ci] && !usedContext[contextWords[ci]]) {
          usedContext[contextWords[ci]] = true;
          return '';
        }
      }
      return inner;
    }).replace(/\s+/g, ' ').trim();

    if (raw[i].resolvedAssetName) label = raw[i].resolvedAssetName;

    if (raw[i].shoppingTout) label = f.name;
    if (!label) label = '';
    if (isComp) label = isFlexible ? (targetedParts[targetedParts.length - 1] || 'COMP') : getRetentionCompLabel(f.name);
    var isGif  = tags.indexOf('GIF') !== -1 || tags.indexOf('ANIMATED') !== -1;
    var forcePng = !isGif && (isFlexible
      ? (raw[i].shoppingTout || hasTransparentBackground(f))
      : (role === 'slices' && (raw[i].shoppingTout || hasTransparentBackground(f))));
    var exportTarget = isComp && (targetedDeliveryType === 'Thread' || /thread/i.test(f.name || '')) ? getThreadCompExportTarget(f) : f;

    result.push({
      id:               f.id,
      exportNodeId:     exportTarget.id,
      name:             f.name,
      label:            label,
      pageId:           page.id,
      pageName:         page.name,
      deliveryName:      isTargeted ? '' : getDeliveryName(campaignPage.name),
      fileSetup:         fileSetup || 'retention-offense',
      assetType:         isComp ? 'Comp' : 'Slices',
      sourcePath:        ancestry.concat(f.name),
      sourceGroupId:     raw[i].sourceGroupId || null,
      phase:             targetedPhase,
      sendAssignment:    markerAssignment.phase ? 'marker' : null,
      market:            targetedMarket,
      width:            Math.round(exportTarget.width),
      height:           Math.round(exportTarget.height),
      absoluteX:        getNodeAbsoluteX(f),
      absoluteY:        getNodeAbsoluteY(f),
      channel:          channel,
      deliveryType:     targetedDeliveryType,
      assetPanel:       role === 'slices' ? (isFlexible ? getAutomaticAssetPanel(f.name) : (getCopyPanel(f.name) || 'P1')) : null,
      assetLabel:       role === 'slices' ? label : null,
      assetGroup:       role === 'slices' ? (isFlexible ? (raw[i].resolvedAssetGroup || null) : getRetentionSliceSubfolder(f.name)) : null,
      isCarousel:       role === 'slices' && (isFlexible ? isTargetedCarouselGroupName(raw[i].resolvedAssetGroup || '') : tags.indexOf('CAROUSEL') !== -1),
      assetTarget:      role === 'slices' && !isFlexible && channel === 'Nike App' && /hero/i.test(f.name || '') ? 'spotlight' :
        (role === 'slices' && !isFlexible && channel === 'Nike App' && /inbox/i.test(f.name || '') ? 'push-and-inbox' : null),
      isShoppingTout:   role === 'slices' && raw[i].shoppingTout === true,
      isComp:           isComp,
      isGif:            isGif,
      forcePng:         forcePng,
      scales:           getScales(channel, isComp, f.name, fileSetup),
      audienceParts:    audienceParts,
      subfolderSection: subfolderSection,
      sectionName:      audienceParts.length ? audienceParts.join(' ') : null
    });
  }
  if (role === 'slices' && isFlexible) {
    assignFlatTargetedCarouselGroups(result);
    disambiguateTargetedDuplicateSliceLabels(result);
  }
  if (role === 'slices' && !isFlexible) {
    var carouselGroups = {};
    var carouselOrderByChannel = {};
    for (var carouselScan = 0; carouselScan < result.length; carouselScan++) {
      var carouselItem = result[carouselScan];
      if (!carouselItem.isCarousel) continue;
      var carouselPanel = carouselItem.assetPanel || '__none__';
      var carouselKey = carouselItem.channel + '::' + carouselPanel;
      if (!carouselGroups[carouselKey]) {
        if (!carouselOrderByChannel[carouselItem.channel]) carouselOrderByChannel[carouselItem.channel] = [];
        carouselOrderByChannel[carouselItem.channel].push(carouselKey);
        carouselGroups[carouselKey] = [];
      }
      carouselGroups[carouselKey].push(carouselItem);
    }
    Object.keys(carouselOrderByChannel).forEach(function(carouselChannel) {
      var channelGroups = carouselOrderByChannel[carouselChannel];
      for (var carouselIndex = 0; carouselIndex < channelGroups.length; carouselIndex++) {
        var carouselFrames = carouselGroups[channelGroups[carouselIndex]];
        for (var frameIndex = 0; frameIndex < carouselFrames.length; frameIndex++) {
          carouselFrames[frameIndex].label = 'Carousel ' + (carouselIndex + 1) + '_Frame ' + (frameIndex + 1);
          carouselFrames[frameIndex].assetLabel = carouselFrames[frameIndex].label;
          carouselFrames[frameIndex].assetReferenceLabel = 'Carousel ' + carouselFrames.length + 'x frames';
        }
      }
    });
  }
  if (role === 'comps' && !isFlexible) {
    var retentionCompOrder = { 'COMP [LIGHT MODE]': 0, 'COMP [DARK MODE]': 1, 'COMP [Push Notification]': 2, 'COMP [Inbox]': 3, 'COMP [Spotlight]': 4 };
    result.sort(function(a, b) {
      return (retentionCompOrder[a.label] === undefined ? 99 : retentionCompOrder[a.label]) -
        (retentionCompOrder[b.label] === undefined ? 99 : retentionCompOrder[b.label]);
    });
  }
  return result;
}

function countFrames(page) {
  var raw = [];
  collectFramesWithAncestry(page, [], raw);
  return raw.filter(function(item) {
    if (isUnavailableForExport(item.node)) return false;
    var tags = parseTags(item.node.name);
    return getChannelFromSections(item.ancestry) !== null || getChannelFromTags(tags) !== null ||
      (isCompFrame(item.node.name, item.ancestry) && getChannelFromCompName(item.node.name) !== null);
  }).length;
}

function getAllPages() {
  return figma.root.children.map(function(page) {
    return { id: page.id, name: page.name, frameCount: countFrames(page), nspManual: isNspManualPage(page) };
  });
}

// ── Copy field helpers ────────────────────────
var PLACEHOLDER_PATTERNS = [
  /lorem/i,
  /^tbc$/i,
  /^tbd$/i,
  /^placeholder$/i,
  /^copy here$/i,
  /^insert copy$/i,
  /^nike to confirm$/i,
  /^eyebrow text$/i,
  /^\[.*\]$/
];

function isPlaceholder(text) {
  if (!text || !text.trim()) return true;
  var t = text.trim();
  for (var i = 0; i < PLACEHOLDER_PATTERNS.length; i++) {
    if (PLACEHOLDER_PATTERNS[i].test(t)) return true;
  }
  return false;
}

function isCopyLayer(layerName) {
  var name = (layerName || '').trim();
  // Copy may be identified by [COPY] or by any explicit content tag such as
  // [CTA], [LINK], [HEADLINE] or [BODY COPY]. P-tags remain panel grouping.
  return /\[COPY\]/i.test(name) || /\[[^\]]+\]/.test(name) ||
    /^(eyebrow|headline|body\s*copy|cta|link)(?:\s*[:/_-].*)?$/i.test(name);
}

function isRetentionCopyLayer(layerName) {
  return /\[COPY\]/i.test((layerName || '').trim());
}

function isSelectedSemanticCopyLayer(layerName) {
  var name = String(layerName || '').trim();
  return /\[COPY\]/i.test(name) ||
    /\[(?:SUBJECT(?: LINE)?|PRE[- ]?HEADER|PREVIEW|EYEBROW|OVERLINE|HEADLINE|TITLE|BODY(?: COPY)?|DEK|DESCRIPTION|CTA|BUTTON|LINK|LEGAL|T&CS?|STORE NAME|ADDRESS)\]/i.test(name) ||
    /^(subject(?: line)?|pre[- ]?header|preview(?: text)?|eyebrow|overline|display title|headline|hedline|hed|header|title|body(?: copy)?|dek|description|paragraph|copy|cta|button(?: text)?|link|legal|t&cs?|store name|address)(?:\s*[:/_-].*)?$/i.test(name.replace(/\[P\d+\]/ig, '').trim());
}

function getCopyPanel(layerName) {
  var m = (layerName || '').match(/(?:^|\s|\[)(P\d+)(?:\]|\s|$)/i);
  return m ? m[1].toUpperCase() : null;
}

function getCopyField(layerName) {
  var name = layerName || '';
  var tags = [];
  var match;
  var tagRe = /\[([^\]]+)\]/g;
  while ((match = tagRe.exec(name)) !== null) {
    var tag = match[1].trim();
    if (!/^P\d+$/i.test(tag) && !/^(copy|asset)$/i.test(tag)) tags.push(tag);
  }
  var field = name
    .replace(/\[COPY\]\s*/ig, '')
    .replace(/\[P\d+\]\s*/ig, '')
    .replace(/\[[^\]]+\]\s*/ig, '')
    .trim();
  return field || tags.join(' / ') || 'Copy';
}

function getSelectedCopyField(layerName) {
  var field = getCopyField(layerName);
  if (/^subject(?: line)?$/i.test(field)) return 'Subject Line';
  if (/^pre[- ]?header|^preview(?: text)?$/i.test(field)) return 'Pre-header';
  if (/^eyebrow|^overline$/i.test(field)) return 'Eyebrow';
  if (/^(display title|headline|hedline|hed|header|title)$/i.test(field)) return 'Headline';
  if (/^(body|body copy|dek|description|paragraph|copy)$/i.test(field)) return 'Body copy';
  if (/^(button|button text|cta)$/i.test(field)) return 'CTA';
  if (/^link$/i.test(field)) return 'Link';
  if (/^(legal|t&cs?|terms)$/i.test(field)) return 'T&Cs';
  if (/^store name$/i.test(field)) return 'Store name';
  if (/^address$/i.test(field)) return 'Address';
  return field;
}

function getAssetTag(layerName) {
  if (!/\[ASSET\]|^\s*ASSET\s*:/i.test(layerName || '')) return null;
  return (layerName || '')
    .replace(/(?:\[ASSET\]|^\s*ASSET\s*:)\s*/ig, '')
    .replace(/\[P\d+\]\s*/ig, '')
    .replace(/\[[^\]]+\]\s*/ig, '')
    .trim() || null;
}

function getPanelFromAsset(layerName) {
  var m = (layerName || '').match(/(?:^|\s|\[)(P\d+)(?:\]|\s|$)/i);
  return m ? m[1].toUpperCase() : null;
}

function getTextHyperlink(node) {
  try {
    if (node.hyperlink && node.hyperlink.type === 'URL' && node.hyperlink.value) return node.hyperlink.value;
    if (typeof node.getRangeHyperlink === 'function' && node.characters && node.characters.length) {
      var target = node.getRangeHyperlink(0, node.characters.length);
      if (target && target.type === 'URL' && target.value) return target.value;
    }
  } catch(e) {}
  return null;
}

function byteToHex(value) {
  var hex = Math.round(Math.max(0, Math.min(1, value || 0)) * 255).toString(16).toUpperCase();
  return hex.length === 1 ? '0' + hex : hex;
}

// Preserve only exact #FF00FF source text. Every other Figma colour is
// deliberately normalised to black in the Word copy document.
function getMagentaTextColor(fills) {
  if (!fills || !Array.isArray(fills)) return null;
  for (var i = 0; i < fills.length; i++) {
    var paint = fills[i];
    if (!paint || paint.type !== 'SOLID' || paint.visible === false || (paint.opacity !== undefined && paint.opacity <= 0)) continue;
    var color = paint.color;
    if (!color) continue;
    var hex = byteToHex(color.r) + byteToHex(color.g) + byteToHex(color.b);
    if (hex === 'FF00FF') return 'FF00FF';
  }
  return null;
}

function getTextRuns(node) {
  try {
    if (typeof node.getStyledTextSegments === 'function') {
      var segments = node.getStyledTextSegments(['fontName', 'fills']);
      if (segments && segments.length) {
        return segments.map(function(segment) {
          var style = ((segment.fontName && segment.fontName.style) || '').toLowerCase();
          return {
            text: segment.characters || '',
            bold: /bold|black|heavy/.test(style),
            italic: /italic|oblique/.test(style),
            color: getMagentaTextColor(segment.fills)
          };
        });
      }
    }
  } catch(e) {}
  // A uniformly styled text layer does not need segmentation. Reading the
  // node fill here also keeps exact magenta working in older Figma runtimes
  // where getStyledTextSegments is unavailable or rejects the request.
  var nodeStyle = ((node.fontName && node.fontName.style) || '').toLowerCase();
  return [{
    text: node.characters || '',
    bold: /bold|black|heavy/.test(nodeStyle),
    italic: /italic|oblique/.test(nodeStyle),
    color: getMagentaTextColor(node.fills)
  }];
}

function getNodePathWithin(node, root) {
  var parts = [];
  var current = node.parent;
  while (current && current !== root) { parts.unshift(current.name || ''); current = current.parent; }
  return parts.join(' > ');
}

// NVS comps predate the Retention [COPY] naming contract. Read only the
// production copy areas of those comps; presentation specs, navigation,
// artwork text and global footers remain excluded.
function getNvsVisibleCopyMeta(textNode, root, context) {
  var path = getNodePathWithin(textNode, root);
  var name = (textNode.name || '').trim();
  var value = (textNode.characters || '').trim();
  if (!value || /Specs|Email Footer|Status Bar|Global Navigation|Promo 3:4|DT Hero|Label > Specs/i.test(path)) return null;

  if (/Email Header.*Subject/i.test(path)) {
    if (/^(Nike|To:|Alice)$/i.test(value) || value.length === 1) return null;
    return { panel: null, field: /^Label$/i.test(name) ? 'Subject Line' : 'Pre-header' };
  }

  if (/EDIT HERE > Text layers/i.test(path)) {
    if (/^\d+\s+day/i.test(value)) return null;
    return { panel: null, field: value.length > 70 ? 'Preview' : 'Headline' };
  }

  var isThread = /Spotlight/i.test(path);
  var isEmail = /Email Template/i.test(path);
  if (!isThread && !isEmail) return null;
  if (isThread && /Label|Header \/ iOS/i.test(path)) return null;

  var field = null;
  if (/^(Overline)$/i.test(name)) field = 'Eyebrow';
  else if (/^(Hedline|Hed|Header|Headline)$/i.test(name)) field = 'Headline';
  else if (/^(Dek|Body)$/i.test(name) || /Legal - Footer Info/i.test(path)) field = 'Body copy';
  else if (/^Button Text$/i.test(name)) field = 'CTA';
  if (!field) return null;

  var y = textNode.absoluteTransform ? textNode.absoluteTransform[1][2] : 0;
  var panel = 'P1';
  if (/Hgroup Block/i.test(path) || /^Styles subject to availability/i.test(value)) panel = 'P2';
  if (context.participatingY !== null && y >= context.participatingY && (context.finalLegalY === null || y < context.finalLegalY)) panel = 'P3';
  if (/^Participating Stores$/i.test(value)) panel = 'P3';
  if (/^\*Ends\b/i.test(value)) panel = context.participatingY !== null ? 'P4' : 'P3';
  if (context.finalLegalY !== null && y >= context.finalLegalY) panel = context.participatingY !== null ? 'P4' : 'P3';
  return { panel: panel, field: field };
}

// NSP Email uses the Retention panel convention on image/assets while its
// Emailify text layers remain visibly named. Inherit the nearest preceding
// [P#] asset anchor so the copy document retains P1/P2/P5 sections.
function getNspVisibleCopyMeta(textNode, root, context) {
  var path = getNodePathWithin(textNode, root);
  var name = String(textNode.name || '').trim();
  var value = String(textNode.characters || '').trim();
  if (!value || /Specs|Email Footer|Category Nav|Status Bar|Global Navigation|Promo 3:4|DT Hero|Label > Specs/i.test(path)) return null;

  if (/Email Header.*Subject/i.test(path)) {
    if (/^(Nike|To:|Alice)$/i.test(value) || value.length === 1) return null;
    return { panel: null, field: /^Label$/i.test(name) ? 'Subject Line' : 'Pre-header' };
  }

  var field = null;
  if (/^Strictly limited quantities\. Available while stocks last\.?$/i.test(value)) field = 'T&Cs';
  else if (/T&Cs|Legal - Footer Info/i.test(path)) field = 'T&Cs';
  else if (/^(Eyebrow|Overline)$/i.test(name)) field = 'Eyebrow';
  else if (/^(Display Title|Headline|Hedline|Hed|Header)$/i.test(name)) field = 'Headline';
  else if (/^(Body|Dek)$/i.test(name)) field = 'Body copy';
  else if (/Button|CTA|Learn More/i.test(name)) field = 'CTA';
  else if (/Email Doorway.*Header/i.test(path) && /^Title$/i.test(name)) field = 'Heading';
  else if (/Shopping With Us is Easy/i.test(path) && /^Title$/i.test(name)) {
    field = /^Shopping With Us is Easy$/i.test(value) ? 'Heading' : 'CTA';
  }
  else if (/Paragraph \(Row For Content Columns\)/i.test(path) && /Text/i.test(name)) {
    if (/^Nike Melbourne Central$/i.test(value)) field = 'Store name';
    else if (/\bShop\s+\d+|\bLa Trobe Street\b|\bMelbourne\s+VIC\b/i.test(value)) field = 'Address';
    else field = 'Store details';
  }
  if (!field) return null;

  var y = textNode.absoluteTransform ? textNode.absoluteTransform[1][2] : 0;
  var panel = 'P1';
  var anchors = context.nspPanelAnchors || [];
  for (var i = 0; i < anchors.length; i++) {
    if (anchors[i].y <= y) panel = anchors[i].panel;
    else break;
  }
  if (field === 'T&Cs' && !/Legal - Footer Info/i.test(path)) panel = 'P1';
  if (/\bThe Nike App\b|Unlock member access/i.test(name + ' ' + value + ' ' + path)) panel = 'P5';
  if (/Shopping With Us is Easy/i.test(path)) panel = 'P5';
  return { panel: panel, field: field };
}

function getMidSeasonVisibleCopyMeta(textNode, root) {
  var path = getNodePathWithin(textNode, root);
  var scope = String(root && root.name || '') + ' > ' + path;
  var name = String(textNode.name || '').trim();
  var value = String(textNode.characters || '').trim();
  if (!value || /Specs|Global Navigation|Status Bar|Component properties|Annotation/i.test(path)) return null;
  var field = null;
  if (/EDIT HERE > Text layers/i.test(path)) {
    if (/^\d+\s+day/i.test(value)) return null;
    field = /> Frame/i.test(path) ? 'Preview' : 'Headline';
  }
  else if (/subject/i.test(name + ' ' + path)) field = 'Subject Line';
  else if (/pre.?header|preview/i.test(name)) field = 'Preview';
  else if (/eyebrow|overline/i.test(name)) field = 'Eyebrow';
  else if (/headline|hedline|^hed$|^header$/i.test(name)) field = 'Headline';
  else if (/body|dek|description|legal/i.test(name)) field = 'Body copy';
  else if (/button|cta/i.test(name)) field = 'CTA';
  else if (/link/i.test(name)) field = 'Link';
  else if (/Nike\.com/i.test(scope) && /^Up\s+To\s+\d+%\s+Off/i.test(name)) field = 'Headline';
  else if (/Nike\.com/i.test(scope) && /^(Ticker Item\s*\/\s*Text|Date\s*\d+|New Styles Added|Mid Season Sale Is Here)$/i.test(name)) field = 'Copy';
  else if (/Nike\.com/i.test(scope) && /^(Shop|Download Now|Learn More|Explore)$/i.test(value)) field = 'CTA';
  if (!field) return null;
  return { panel: getCopyPanel(name), field: field };
}

// Selection-based copy export deliberately does not depend on a delivery
// stream or slash-path schema. It recognises the semantic layer vocabulary
// shared by current NVS, Promo and Email comps while excluding presentation
// chrome and working annotations.
function getSelectedVisibleCopyMeta(textNode, root) {
  var path = getNodePathWithin(textNode, root);
  var scope = String(root && root.name || '') + ' > ' + path;
  var name = String(textNode.name || '').trim();
  var value = String(textNode.characters || '').trim();
  if (!value || /(?:^|\b)(Specs?|Annotation|Component properties|Status Bar|Global Navigation|Category Nav)(?:\b|$)/i.test(scope)) return null;
  if (/^(Divider|Section Title|Cover)$/i.test(String(root && root.name || '').trim())) return null;

  var field = null;
  if (/subject/i.test(name + ' ' + path)) field = 'Subject Line';
  else if (/pre.?header|preview(?:\s+text)?/i.test(name)) field = 'Pre-header';
  else if (/eyebrow|overline/i.test(name)) field = 'Eyebrow';
  else if (/^(display\s+title|headline|hedline|hed|header|title)$/i.test(name)) field = 'Headline';
  else if (/t&cs?|terms|legal/i.test(name + ' ' + path)) field = 'T&Cs';
  else if (/^(body(?:\s+copy)?|dek|description|paragraph|copy)$/i.test(name)) field = 'Body copy';
  else if (/button|cta/i.test(name)) field = 'CTA';
  else if (/link/i.test(name)) field = 'Link';
  else if (/store\s+name/i.test(name)) field = 'Store name';
  else if (/address/i.test(name) || /\b(?:Street|St|Road|Rd|Lane|Ln|Avenue|Ave)\b.*\b(?:VIC|NSW|QLD|WA|SA|TAS|NT|ACT)\b/i.test(value)) field = 'Address';
  else if (/Shopping With Us is Easy/i.test(path)) {
    field = /^Shopping With Us is Easy$/i.test(value) ? 'Heading' : (/shop|explore|learn|download/i.test(value) ? 'CTA' : 'Body copy');
  }
  if (!field) return null;
  return { panel: getCopyPanel(name), field: field };
}

function getSelectedCopyChannel(node) {
  var names = [];
  var current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    names.unshift(String(current.name || ''));
    current = current.parent;
  }
  var scope = names.join(' / ');
  if (/retail(?:or|er)s?\s+email|\bRTL\b/i.test(scope)) return 'Retailors Email';
  if (/nike\s+email|(?:^|[\s/_[(-])email(?:$|[\s/_)\]-])/i.test(scope)) return 'Nike Email';
  if (/nike\s+app|(?:^|[\s/_[(-])app(?:$|[\s/_)\]-])/i.test(scope)) return 'Nike App';
  return 'Unclassified';
}

function getSelectedCopyPosition(node) {
  var transform = node && node.absoluteTransform;
  return {
    x: transform ? transform[0][2] : Number(node && node.x) || 0,
    y: transform ? transform[1][2] : Number(node && node.y) || 0
  };
}

function collectSelectedCopyFrames(selection) {
  var candidates = [];
  var seen = {};
  var directTypes = { FRAME: 1, COMPONENT: 1, COMPONENT_SET: 1, INSTANCE: 1 };

  function addCandidate(node) {
    if (!node || seen[node.id] || isHiddenForExport(node) || isWorkingFrame(node)) return;
    seen[node.id] = true;
    candidates.push(node);
  }

  function expandContainer(node) {
    if (!node || isHiddenForExport(node)) return;
    if (directTypes[node.type]) {
      var layers = extractText(node.id, { includeSelectedSemanticCopy: true });
      if (layers.length) { addCandidate(node); return; }
    }
    if (node.children) {
      for (var i = 0; i < node.children.length; i++) expandContainer(node.children[i]);
    }
  }

  for (var i = 0; i < (selection || []).length; i++) {
    var selected = selection[i];
    if (directTypes[selected.type]) addCandidate(selected);
    else expandContainer(selected);
  }
  return candidates.sort(function(a, b) {
    var ap = getSelectedCopyPosition(a);
    var bp = getSelectedCopyPosition(b);
    return ap.y - bp.y || ap.x - bp.x;
  });
}

// ── Text extraction ───────────────────────────
function extractText(frameId, options) {
  try {
    var node = figma.getNodeById(frameId);
    if (!node) return [];
    if (options && options.includeSelectedSemanticCopy && /^(Divider|Section Title|Cover)$/i.test(String(node.name || '').trim())) return [];
    var seen    = {};
    var results = [];
    var context = { participatingY: null, finalLegalY: null, nspPanelAnchors: [] };
    if (options && options.includeVisibleNvsCopy && node.findAll) {
      var contextTexts = node.findAll(function(child) { return child.type === 'TEXT' && child.visible !== false; });
      for (var contextIndex = 0; contextIndex < contextTexts.length; contextIndex++) {
        var contextValue = (contextTexts[contextIndex].characters || '').trim();
        var contextY = contextTexts[contextIndex].absoluteTransform ? contextTexts[contextIndex].absoluteTransform[1][2] : 0;
        if (/^Participating Stores$/i.test(contextValue)) context.participatingY = contextY;
        if (/^\*Ends\b/i.test(contextValue)) context.finalLegalY = contextY;
      }
    }
    if (options && options.includeVisibleNspCopy && node.findAll) {
      var panelNodes = node.findAll(function(child) { return child.visible !== false && !!getCopyPanel(child.name); });
      context.nspPanelAnchors = panelNodes.map(function(panelNode) {
        return {
          panel: getCopyPanel(panelNode.name),
          y: panelNode.absoluteTransform ? panelNode.absoluteTransform[1][2] : 0
        };
      }).sort(function(a, b) { return a.y - b.y; });
    }

    function walk(n, absY, insideShoppingTout, inheritedPanel) {
      try {
        if (options && options.includeSelectedSemanticCopy ? isHiddenForExport(n) : isUnavailableForExport(n)) return;
        var nodeY      = absY + (typeof n.y === 'number' ? n.y : 0);
        var assetLabel = getAssetTag(n.name);
        // Panel tags are often placed on a containing frame/group rather than
        // repeated on every copy and asset-reference layer. Carry the nearest
        // panel down the tree, while allowing a layer's own [P#] tag to win.
        var ownPanel   = getCopyPanel(n.name);
        var nodePanel  = ownPanel || inheritedPanel || null;
        var inShoppingTout = insideShoppingTout || /shopping\s+with\s+us\s+is\s+easy/i.test(n.name || '');

        if (assetLabel !== null) {
          var assetPanel = getPanelFromAsset(n.name) || inheritedPanel || null;
          var assetKey   = (assetPanel || 'none') + '::__asset__::' + assetLabel.toLowerCase();
          if (!seen[assetKey]) {
            seen[assetKey] = true;
            results.push({ panel: assetPanel, layer: '__asset__', assetLabel: assetLabel, text: null, placeholder: false, isAsset: true, y: nodeY });
          }
          return;
        }

        var copyLayerMatches = options && options.includeSelectedSemanticCopy
          ? isSelectedSemanticCopyLayer(n.name)
          : options && (options.includeVisibleNvsCopy || options.includeVisibleNspCopy || options.includeVisibleMidSeasonCopy)
            ? isCopyLayer(n.name)
            : isRetentionCopyLayer(n.name);
        if (n.type === 'TEXT' && options && options.includeVisibleNspCopy) {
          var nspMeta = getNspVisibleCopyMeta(n, node, context);
          if (nspMeta) {
            var nspKey = (nspMeta.panel || 'none') + '::' + nspMeta.field.toLowerCase() + '::' + (n.id || nodeY);
            if (!seen[nspKey]) {
              seen[nspKey] = true;
              results.push({ panel: nspMeta.panel, layer: nspMeta.field, text: n.characters, runs: getTextRuns(n), placeholder: isPlaceholder(n.characters), link: getTextHyperlink(n), isAsset: false, y: nodeY });
            }
          }
        } else if (n.type === 'TEXT' && copyLayerMatches) {
          var selectedLayerMeta = options && options.includeSelectedSemanticCopy ? getSelectedVisibleCopyMeta(n, node) : null;
          var panel = (selectedLayerMeta && selectedLayerMeta.panel) || getCopyPanel(n.name) || inheritedPanel || null;
          var field = selectedLayerMeta ? selectedLayerMeta.field : (options && options.includeSelectedSemanticCopy ? getSelectedCopyField(n.name) : getCopyField(n.name));
          if (!field) { if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i], nodeY, inShoppingTout, nodePanel); return; }
          // Multiple CTAs can legitimately share the same [COPY] layer name
          // within P5. Keep every distinct text layer rather than collapsing
          // them by field name.
          var key = (panel || 'none') + '::' + field.toLowerCase() + '::' + (n.id || nodeY);
          if (!seen[key]) {
            seen[key] = true;
            results.push({ panel: panel, layer: field, text: n.characters, runs: getTextRuns(n), placeholder: isPlaceholder(n.characters), link: getTextHyperlink(n), isAsset: false, shoppingTout: inShoppingTout, y: nodeY });
          }
        } else if (n.type === 'TEXT' && options && options.includeVisibleNvsCopy) {
          var visibleMeta = getNvsVisibleCopyMeta(n, node, context);
          if (visibleMeta) {
            var visibleKey = (visibleMeta.panel || 'none') + '::' + visibleMeta.field.toLowerCase() + '::' + (n.id || nodeY);
            if (!seen[visibleKey]) {
              seen[visibleKey] = true;
              results.push({ panel: visibleMeta.panel, layer: visibleMeta.field, text: n.characters, runs: getTextRuns(n), placeholder: isPlaceholder(n.characters), link: getTextHyperlink(n), isAsset: false, y: nodeY });
            }
          }
        } else if (n.type === 'TEXT' && options && options.includeVisibleMidSeasonCopy) {
          var midSeasonMeta = getMidSeasonVisibleCopyMeta(n, node);
          if (midSeasonMeta) {
            var midSeasonKey = (midSeasonMeta.panel || 'none') + '::' + midSeasonMeta.field.toLowerCase() + '::' + (n.id || nodeY);
            if (!seen[midSeasonKey]) {
              seen[midSeasonKey] = true;
              results.push({ panel: midSeasonMeta.panel, layer: midSeasonMeta.field, text: n.characters, runs: getTextRuns(n), placeholder: isPlaceholder(n.characters), link: getTextHyperlink(n), isAsset: false, y: nodeY });
            }
          }
        } else if (n.type === 'TEXT' && options && options.includeSelectedSemanticCopy) {
          var selectedMeta = getSelectedVisibleCopyMeta(n, node);
          if (selectedMeta) {
            var selectedKey = (selectedMeta.panel || 'none') + '::' + selectedMeta.field.toLowerCase() + '::' + (n.id || nodeY);
            if (!seen[selectedKey]) {
              seen[selectedKey] = true;
              results.push({ panel: selectedMeta.panel, layer: selectedMeta.field, text: n.characters, runs: getTextRuns(n), placeholder: isPlaceholder(n.characters), link: getTextHyperlink(n), isAsset: false, y: nodeY });
            }
          }
        } else if (n.type === 'TEXT' && inShoppingTout && !isPlaceholder(n.characters)) {
          // Shopping With Us is Easy is a maintained component, so its visible
          // text is valid delivery copy even when its internal layers are not
          // tagged. Inherit the component's [P#] tag; older untagged campaign
          // files retain P5 as their backward-compatible default.
          var toutText = (n.characters || '').trim();
          var toutField = /^shopping\s+with\s+us\s+is\s+easy$/i.test(toutText) ? 'Heading' :
            (isShoppingToutAsset(toutText) ? 'CTA' : 'Body Copy');
          var toutPanel = nodePanel || 'P5';
          var toutKey = toutPanel + '::shopping-tout::' + (n.id || nodeY);
          if (!seen[toutKey]) {
            seen[toutKey] = true;
            results.push({ panel: toutPanel, layer: toutField, text: n.characters, runs: getTextRuns(n), placeholder: false, link: getTextHyperlink(n), isAsset: false, shoppingTout: true, y: nodeY });
          }
        }
        if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i], nodeY, inShoppingTout, nodePanel);
      } catch(e) {}
    }
    walk(node, 0, false, null);

    results.sort(function(a, b) {
      var ap = a.panel || '';
      var bp = b.panel || '';
      if (ap !== bp) {
        if (!ap) return -1;
        if (!bp) return 1;
        return ap.localeCompare(bp);
      }
      var pinAsset = (ap === '' || ap === 'P1');
      if (pinAsset) {
        if (a.isAsset && !b.isAsset) return -1;
        if (!a.isAsset && b.isAsset) return 1;
      }
      return a.y - b.y;
    });
    return results;
  } catch(e) {
    return [];
  }
}

// ── Dedicated Copy Source collection ─────────
// A Design Space may contain Copy Source/Nike App and Copy Source/Nike Email
// sections. The first exportable frame below each channel is the document's
// copy source; its [COPY] and [ASSET] layers are read without touching comps.
function collectCopySourceFrames(node, ancestry, frames) {
  if (!node.children || isUnavailableForExport(node)) return;
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    if (isUnavailableForExport(child)) continue;
    var next = child.type === 'SECTION' ? ancestry.concat(child.name) : ancestry;
    if (isExportable(child)) {
      var hasCopySource = ancestry.some(function(part) {
        return part.toLowerCase().trim() === 'copy source';
      });
      var channel = getChannelFromSections(ancestry);
      if (hasCopySource && channel) frames.push({ node: child, channel: channel });
    } else {
      collectCopySourceFrames(child, next, frames);
    }
  }
}

async function extractCopySource(pageId) {
  var page = figma.root.findChild(function(n) { return n.id === pageId; });
  if (!page) return [];
  try { if (figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page); } catch(e) {}
  var sources = [];
  collectCopySourceFrames(page, [], sources);
  var result = [];
  for (var i = 0; i < sources.length; i++) {
    var layers = extractText(sources[i].node.id);
    if (layers.length) {
      result.push({
        frameName: sources[i].node.name,
        cleanLabel: sources[i].node.name.replace(/\[[^\]]*\]/g, '').trim(),
        layers: layers,
        channel: sources[i].channel
      });
    }
  }
  return result;
}

function normaliseAssetReferenceLabel(label) {
  var clean = (label || '').replace(/^\[(.+)\]$/, '$1').replace(/\s+/g, ' ').trim().toLowerCase();
  if (/^(dt|mb)\s+hero$/.test(clean)) return 'hero';
  return clean;
}

function normaliseTargetedAssetDedupeLabel(label) {
  var clean = (label || '').replace(/^\[(.+)\]$/, '$1').replace(/\s+/g, ' ').trim().toLowerCase();
  return /^(dt|mb)\s+hero$/.test(clean) ? clean : normaliseAssetReferenceLabel(clean);
}

function getTargetedAssetReferenceIdentity(item) {
  return [item && item.assetGroup || '', normaliseAssetReferenceLabel(item && item.assetLabel)].join('::');
}

function collapseTargetedHeroReferences(refs) {
  var hasDt = refs.some(function(ref) { return /^DT\s+Hero$/i.test(ref.assetLabel || ''); });
  var hasMb = refs.some(function(ref) { return /^MB\s+Hero$/i.test(ref.assetLabel || ''); });
  if (!hasDt || !hasMb) return refs;
  var added = false;
  return refs.reduce(function(output, ref) {
    if (/^(DT|MB)\s+Hero$/i.test(ref.assetLabel || '')) {
      if (!added) { output.push(Object.assign({}, ref, { assetLabel: 'Hero' })); added = true; }
    } else output.push(ref);
    return output;
  }, []);
}

function sortTargetedAssetReferencesByLayout(refs) {
  var positioned = refs.filter(function(ref) {
    return Number.isFinite(ref.absoluteY) && Number.isFinite(ref.absoluteX);
  }).sort(function(a, b) {
    return a.absoluteY - b.absoluteY || a.absoluteX - b.absoluteX;
  });
  var rows = [];
  positioned.forEach(function(ref) {
    var row = rows[rows.length - 1];
    // Figma tiles on one visual row can be a few pixels out of alignment.
    if (!row || Math.abs(ref.absoluteY - row.y) > 8) {
      row = { y: ref.absoluteY, refs: [] };
      rows.push(row);
    }
    row.refs.push(ref);
  });
  var ordered = [];
  rows.forEach(function(row) {
    row.refs.sort(function(a, b) { return a.absoluteX - b.absoluteX; });
    ordered = ordered.concat(row.refs);
  });
  var unpositioned = refs.filter(function(ref) {
    return !Number.isFinite(ref.absoluteY) || !Number.isFinite(ref.absoluteX);
  }).sort(function(a, b) {
    return (Number.isFinite(a.sourceOrder) ? a.sourceOrder : a.__sourceOrder) -
      (Number.isFinite(b.sourceOrder) ? b.sourceOrder : b.__sourceOrder);
  });
  return ordered.concat(unpositioned);
}

// Unlike Retention, an NVS scan contains both phases and all channels at
// once. Keep slice references inside their exact stream and add shared Email
// assets to both AU and NZ comp-copy sections.
function mergeTargetedAssetReferences(copyData, assetReferences) {
  var grouped = {};
  assetReferences.forEach(function(ref, sourceOrder) {
    if (!ref || !ref.phase || !ref.channel || !ref.assetLabel || ref.isShoppingTout) return;
    var key = [ref.phase, ref.copyType || '', ref.channel, ref.panel || '__none__'].join('::');
    if (!grouped[key]) grouped[key] = [];
    if (!grouped[key].some(function(existing) {
      return existing.assetLabel.toLowerCase() === ref.assetLabel.toLowerCase() &&
        (existing.assetGroup || '') === (ref.assetGroup || '') && (existing.market || '') === (ref.market || '');
    })) {
      grouped[key].push(Object.assign({}, ref, { __sourceOrder: sourceOrder }));
    }
  });

  Object.keys(grouped).forEach(function(key) {
    var groupRefs = grouped[key];
    var sample = groupRefs[0];
    var targets = copyData.filter(function(frame) {
      return frame.phase === sample.phase && frame.channel === sample.channel && (!sample.copyType || frame.copyType === sample.copyType);
    });
    if (sample.channel === 'Nike App' && sample.copyType !== 'Thread') {
      var inboxTargets = targets.filter(function(frame) { return /inbox/i.test(frame.cleanLabel || frame.frameName || ''); });
      if (inboxTargets.length) targets = inboxTargets;
    }
    if (!targets.length) {
      var created = { frameName: sample.copyType || sample.channel, cleanLabel: sample.copyType || '', layers: [], channel: sample.channel, phase: sample.phase, copyType: sample.copyType || '' };
      copyData.push(created); targets = [created];
    }
    targets.forEach(function(target) {
      var matchingRefs = groupRefs.filter(function(ref) {
        return !ref.market || ref.market === (target.market || '');
      });
      var refs = [];
      matchingRefs.forEach(function(ref) {
        var label = [ref.assetGroup || '', normaliseTargetedAssetDedupeLabel(ref.assetLabel)].join('::');
        var duplicateIndex = refs.findIndex(function(existing) {
          return [existing.assetGroup || '', normaliseTargetedAssetDedupeLabel(existing.assetLabel)].join('::') === label;
        });
        if (duplicateIndex === -1) refs.push(ref);
        else if (ref.market && !refs[duplicateIndex].market) refs[duplicateIndex] = ref;
      });
      refs = collapseTargetedHeroReferences(sortTargetedAssetReferencesByLayout(refs));
      if (!refs.length) return;
      var labels = {};
      var groupedLabels = {};
      refs.forEach(function(ref) {
        labels[getTargetedAssetReferenceIdentity(ref)] = true;
        if (ref.assetGroup) groupedLabels[normaliseAssetReferenceLabel(ref.assetLabel)] = true;
      });
      var collapsedHeroLabel = refs.some(function(ref) { return ref.assetLabel === 'Hero'; }) ? 'Hero' : null;
      // The comp is the presentation authority for copy order. Preserve its
      // existing asset references in their extracted vertical order, while
      // collapsing duplicate responsive labels such as DT/MB Hero.
      var existingLabels = {};
      target.layers = target.layers.filter(function(layer) {
        if (!layer.isAsset) return true;
        var normalisedLabel = normaliseAssetReferenceLabel(layer.assetLabel);
        if (!layer.assetGroup && groupedLabels[normalisedLabel]) return false;
        var identity = getTargetedAssetReferenceIdentity(layer);
        if (!labels[identity]) return true;
        if (existingLabels[identity]) return false;
        existingLabels[identity] = true;
        if (normalisedLabel === 'hero' && collapsedHeroLabel) layer.assetLabel = collapsedHeroLabel;
        return true;
      });
      var automatic = refs.filter(function(ref) {
        return !existingLabels[getTargetedAssetReferenceIdentity(ref)];
      }).map(function(ref, index) {
        return { panel: ref.panel || null, layer: '__asset__', assetLabel: ref.assetLabel, assetGroup: ref.assetGroup || null, text: null, placeholder: false, isAsset: true, automaticAsset: true, y: -1000000 + index };
      });
      if (automatic.length) {
        var insertAt = target.layers.length;
        for (var layerIndex = 0; layerIndex < target.layers.length; layerIndex++) {
          if (target.layers[layerIndex].panel === (sample.panel || null) && !target.layers[layerIndex].isAsset) {
            insertAt = layerIndex;
            break;
          }
        }
        target.layers.splice.apply(target.layers, [insertAt, 0].concat(automatic));
      }
    });
  });
  return copyData;
}

// Merge every ordinary slice from the matching Design Space Week into its
// channel's copy document. [P#] remains an optional placement hint only.
// Legacy [ASSET] entries are retained unless the same Design Space asset was
// auto-detected, preventing duplicate references without breaking old files.
// The approved Email hand-off has independent Explore More, Swoosh and
// shopping panels. Resolve these after merging assets so inherited or stale
// panel tags cannot combine the modules, and numbering adapts to the campaign.
function separateRetentionEmailPanels(copyData) {
  copyData.forEach(function(frame) {
    if (frame.channel !== 'Nike Email') return;
    var layers = frame.layers || [];
    var exploreHeading = layers.find(function(layer) { return /^explore\s+more$/i.test(String(layer.text || '').trim()); });
    var shoppingHeading = layers.find(function(layer) { return /^shopping\s+with\s+us\s+is\s+easy$/i.test(String(layer.text || '').trim()); });
    if (!exploreHeading && !shoppingHeading && !layers.some(function(layer) { return layer.shoppingTout; })) return;
    var explore = [], shopping = [], swoosh = [], ordinary = [];
    var ordered = layers.slice().sort(function(a, b) { return (a.y || 0) - (b.y || 0); });
    var currentModule = null;
    ordered.forEach(function(layer) {
      if (layer === exploreHeading) currentModule = 'explore';
      if (layer === shoppingHeading) currentModule = 'shopping';
      if (layer.isAsset && /swoosh\s+footer/i.test(layer.assetLabel || '')) { swoosh.push(layer); return; }
      if (!layer.isAsset && /^(subject( line)?|pre[- ]?header|preview text)$/i.test(layer.layer || '')) { ordinary.push(layer); return; }
      if (layer.shoppingTout || currentModule === 'shopping') shopping.push(layer);
      else if (currentModule === 'explore' || (exploreHeading && layer.isAsset && layer.panel === exploreHeading.panel && /done in authoring/i.test(layer.assetLabel || ''))) explore.push(layer);
      else ordinary.push(layer);
    });
    var lastPanel = ordinary.reduce(function(max, layer) {
      var match = /^P(\d+)$/i.exec(layer.panel || '');
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    if (explore.length) {
      var explorePanel = 'P' + (++lastPanel);
      explore.forEach(function(layer) { layer.panel = explorePanel; });
    }
    if (shopping.length || swoosh.length) {
      var swooshPanel = 'P' + (++lastPanel);
      if (!swoosh.length) swoosh.push({ layer: '__asset__', assetLabel: 'Swoosh Footer', isAsset: true, placeholder: false, y: 0 });
      swoosh = [swoosh[0]];
      swoosh[0].panel = swooshPanel;
    }
    if (shopping.length) {
      var shoppingPanel = 'P' + (++lastPanel);
      shopping.forEach(function(layer) {
        layer.panel = shoppingPanel;
        if (/^shopping\s+with\s+us\s+is\s+easy$/i.test(String(layer.text || '').trim())) layer.layer = 'Heading';
      });
    }
    frame.layers = ordinary.concat(explore, swoosh, shopping);
  });
  return copyData;
}

function mergeAutomaticAssetReferences(copyData, assetReferences) {
  if (!assetReferences || !assetReferences.length) return copyData;
  if (assetReferences.some(function(ref) { return ref && ref.phase; })) return mergeTargetedAssetReferences(copyData, assetReferences);
  var grouped = {}, order = [];

  for (var i = 0; i < assetReferences.length; i++) {
    var ref = assetReferences[i];
    if (!ref || !ref.channel || !ref.assetLabel || ref.isShoppingTout) continue;
    var key = ref.channel + '::' + (ref.panel || '__none__') + '::' + (ref.targetComp || '__any__');
    if (!grouped[key]) { grouped[key] = []; order.push(key); }
    var exists = grouped[key].some(function(item) {
      return item.assetLabel.toLowerCase() === ref.assetLabel.toLowerCase();
    });
    if (!exists) grouped[key].push(ref);
  }

  var retentionAssetOrder = { Header: 0, Hero: 1, Supporting: 2, Footer: 3, Inbox: 4 };
  for (var sortIndex = 0; sortIndex < order.length; sortIndex++) {
    grouped[order[sortIndex]] = grouped[order[sortIndex]].map(function(item, index) {
      item.__designOrder = index;
      return item;
    }).sort(function(a, b) {
      var aGroup = a.assetGroup || getRetentionSliceSubfolder(a.assetLabel) || 'Inbox';
      var bGroup = b.assetGroup || getRetentionSliceSubfolder(b.assetLabel) || 'Inbox';
      var groupDifference = (retentionAssetOrder[aGroup] === undefined ? 99 : retentionAssetOrder[aGroup]) -
        (retentionAssetOrder[bGroup] === undefined ? 99 : retentionAssetOrder[bGroup]);
      return groupDifference || a.__designOrder - b.__designOrder;
    });
  }

  // Desktop and mobile Hero files remain separate delivery exports, but the
  // copy document only needs one shared asset reference when both exist.
  for (var g = 0; g < order.length; g++) {
    var heroGroup = grouped[order[g]];
    var hasDtHero = heroGroup.some(function(item) { return /^DT\s+Hero$/i.test(item.assetLabel.trim()); });
    var hasMbHero = heroGroup.some(function(item) { return /^MB\s+Hero$/i.test(item.assetLabel.trim()); });
    if (hasDtHero && hasMbHero) {
      var collapsed = [];
      var heroAdded = false;
      for (var h = 0; h < heroGroup.length; h++) {
        if (/^(DT|MB)\s+Hero$/i.test(heroGroup[h].assetLabel.trim())) {
          if (!heroAdded) {
            collapsed.push({ channel: heroGroup[h].channel, panel: heroGroup[h].panel, assetLabel: 'Hero' });
            heroAdded = true;
          }
        } else {
          collapsed.push(heroGroup[h]);
        }
      }
      grouped[order[g]] = collapsed;
    }
  }

  for (var o = 0; o < order.length; o++) {
    var groupKey = order[o];
    var keyParts = groupKey.split('::');
    var channel = keyParts[0];
    var panelKey = keyParts[1];
    var targetComp = keyParts[2] === '__any__' ? null : keyParts[2];
    var panel = panelKey === '__none__' ? null : panelKey;
    var target = null;
    var firstChannelTarget = null;

    for (var f = 0; f < copyData.length; f++) {
      if (copyData[f].channel !== channel) continue;
      if (!firstChannelTarget) firstChannelTarget = copyData[f];
      var sourceLabel = ((copyData[f].cleanLabel || '') + ' ' + (copyData[f].frameName || '')).toLowerCase();
      if (targetComp === 'spotlight' && sourceLabel.indexOf('spotlight') !== -1) { target = copyData[f]; break; }
      if (targetComp === 'push-and-inbox' && /push notification|inbox/.test(sourceLabel)) { target = copyData[f]; break; }
      if (targetComp) continue;
      if (!target) target = copyData[f];
      if (panel) {
        var containsPanel = copyData[f].layers.some(function(layer) { return layer.panel === panel; });
        if (containsPanel) { target = copyData[f]; break; }
      }
    }
    if (!target) target = firstChannelTarget;
    if (!target) {
      target = { frameName: channel, cleanLabel: '', layers: [], channel: channel };
      copyData.push(target);
    }

    var automaticLabels = {};
    grouped[groupKey].forEach(function(item) {
      automaticLabels[normaliseAssetReferenceLabel(item.assetLabel)] = true;
    });
    for (var cd = 0; cd < copyData.length; cd++) {
      if (copyData[cd].channel !== channel) continue;
      copyData[cd].layers = copyData[cd].layers.filter(function(layer) {
        if (!layer.isAsset) return true;
        return !automaticLabels[normaliseAssetReferenceLabel(layer.assetLabel)];
      });
    }
    var automatic = grouped[groupKey].map(function(item, index) {
      return {
        panel: panel,
        layer: '__asset__',
        assetLabel: item.assetLabel,
        text: null,
        placeholder: false,
        isAsset: true,
        automaticAsset: true,
        y: -1000000 + index
      };
    });
    target.layers = automatic.concat(target.layers);
  }
  return copyData;
}

// ── Safe export ───────────────────────────────
function isGifFileBytes(bytes) {
  return !!bytes && bytes.length >= 6 &&
    bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56 &&
    (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97;
}

var GIF_CHILD_CONTAINER_TYPES = {
  DOCUMENT: 1, PAGE: 1, FRAME: 1, GROUP: 1, COMPONENT_SET: 1,
  COMPONENT: 1, INSTANCE: 1, BOOLEAN_OPERATION: 1, SECTION: 1
};
var GIF_REVERSE_Z_TYPES = { FRAME: 1, COMPONENT_SET: 1, COMPONENT: 1, INSTANCE: 1 };

function getChildrenFrontToBack(node) {
  if (!node || !GIF_CHILD_CONTAINER_TYPES[node.type]) return [];
  var children = Array.prototype.slice.call(node.children);
  // Figma normally paints the last child on top. Auto-layout can explicitly
  // reverse that z-order, in which case the first child is topmost.
  return GIF_REVERSE_Z_TYPES[node.type] && node.itemReverseZIndex === true ? children : children.reverse();
}

function isHiddenForGifExtraction(node) {
  var current = node;
  while (current) {
    if (current.visible === false || current.opacity === 0) return true;
    current = current.parent;
  }
  return false;
}

async function findTopVisibleGifSource(node) {
  if (!node || isHiddenForGifExtraction(node)) return null;

  var firstError = null;
  var children = getChildrenFrontToBack(node);
  for (var childIndex = 0; childIndex < children.length; childIndex++) {
    var childSource = await findTopVisibleGifSource(children[childIndex]);
    if (childSource && childSource.bytes) return childSource;
    if (!firstError && childSource && childSource.error) firstError = childSource.error;
  }

  // Figma stores uploaded images as IMAGE paints. They may be used as either
  // strokes or fills, with strokes painted above fills.
  var paintCollections = [
    'strokes' in node ? node.strokes : null,
    'fills' in node ? node.fills : null
  ];
  for (var collectionIndex = 0; collectionIndex < paintCollections.length; collectionIndex++) {
    var paints = paintCollections[collectionIndex];
    if (!Array.isArray(paints)) continue;
    for (var paintIndex = 0; paintIndex < paints.length; paintIndex++) {
      var paint = paints[paintIndex];
      if (!paint || paint.visible === false || paint.opacity === 0 || paint.type !== 'IMAGE' || !paint.imageHash) continue;
      try {
        var image = figma.getImageByHash(paint.imageHash);
        if (!image) {
          if (!firstError) firstError = 'A visible image is unavailable';
          continue;
        }
        var bytes = await image.getBytesAsync();
        if (isGifFileBytes(bytes)) return { bytes: bytes, error: null };
        if (!firstError) firstError = 'A visible image is not a GIF';
      } catch (e) {
        if (!firstError) firstError = 'A visible image could not be read';
      }
    }
  }
  return firstError ? { bytes: null, error: firstError } : null;
}

async function safeExportFrame(job) {
  if (job.detectGif && !job.isGif) {
    try {
      var detectedGifNode = await figma.getNodeByIdAsync(job.frameId);
      if (detectedGifNode && !isHiddenForExport(detectedGifNode)) {
        var detectedGifSource = await findTopVisibleGifSource(detectedGifNode);
        if (detectedGifSource && detectedGifSource.bytes) {
          return { success: true, isGif: true, isPlaceholder: false, filename: job.filename + '.gif', subfolder: job.subfolder, bytes: detectedGifSource.bytes };
        }
      }
    } catch (ignoredGifDetectionError) {}
  }
  if (job.isGif) {
    try {
      var gifNode = await figma.getNodeByIdAsync(job.frameId);
      if (!gifNode) throw new Error('Node not found');
      if (isHiddenForExport(gifNode)) throw new Error('Item is hidden');
      var gifSource = await findTopVisibleGifSource(gifNode);
      if (gifSource && gifSource.bytes) {
        return {
          success: true,
          isGif: true,
          isPlaceholder: false,
          filename: job.filename + '.gif',
          subfolder: job.subfolder,
          bytes: gifSource.bytes
        };
      }

      var fallbackBytes = await gifNode.exportAsync({ format: 'JPG', constraint: { type: 'SCALE', value: job.scale } });
      var intendedGifFilename = job.filename + '.gif';
      return {
        success: true,
        isGif: true,
        isPlaceholder: true,
        filename: (job.fallbackFilename || (job.filename + '_[GIF TO BE EXPORTED]')) + '.jpg',
        intendedGifFilename: intendedGifFilename,
        placeholderAnnotation: 'GIF TO BE EXPORTED: ' + intendedGifFilename,
        placeholderReason: gifSource ? gifSource.error : 'No visible uploaded image was found',
        subfolder: job.subfolder,
        bytes: fallbackBytes
      };
    } catch(e) {
      return { success: false, error: String(e), filename: job.filename, subfolder: job.subfolder };
    }
  }

  try {
    var node = await figma.getNodeByIdAsync(job.frameId);
    if (!node) return { success: false, filename: job.filename, subfolder: job.subfolder, error: 'Node not found' };
    if (isUnavailableForExport(node)) return { success: false, filename: job.filename, subfolder: job.subfolder, error: 'Item is hidden or locked' };
    var bytes;
    if (job.format === 'PDF') {
      bytes = await node.exportAsync({ format: 'PDF' });
    } else {
      var safeScale = getSafeExportScale(node.width, node.height, job.scale, job.isComp, job.fileSetup);
      bytes = await node.exportAsync({ format: job.format.toUpperCase(), constraint: { type: 'SCALE', value: safeScale } });
    }
    return { success: true, isPlaceholder: false, filename: job.filename + '.' + job.format.toLowerCase(), subfolder: job.subfolder, bytes: bytes };
  } catch(e) {
    return { success: false, filename: job.filename, subfolder: job.subfolder, error: e ? (e.message || String(e)) : 'Unknown error' };
  }
}

function getExportRenderSignature(job) {
  return [job.frameId, job.format, job.scale, job.isGif ? 'gif-source' : 'static', job.isComp ? 'comp' : 'slice', job.fileSetup].join('::');
}

function cloneExportResultForJob(rendered, job) {
  var result = {};
  for (var key in rendered) {
    if (key !== 'filename' && key !== 'subfolder' && Object.prototype.hasOwnProperty.call(rendered, key)) result[key] = rendered[key];
  }
  result.subfolder = job.subfolder;
  if (!rendered.success) {
    result.filename = job.filename;
  } else if (job.isGif && rendered.isPlaceholder) {
    result.filename = (job.fallbackFilename || (job.filename + '_[GIF TO BE EXPORTED]')) + '.jpg';
    result.intendedGifFilename = job.filename + '.gif';
    result.placeholderAnnotation = 'GIF TO BE EXPORTED: ' + result.intendedGifFilename;
  } else if (job.isGif || rendered.isGif) {
    result.filename = job.filename + '.gif';
  } else {
    result.filename = job.filename + '.' + job.format.toLowerCase();
  }
  return result;
}

// Tall Email comps can produce PNGs larger than Figma's reliable plugin-to-UI
// message payload. Stream those bytes in bounded pieces; one oversized typed
// array can otherwise terminate the export after the smaller App comps finish.
var EXPORT_RESULT_CHUNK_SIZE = 1024 * 1024;
var exportResultSequence = 0;
function postExportResult(result) {
  var bytes = result && result.bytes;
  if (!result || !result.success || !bytes || bytes.length <= EXPORT_RESULT_CHUNK_SIZE) {
    if (result) result.transportSentAt = Date.now();
    figma.ui.postMessage({ type: 'EXPORT_RESULT', result: result });
    return;
  }
  var exportId = 'export-' + (++exportResultSequence);
  var metadata = {};
  for (var key in result) {
    if (key !== 'bytes' && Object.prototype.hasOwnProperty.call(result, key)) metadata[key] = result[key];
  }
  metadata.transportSentAt = Date.now();
  figma.ui.postMessage({ type: 'EXPORT_RESULT_START', exportId: exportId, result: metadata, byteLength: bytes.length });
  for (var offset = 0; offset < bytes.length; offset += EXPORT_RESULT_CHUNK_SIZE) {
    figma.ui.postMessage({
      type: 'EXPORT_RESULT_CHUNK',
      exportId: exportId,
      bytes: bytes.slice(offset, Math.min(offset + EXPORT_RESULT_CHUNK_SIZE, bytes.length))
    });
  }
  figma.ui.postMessage({ type: 'EXPORT_RESULT_END', exportId: exportId });
}

// ── Message handler ───────────────────────────
figma.ui.onmessage = async function(msg) {

  if (msg.type === 'SCAN_PAGES') {
    var pageSummaries = getAllPages();
    figma.ui.postMessage({
      type: 'PAGES_RESULT',
      pages: pageSummaries,
      fileName: figma.root.name || '',
      hasSendMarkers: collectSendMarkers(getDesignSpacePage(), []).length > 0,
      hasNspManualPage: pageSummaries.some(function(page) { return page.nspManual; })
    });
  }

  if (msg.type === 'SCAN_FRAMES') {
    if (msg.fileSetup === 'nsp-store-appearance') {
      var nspReviewPage = figma.root.findChild(function(pageNode) { return pageNode.id === msg.pageId; });
      var nspDesignPage = getDesignSpacePage();
      var wantedManualKind = msg.role === 'comps' ? 'Comps' : 'Slices';
      // Review comps are page-specific: exporting every matching page also
      // exports obsolete review tabs/rounds. Slices remain a cross-page
      // delivery scan because manual files commonly separate their channel
      // source pages from the selected Client Review page.
      var nspManualPages = msg.role === 'comps' ? [nspReviewPage].filter(function(pageNode) {
        return pageNode && (getNspManualContainers(pageNode).some(function(container) { return container.meta.kind === wantedManualKind; }) ||
          getNspManualNamedSources(pageNode, wantedManualKind).length > 0);
      }) : figma.root.children.filter(function(pageNode) {
        return getNspManualContainers(pageNode).some(function(container) { return container.meta.kind === wantedManualKind; }) ||
          getNspManualNamedSources(pageNode, wantedManualKind).length > 0;
      });
      if (nspManualPages.length) {
        var allManualFrames = [];
        for (var manualPageIndex = 0; manualPageIndex < nspManualPages.length; manualPageIndex++) {
          if (figma.currentPage.id !== nspManualPages[manualPageIndex].id) await figma.setCurrentPageAsync(nspManualPages[manualPageIndex]);
          allManualFrames = allManualFrames.concat(getNspManualFrames(nspManualPages[manualPageIndex], msg.role, msg.options || {}));
        }
        figma.ui.postMessage({ type: 'FRAMES_RESULT', frames: allManualFrames, role: msg.role });
        return;
      }
      if (!nspReviewPage || !nspDesignPage) {
        figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: 'NSP requires Design Space and a selected Client Review page.' });
        return;
      }
      if (figma.currentPage.id !== nspDesignPage.id) await figma.setCurrentPageAsync(nspDesignPage);
      var nspPhaseNames = getNspPhaseNames(nspDesignPage);
      var nspError = !nspPhaseNames.length ? 'Design Space is missing a [PHASE] section.' : null;
      if (figma.currentPage.id !== nspReviewPage.id) await figma.setCurrentPageAsync(nspReviewPage);
      var nspReviewMarkers = getPageSendMarkers(nspReviewPage);
      if (nspPhaseNames.length > 1 && !nspReviewMarkers.length) nspError = 'Multiple [PHASE] sections were found. Add [SEND] markers to Client Review to assign its comps.';
      var nspReviewSendParts = nspReviewMarkers.length ? getNspSendParts(nspReviewMarkers[0].node) : [];
      if (nspError) {
        figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: nspError });
        return;
      }
      var nspPage = msg.role === 'slices' ? nspDesignPage : nspReviewPage;
      if (figma.currentPage.id !== nspPage.id) await figma.setCurrentPageAsync(nspPage);
      var nspFrames = getNspFrames(nspPage, msg.role, nspPhaseNames, nspReviewSendParts, msg.options || {});
      for (var nspIndex = 0; nspIndex < nspFrames.length; nspIndex++) {
        if (!nspFrames[nspIndex].sendAssignment) {
          figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: nspFrames[nspIndex].name + ' appears before the first [SEND] marker. Export stopped.' });
          return;
        }
      }
      figma.ui.postMessage({ type: 'FRAMES_RESULT', frames: nspFrames, role: msg.role });
      return;
    }
    if (msg.fileSetup === 'mid-season-promo' && msg.role === 'comps') {
      var selectedMidSeasonReview = figma.root.findChild(function(pageNode) { return pageNode.id === msg.pageId; });
      if (selectedMidSeasonReview && figma.currentPage.id !== selectedMidSeasonReview.id) await figma.setCurrentPageAsync(selectedMidSeasonReview);
    }
    if (msg.fileSetup === 'mid-season-promo' && msg.role === 'slices') {
      var midSeasonDesignSpace = getDesignSpacePage();
      if (midSeasonDesignSpace && figma.currentPage.id !== midSeasonDesignSpace.id) await figma.setCurrentPageAsync(midSeasonDesignSpace);
    }
    if (msg.fileSetup === 'targeted-comms' && msg.role === 'comps') {
      var requestedReviewPage = figma.root.findChild(function(pageNode) { return pageNode.id === msg.pageId; });
      var combinedReviewPage = figma.root.children.filter(function(pageNode) {
        return /client\s+review/i.test(pageNode.name || '') && !isArchiveContainer(pageNode);
      })[0];
      // Targeted Comms is always resolved from the combined review. The UI can
      // retain a stale campaign-page selection after a file/setup change; do
      // not let that page name become an export phase.
      if (combinedReviewPage) {
        requestedReviewPage = combinedReviewPage;
        msg.pageId = combinedReviewPage.id;
      }
      if (requestedReviewPage && /client\s+review/i.test(requestedReviewPage.name || '')) {
        var loadedCompFrames = [];
        var designSpaceForMarkers = getDesignSpacePage();
        if (designSpaceForMarkers && figma.currentPage.id !== designSpaceForMarkers.id) {
          await figma.setCurrentPageAsync(designSpaceForMarkers);
        }
        var loadedSendNames = getDesignSpaceSendNames();
        var loadedStreamPages = getTargetedStreamPageCandidates(requestedReviewPage, loadedSendNames);
        var hasExplicitDesignMarkers = collectSendMarkers(designSpaceForMarkers, []).length > 0;
        var designMarkerError = validateDesignSpaceSendMarkers(designSpaceForMarkers);
        if (figma.currentPage.id !== requestedReviewPage.id) await figma.setCurrentPageAsync(requestedReviewPage);
        var reviewMarkerError = validateSendMarkers(requestedReviewPage, loadedSendNames, hasExplicitDesignMarkers);
        if (designMarkerError || reviewMarkerError) {
          figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: designMarkerError || reviewMarkerError });
          return;
        }
        if (!loadedSendNames.length) {
          figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: 'No send sections could be resolved from Design Space. Export stopped to prevent an incorrect campaign folder.' });
          return;
        }
        for (var loadedPageIndex = 0; loadedPageIndex < loadedStreamPages.length; loadedPageIndex++) {
          var loadedStreamPage = loadedStreamPages[loadedPageIndex];
          await figma.setCurrentPageAsync(loadedStreamPage);
          loadedCompFrames = loadedCompFrames.concat(getFramesOnPage(loadedStreamPage.id, 'comps', msg.fileSetup, { includeStreamPages: false }));
        }
        await figma.setCurrentPageAsync(requestedReviewPage);
        var reviewComps = getFramesOnPage(requestedReviewPage.id, 'comps', msg.fileSetup, { includeStreamPages: false });
        // Prefer explicit divider labels on Client Review. If a legacy file
        // has none, distribute its ordered review comps across discovered
        // sibling sends instead of assuming exactly two named phases.
        var reviewX = {};
        for (var positionIndex = 0; positionIndex < reviewComps.length; positionIndex++) {
          reviewX[reviewComps[positionIndex].id] = reviewComps[positionIndex].absoluteX || 0;
        }
        var orderedReviewComps = reviewComps.slice().sort(function(a, b) {
          return reviewX[a.id] - reviewX[b.id];
        });
        var reviewPageMarkers = getPageSendMarkers(requestedReviewPage);
        var hasExplicitReviewMarkers = reviewPageMarkers.length > 0;
        var clusterBreaks = [];
        for (var gapIndex = 1; gapIndex < orderedReviewComps.length; gapIndex++) {
          clusterBreaks.push({ index: gapIndex, gap: reviewX[orderedReviewComps[gapIndex].id] - reviewX[orderedReviewComps[gapIndex - 1].id] });
        }
        clusterBreaks.sort(function(a, b) { return b.gap - a.gap; });
        clusterBreaks = clusterBreaks.slice(0, Math.max(0, loadedSendNames.length - 1)).map(function(item) { return item.index; }).sort(function(a, b) { return a - b; });
        for (var reviewIndex = 0; reviewIndex < orderedReviewComps.length; reviewIndex++) {
          var reviewNode = null;
          var explicitReviewAssignment = hasExplicitReviewMarkers
            ? { phase: orderedReviewComps[reviewIndex].sendAssignment === 'marker' ? orderedReviewComps[reviewIndex].phase : null }
            : { phase: null };
          if (hasExplicitReviewMarkers && !explicitReviewAssignment.phase) {
            figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: orderedReviewComps[reviewIndex].name + ' appears before the first [SEND] marker. Export stopped.' });
            return;
          }
          if (!hasExplicitReviewMarkers) reviewNode = await figma.getNodeByIdAsync(orderedReviewComps[reviewIndex].id);
          var reviewPhase = explicitReviewAssignment.phase || getClientReviewCompPhase(reviewNode, requestedReviewPage, loadedSendNames);
          if (!isKnownSendPhase(reviewPhase, loadedSendNames) && loadedSendNames.length) {
            var phaseIndex = 0;
            while (phaseIndex < clusterBreaks.length && reviewIndex >= clusterBreaks[phaseIndex]) phaseIndex++;
            reviewPhase = loadedSendNames[Math.min(phaseIndex, loadedSendNames.length - 1)];
          }
          orderedReviewComps[reviewIndex].phase = reviewPhase || '';
          orderedReviewComps[reviewIndex].audienceParts = reviewPhase ? [reviewPhase] : [];
          orderedReviewComps[reviewIndex].sendAssignment = explicitReviewAssignment.phase ? 'marker' : orderedReviewComps[reviewIndex].sendAssignment;
          if (/thread/i.test(orderedReviewComps[reviewIndex].name || '')) orderedReviewComps[reviewIndex].deliveryType = 'Thread';
        }
        distributeRepeatedCompPhases(orderedReviewComps, loadedSendNames, reviewX);
        for (var validationIndex = 0; validationIndex < orderedReviewComps.length; validationIndex++) {
          var assignedPhase = orderedReviewComps[validationIndex].phase;
          if (!isKnownSendPhase(assignedPhase, loadedSendNames)) {
            figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: 'Could not assign ' + orderedReviewComps[validationIndex].name + ' to a Design Space send. Export stopped.' });
            return;
          }
        }
        loadedCompFrames = loadedCompFrames.concat(orderedReviewComps);
        var uniqueLoadedComps = {};
        loadedCompFrames = loadedCompFrames.filter(function(frame) {
          if (uniqueLoadedComps[frame.id]) return false;
          uniqueLoadedComps[frame.id] = true;
          return true;
        });
        var mergedCompX = {};
        for (var mergedIndex = 0; mergedIndex < loadedCompFrames.length; mergedIndex++) {
          mergedCompX[loadedCompFrames[mergedIndex].id] = loadedCompFrames[mergedIndex].absoluteX || 0;
        }
        distributeRepeatedCompPhases(loadedCompFrames, loadedSendNames, mergedCompX);
        var compOutputMetadataError = validateTargetedCompOutputMetadata(loadedCompFrames);
        if (compOutputMetadataError) {
          figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: compOutputMetadataError });
          return;
        }
        figma.ui.postMessage({ type: 'FRAMES_RESULT', frames: loadedCompFrames, role: msg.role });
        return;
      }
    }
    // Figma pages load dynamically. NVS slices live on Design Space, so load
    // that page before walking it; otherwise a scan started from Client Review
    // can return only comps and produce a ZIP with no Slices folders.
    if (msg.fileSetup === 'targeted-comms' && msg.role === 'slices') {
      var designSpacePage = getDesignSpacePage();
      var sliceMarkerError = validateDesignSpaceSendMarkers(designSpacePage);
      if (sliceMarkerError) {
        figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: sliceMarkerError });
        return;
      }
      if (designSpacePage && figma.currentPage.id !== designSpacePage.id) {
        await figma.setCurrentPageAsync(designSpacePage);
      }
    }
    if (msg.fileSetup === 'retention-offense' && msg.role === 'slices') {
      var retentionCampaignPage = figma.root.findChild(function(pageNode) { return pageNode.id === msg.pageId; });
      var retentionDesignSpace = getDesignSpacePage();
      // Hydrate only the Retention source page. Loading every page made large
      // campaign files appear frozen and could fail before slices were read.
      if (retentionDesignSpace && figma.currentPage.id !== retentionDesignSpace.id) {
        await figma.setCurrentPageAsync(retentionDesignSpace);
      }
      var retentionWeekResolution = retentionDesignSpace && retentionCampaignPage
        ? resolveRetentionWeekSection(retentionDesignSpace, retentionCampaignPage.name)
        : { section: null, error: null };
      if (!retentionDesignSpace || !retentionCampaignPage || !retentionWeekResolution.section) {
        figma.ui.postMessage({
          type: 'SCAN_ERROR',
          role: msg.role,
          message: !retentionDesignSpace ? 'Design Space page not found.' :
            (retentionWeekResolution.error || 'Matching Week section not found in Design Space.')
        });
        return;
      }
    }
    var frames = getFramesOnPage(msg.pageId, msg.role, msg.fileSetup, msg.options || {});
    if (msg.fileSetup === 'retention-offense' && msg.role === 'slices' && !frames.length) {
      figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: 'No exportable assets found in the matching Design Space Week.' });
      return;
    }
    if (msg.fileSetup === 'targeted-comms' && msg.role === 'slices') {
      var sliceSendNames = getDesignSpaceSendNames();
      var hasExplicitSliceMarkers = collectSendMarkers(getDesignSpacePage(), []).length > 0;
      if (hasExplicitSliceMarkers) {
        for (var sliceValidationIndex = 0; sliceValidationIndex < frames.length; sliceValidationIndex++) {
          if (frames[sliceValidationIndex].sendAssignment !== 'marker' || !isKnownSendPhase(frames[sliceValidationIndex].phase, sliceSendNames)) {
            figma.ui.postMessage({ type: 'SCAN_ERROR', role: msg.role, message: frames[sliceValidationIndex].name + ' appears before the first [SEND] marker or outside a marked send block. Export stopped.' });
            return;
          }
        }
      } else {
        distributeRepeatedSlicePhases(frames, sliceSendNames);
      }
    }
    figma.ui.postMessage({ type: 'FRAMES_RESULT', frames: frames, role: msg.role });
  }

  if (msg.type === 'EXTRACT_COPY_SOURCE') {
    var sourceCopy = msg.fileSetup === 'targeted-comms' ? await extractCopySource(msg.pageId) : [];
    // Existing campaign files already tag final text layers directly inside
    // their comps. Use those as a fallback while teams transition to the
    // cleaner Copy Source setup. Shopping With Us is Easy stays additive:
    // its component copy is included even when Copy Source exists.
    if (msg.fallbackFrameIds && msg.fallbackFrameIds.length) {
      for (var fc = 0; fc < msg.fallbackFrameIds.length; fc++) {
        var fallbackId = msg.fallbackFrameIds[fc];
        var copyMeta = (msg.frameCopyMeta && msg.frameCopyMeta[fallbackId]) || {};
        var isTargetedCopy = msg.fileSetup === 'targeted-comms';
        var isNspCopy = msg.fileSetup === 'nsp-store-appearance';
        var isMidSeasonCopy = msg.fileSetup === 'mid-season-promo';
        var fallbackLayers = extractText(fallbackId, {
          includeVisibleNvsCopy: isTargetedCopy,
          includeVisibleNspCopy: isNspCopy,
          includeVisibleMidSeasonCopy: isMidSeasonCopy,
          includeSelectedSemanticCopy: isNspCopy && msg.nspManual === true
        });
        var fallbackNode = await figma.getNodeByIdAsync(fallbackId);
        if (fallbackLayers.length) {
          sourceCopy.push({
            frameName: fallbackNode ? fallbackNode.name : fallbackId,
            cleanLabel: fallbackNode ? fallbackNode.name.replace(/\[[^\]]*\]/g, '').trim() : '',
            layers: fallbackLayers,
            channel: (msg.frameChannels && msg.frameChannels[fallbackId]) || 'Nike App',
            phase: copyMeta.phase || '',
            copyType: copyMeta.type || '',
            market: copyMeta.market || ''
          });
        }
      }
    }
    sourceCopy = mergeAutomaticAssetReferences(sourceCopy, msg.assetReferences || []);
    if (msg.fileSetup === 'retention-offense') sourceCopy = separateRetentionEmailPanels(sourceCopy);
    figma.ui.postMessage({ type: 'COPY_RESULT', copyData: sourceCopy });
  }

  if (msg.type === 'SCAN_SELECTED_COPY') {
    var selectedCopyNodes = collectSelectedCopyFrames(figma.currentPage.selection || []);
    var selectedCopyFrames = [];
    for (var selectedCopyIndex = 0; selectedCopyIndex < selectedCopyNodes.length; selectedCopyIndex++) {
      var selectedCopyNode = selectedCopyNodes[selectedCopyIndex];
      var selectedCopyLayers = extractText(selectedCopyNode.id, { includeSelectedSemanticCopy: true });
      if (!selectedCopyLayers.length) continue;
      selectedCopyFrames.push({
        id: selectedCopyNode.id,
        name: selectedCopyNode.name || 'Selected frame',
        cleanLabel: selectedCopyNode.name || 'Selected frame',
        channel: getSelectedCopyChannel(selectedCopyNode),
        layers: selectedCopyLayers,
        x: getSelectedCopyPosition(selectedCopyNode).x,
        y: getSelectedCopyPosition(selectedCopyNode).y
      });
    }
    figma.ui.postMessage({ type: 'SELECTED_COPY_RESULT', frames: selectedCopyFrames });
  }

  if (msg.type === 'EXPORT_BATCH') {
    var jobs      = msg.jobs;
    var pageGroups = {}, pageOrder = [];
    var batchStartedAt = Date.now();
    var renderCache = {};
    var renderSignatureCounts = {};
    var rasterWorkMs = 0;
    function startCachedExport(cachedJob) {
      var cachedStartedAt = Date.now();
      return safeExportFrame(cachedJob).then(function(cachedResult) {
        rasterWorkMs += Date.now() - cachedStartedAt;
        return cachedResult;
      });
    }

    for (var j = 0; j < jobs.length; j++) {
      jobs[j].exportIndex = j;
      if (jobs[j].fileSetup === 'targeted-comms') {
        var countedSignature = getExportRenderSignature(jobs[j]);
        renderSignatureCounts[countedSignature] = (renderSignatureCounts[countedSignature] || 0) + 1;
      }
      var pid = jobs[j].pageId || 'unknown';
      if (!pageGroups[pid]) { pageGroups[pid] = []; pageOrder.push(pid); }
      pageGroups[pid].push(jobs[j]);
    }

    var completed = 0;
    var total     = jobs.length;

    for (var p = 0; p < pageOrder.length; p++) {
      var pid   = pageOrder[p];
      var group = pageGroups[pid];
      if (pid !== 'unknown') {
        try {
          var page = figma.root.findChild(function(n) { return n.id === pid; });
          if (page && figma.currentPage.id !== page.id) await figma.setCurrentPageAsync(page);
        } catch(e) {}
      }
      var nextGroupJob = 0;
      var groupConcurrency = group.every(function(groupJob) { return groupJob.fileSetup === 'targeted-comms'; }) ? 2 : 1;
      async function exportNextGroupJob() {
        while (nextGroupJob < group.length) {
          var job = group[nextGroupJob++];
          var startedAt = Date.now();
          figma.ui.postMessage({
            type: 'PROGRESS', completed: completed, total: total,
            status: job.isGif ? 'Exporting GIF: ' + job.label : 'Starting: ' + job.label + ' (' + job.format + ' @' + job.scale + 'x)'
          });
          var rendered;
          if (job.fileSetup === 'targeted-comms') {
            var renderSignature = getExportRenderSignature(job);
            var cacheEntry = renderCache[renderSignature];
            var ownsCachedRender = false;
            if (renderSignatureCounts[renderSignature] > 1 && !cacheEntry) {
              ownsCachedRender = true;
              cacheEntry = renderCache[renderSignature] = startCachedExport(job);
            }
            rendered = cacheEntry ? await cacheEntry : await startCachedExport(job);
            if (!rendered.success && cacheEntry && !ownsCachedRender) rendered = await startCachedExport(job);
            renderSignatureCounts[renderSignature]--;
            if (!rendered.success || renderSignatureCounts[renderSignature] <= 0) delete renderCache[renderSignature];
          } else {
            var retentionRenderStartedAt = Date.now();
            rendered = await safeExportFrame(job);
            rasterWorkMs += Date.now() - retentionRenderStartedAt;
          }
          var result = cloneExportResultForJob(rendered, job);
          result.exportIndex = job.exportIndex;
          result.elapsedMs = Date.now() - startedAt;
          // Stream each typed-array result immediately. Batching every expanded
          // image into EXPORT_COMPLETE exceeded Figma's postMessage limit once
          // Thread assets were added to the delivery.
          postExportResult(result);
          completed++;
          figma.ui.postMessage({
            type: 'PROGRESS', completed: completed, total: total,
            lastError: result.success ? null : result.error,
            status: result.success ? 'Done: ' + job.label + ' (' + (result.elapsedMs / 1000).toFixed(1) + 's)' : 'Failed: ' + result.error
          });
        }
      }
      var groupWorkers = [];
      for (var workerIndex = 0; workerIndex < Math.min(groupConcurrency, group.length); workerIndex++) groupWorkers.push(exportNextGroupJob());
      await Promise.all(groupWorkers);
    }
    figma.ui.postMessage({ type: 'EXPORT_COMPLETE', timings: { exportWallMs: Date.now() - batchStartedAt, rasterWorkMs: rasterWorkMs } });
  }

  if (msg.type === 'CLOSE') {
    figma.closePlugin();
  }
};

// Keep unexpected Figma node-access failures visible to the user. Without a
// boundary, a rejected scan promise leaves the UI waiting indefinitely and
// looks like a slow or incomplete scan.
var handlePluginMessage = figma.ui.onmessage;
figma.ui.onmessage = async function(msg) {
  try {
    return await handlePluginMessage(msg);
  } catch (runtimeError) {
    if (msg && msg.type === 'SCAN_SELECTED_COPY') {
      figma.ui.postMessage({
        type: 'SELECTED_COPY_RESULT',
        frames: [],
        error: 'Selection scan failed: ' + (runtimeError && runtimeError.message ? runtimeError.message : String(runtimeError))
      });
      return;
    }
    if (msg && msg.type === 'SCAN_FRAMES') {
      figma.ui.postMessage({
        type: 'SCAN_ERROR',
        role: msg.role,
        message: 'Scan failed: ' + (runtimeError && runtimeError.message ? runtimeError.message : String(runtimeError))
      });
      return;
    }
    throw runtimeError;
  }
};
