import { expand, validate, type Spec, type Item } from "./model";

const SPEC_KEY = "componentSetupSpecV1";
const ITEM_KEY = "componentSetupItemIdV1";
figma.showUI(__html__, { width: 520, height: 720, themeColors: true });

function readSpec(): Spec | null {
  try {
    const raw = figma.currentPage.getPluginData(SPEC_KEY);
    return raw ? JSON.parse(raw) as Spec : null;
  } catch {
    return null;
  }
}

function send(type: string, extra: Record<string, unknown> = {}) {
  figma.ui.postMessage({ type, ...extra });
}

function save(spec: Spec) {
  figma.currentPage.setPluginData(SPEC_KEY, JSON.stringify(spec));
}

async function locate(item: Item, all: Map<string, ComponentNode>): Promise<ComponentNode | null> {
  if (item.nodeId) {
    const found = await figma.getNodeByIdAsync(item.nodeId);
    if (found?.type === "COMPONENT" && found.getPluginData(ITEM_KEY) === item.id) return found;
  }
  return all.get(item.id) || null;
}

function trackedOnPage(): Map<string, ComponentNode> {
  const map = new Map<string, ComponentNode>();
  for (const node of figma.currentPage.findAllWithCriteria({ types: ["COMPONENT"] })) {
    const id = node.getPluginData(ITEM_KEY);
    if (id) map.set(id, node);
  }
  return map;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation failed.";
}

async function generate(spec: Spec) {
  const errors = validate(spec);
  if (errors.length) return send("error", { message: errors.join("\n") });
  const entries = expand(spec);
  const tracked = trackedOnPage();
  const activeIds = new Set(entries.map(entry => entry.item.id));
  const retained = [...tracked.keys()].filter(id => !activeIds.has(id)).length;
  const located = await Promise.all(entries.map(entry => locate(entry.item, tracked)));
  const targetIds = new Set(located.filter((node): node is ComponentNode => !!node).map(node => node.id));
  const wanted = new Set(entries.map(entry => entry.name));
  for (const node of figma.currentPage.findAllWithCriteria({ types: ["COMPONENT"] })) {
    if (!targetIds.has(node.id) && wanted.has(node.name)) return send("error", { message: `Name already exists on this page: ${node.name}` });
  }

  let created = 0;
  let updated = 0;
  let missing = 0;
  const touched: ComponentNode[] = [];
  const startX = figma.viewport.center.x + 100;
  const startY = figma.viewport.center.y;
  let x = startX;
  let y = startY;
  let columnWidth = 0;
  try {
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      let node = located[index];
      if (!node) {
        if (entry.item.nodeId) missing++;
        node = figma.createComponent();
        node.setPluginData(ITEM_KEY, entry.item.id);
        node.x = x;
        node.y = y;
        y += entry.height + 140;
        columnWidth = Math.max(columnWidth, entry.width);
        if (y - startY > 6000) { x += columnWidth + 140; y = startY; columnWidth = 0; }
        created++;
      } else {
        updated++;
      }
      node.resize(entry.width, entry.height);
      node.name = entry.name;
      entry.item.nodeId = node.id;
      touched.push(node);
      save(spec);
    }
    figma.currentPage.selection = touched;
    if (touched.length) figma.viewport.scrollAndZoomIntoView(touched);
    send("complete", { spec, created, updated, missing, retained });
  } catch (error) {
    save(spec);
    send("error", { message: `${errorMessage(error)} Completed items were saved; Generate can resume.`, spec });
  }
}

async function sync(spec: Spec) {
  const errors = validate(spec);
  if (errors.length) return send("error", { message: errors.join("\n") });
  const tracked = trackedOnPage();
  let updated = 0;
  let missing = 0;
  for (const entry of expand(spec)) {
    const node = await locate(entry.item, tracked);
    if (!node) { missing++; continue; }
    entry.item.nodeId = node.id;
    updated++;
  }
  // One row has shared dimensions. If its components differ, preserve their actual sizes by splitting that row.
  const nextAssets: Spec["assets"] = [];
  for (const asset of spec.assets) {
    const groups = new Map<string, typeof asset>();
    for (const item of asset.items) {
      const node = await locate(item, tracked);
      const width = node ? Math.round(node.width) : asset.width;
      const height = node ? Math.round(node.height) : asset.height;
      const key = `${width}x${height}`;
      if (!groups.has(key)) groups.set(key, { ...asset, id: groups.size === 0 ? asset.id : `${asset.id}-${key}`, width, height, items: [] });
      groups.get(key)!.items.push(item);
    }
    nextAssets.push(...groups.values());
  }
  spec.assets = nextAssets;
  const nextErrors = validate(spec);
  if (nextErrors.length) return send("error", { message: nextErrors.join("\n") });
  for (const entry of expand(spec)) {
    const node = await locate(entry.item, tracked);
    if (node) node.name = entry.name;
  }
  save(spec);
  send("synced", { spec, updated, missing });
}

figma.ui.onmessage = async (message) => {
  try {
    if (message.type === "ready") { send("init", { spec: readSpec(), page: figma.currentPage.name, fileName: figma.root.name }); return; }
    if (message.type === "save") { save(message.spec as Spec); return; }
    if (message.type === "generate") { await generate(message.spec as Spec); return; }
    if (message.type === "sync") { await sync(message.spec as Spec); return; }
  } catch (error) {
    send("error", { message: errorMessage(error) });
  }
};
