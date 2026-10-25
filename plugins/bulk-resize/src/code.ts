type Target = FrameNode | ComponentNode | InstanceNode;
const eligible = (node: SceneNode): node is Target =>
  node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE';
figma.showUI(__html__, { width: 400, height: 690, themeColors: true });
let busy = false;
const libraryName = 'Always On Image Library';
const defaultPrefix = '[NIKRA1027] HO26 NVS Always On Image Library';
const safePart = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
function imageName(node: BaseNode): string | null {
  for (let current: BaseNode | null = node; current && current.type !== 'PAGE'; current = current.parent) {
    const match = current.name.match(/\bImage\s+(\d+)\b/i);
    if (match) return `Image ${match[1]}`;
  }
  return null;
}
function inLibrary(node: BaseNode): boolean {
  for (let current: BaseNode | null = node; current; current = current.parent) {
    if (current.type === 'SECTION' && current.name.includes(libraryName)) return true;
  }
  return false;
}
function exportTargets(): Target[] {
  const targets = new Map<string, Target>();
  const visit = (node: SceneNode) => {
    if (eligible(node)) {
      if (inLibrary(node) && imageName(node)) targets.set(node.id, node);
    } else if (node.type === 'SECTION' || node.type === 'GROUP') {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of figma.currentPage.selection) visit(node);
  return [...targets.values()];
}
function selection() {
  const selected = figma.currentPage.selection;
  const targets = selected.filter(eligible);
  figma.ui.postMessage({ type: 'selection', total: selected.length, count: targets.length,
    exportCount: exportTargets().length, names: selected.slice(0, 3).map(n => n.name) });
}
figma.on('selectionchange', selection);
type Preset = { width: number; height: number };
const presetDefaults: Preset[] = [{width:1080,height:1080},{width:2048,height:2048},{width:1080,height:1920}];
function validPresets(value: unknown): value is Preset[] {
  return Array.isArray(value) && value.length === 3 && value.every(p => p &&
    typeof p.width === 'number' && typeof p.height === 'number' &&
    Number.isFinite(p.width) && Number.isFinite(p.height) &&
    p.width >= 1 && p.width <= 100000 && p.height >= 1 && p.height <= 100000);
}
figma.ui.onmessage = async (message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const m = message as Record<string, unknown>;
  if (m.type === 'ready') {
    selection();
    let saved: {presets?: unknown; defaultPreset?: number; prefix?: string} = {};
    try { saved = (await figma.clientStorage.getAsync('bulk-resize-settings-v1')) || {}; } catch { /* Use defaults if storage is unavailable. */ }
    const presets = validPresets(saved.presets) ? saved.presets : presetDefaults;
    const defaultPreset = Number.isInteger(saved.defaultPreset) && saved.defaultPreset! >= 0 && saved.defaultPreset! < 3 ? saved.defaultPreset : 1;
    figma.ui.postMessage({type:'settings',presets,defaultPreset,prefix:saved.prefix});
    return;
  }
  if (m.type === 'save-presets' || m.type === 'save-prefix') {
    try {
      if (m.type === 'save-presets' && (!validPresets(m.presets) || !Number.isInteger(m.defaultPreset) || Number(m.defaultPreset) < 0 || Number(m.defaultPreset) > 2)) throw new Error('Enter sizes between 1 and 100,000 px.');
      const saved = (await figma.clientStorage.getAsync('bulk-resize-settings-v1')) || {};
      if (m.type === 'save-presets') { saved.presets = m.presets; saved.defaultPreset = m.defaultPreset; }
      else if (typeof m.prefix === 'string') saved.prefix = m.prefix;
      await figma.clientStorage.setAsync('bulk-resize-settings-v1', saved);
      if (m.type === 'save-presets') figma.ui.postMessage({type:'presets-saved',presets:m.presets,defaultPreset:m.defaultPreset});
    } catch (error) {
      figma.ui.postMessage({type:m.type === 'save-presets' ? 'presets-saved' : 'result',error:true,text:error instanceof Error ? error.message : 'Could not save settings.'});
    }
    return;
  }
  if (busy) return;
  if (m.type === 'export') {
    busy = true;
    const targets = exportTargets();
    const prefix = safePart(typeof m.prefix === 'string' ? m.prefix : defaultPrefix) || defaultPrefix;
    let completed = 0;
    const failures: string[] = [];
    try {
      for (const node of targets) {
        figma.ui.postMessage({ type: 'progress', text: `Exporting ${completed + failures.length + 1} of ${targets.length}: ${node.name}` });
        try {
          const renderStarted = Date.now();
          const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
          figma.ui.postMessage({ type: 'export-file', name: node.name, path: `${libraryName}/${imageName(node)}/${prefix}_${imageName(node)}_${Math.round(node.width)}x${Math.round(node.height)}.png`, bytes, renderMs: Date.now() - renderStarted });
          completed++;
        } catch (error) {
          failures.push(`${node.name}: ${error instanceof Error ? error.message : 'Export failed'}`);
        }
      }
      figma.ui.postMessage({ type: 'export-done', count: completed, text: targets.length === 0
        ? 'Select Image-numbered frames or sections inside Always On Image Library.'
        : `Exported ${completed} of ${targets.length} library images.${failures.length ? ` ${failures.slice(0, 2).join('; ')}` : ''}` });
    } finally {
      busy = false;
      selection();
    }
    return;
  }
  if (m.type !== 'resize') return;
  const width = Number(m.width), height = Number(m.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 100000 || height > 100000) {
    figma.ui.postMessage({ type: 'result', error: true, text: 'Enter a width and height between 1 and 100,000 px.' }); return;
  }
  busy = true;
  const targets = figma.currentPage.selection.filter(eligible);
  // Resize parents first so a selected child receives its final size last.
  const depth = (n: BaseNode) => { let d = 0; for (let p = n.parent; p; p = p.parent) d++; return d; };
  targets.sort((a, b) => depth(a) - depth(b));
  let completed = 0;
  const failures: string[] = [];
  for (const node of targets) {
    try {
      if (node.locked) throw new Error('Layer is locked');
      if (node.width <= 0 || node.height <= 0) throw new Error('Layer has no size');
      node.layoutSizingHorizontal = 'FIXED';
      node.layoutSizingVertical = 'FIXED';
      node.minWidth = null; node.maxWidth = null;
      node.minHeight = null; node.maxHeight = null;
      if (m.scale === true) {
        const factor = Math.min(width / node.width, height / node.height);
        node.rescale(factor);
        // Preserve scaled artwork while setting the requested outer dimensions.
        node.resizeWithoutConstraints(width, height);
      } else {
        node.resize(width, height);
      }
      if (Math.abs(node.width - width) > 0.1 || Math.abs(node.height - height) > 0.1) throw new Error('Layout prevented the requested size');
      node.name = `${node.name.replace(/(?:_\d+(?:\.\d+)?[x×]\d+(?:\.\d+)?)+$/i, '')}_${width}x${height}`;
      completed++;
    } catch (error) {
      failures.push(`${node.name}: ${error instanceof Error ? error.message : 'Could not resize'}`);
    }
  }
  if (completed) figma.commitUndo();
  const text = targets.length === 0 ? 'Select frames, components, or instances first.'
    : `Resized ${completed} ${completed === 1 ? 'layer' : 'layers'} to ${width} × ${height} px.${failures.length ? ` ${failures.length} skipped. ${failures.slice(0, 2).join('; ')}` : ''}`;
  figma.ui.postMessage({ type: 'result', error: completed === 0, text });
  if (completed) figma.notify(text);
  busy = false;
  selection();
};
