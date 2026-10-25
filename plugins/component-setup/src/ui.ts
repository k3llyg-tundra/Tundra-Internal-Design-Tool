import { emptySpec, expand, validate, newId, detectFileTitle, baseName, type Asset, type Item, type Spec } from "./model";

const get = (id: string) => document.getElementById(id)!;
let spec: Spec = emptySpec();
let busy = false;
let saveTimer: number | undefined;
let fileTitle = "";
let activeAsset = "";

function send(type: string, data: Record<string, unknown> = {}) {
  parent.postMessage({ pluginMessage: { type, ...data } }, "*");
}

function field(label: string, value: string | number, onChange: (value: string) => void, type = "text"): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  const multiline = label.startsWith("Name correction");
  const input = multiline ? document.createElement("textarea") : document.createElement("input");
  if (input instanceof HTMLInputElement) {
    input.type = type;
    if (type === "number") { input.min = "1"; input.max = "100000"; input.step = "1"; }
  } else {
    input.rows = 3;
    input.style.resize = "vertical";
    input.style.lineHeight = "1.4";
    input.style.overflowWrap = "anywhere";
  }
  input.value = String(value);
  input.addEventListener("input", () => onChange(input.value));
  wrapper.append(input);
  return wrapper;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.onclick = action;
  return element;
}

function changed(rebuild = false) {
  if (rebuild) render(); else renderPreview();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => send("save", { spec }), 300);
}

function renderItem(asset: Asset, item: Item): HTMLElement {
  const box = document.createElement("div");
  box.className = "item";
  const head = document.createElement("div");
  head.className = "item-head";
  const title = document.createElement("strong");
  title.textContent = `Item ${asset.items.indexOf(item) + 1}`;
  head.append(title, button("Remove", () => { asset.items = asset.items.filter(candidate => candidate !== item); changed(true); }));
  const fields = document.createElement("div");
  fields.className = "item-grid";
  fields.append(
    field("Item name", item.name, value => { item.name = value; changed(); }),
    field("Folder override (optional)", item.pathOverride, value => { item.pathOverride = value; changed(); })
  );
  const custom = field("Name correction — full path and name, without dimensions", item.nameOverride || "", value => {
    item.nameOverride = value;
    changed();
  });
  custom.classList.add("full");
  (custom.querySelector("textarea") as HTMLTextAreaElement).placeholder = baseName(spec, asset, { ...item, nameOverride: "" });
  fields.append(custom);
  box.append(head, fields, button("Reset name correction", () => { item.nameOverride = ""; changed(true); }));
  return box;
}

function renderAsset(asset: Asset): HTMLElement {
  const box = document.createElement("details");
  box.className = "asset deliverable";
  box.dataset.assetId = asset.id;
  box.open = activeAsset ? activeAsset === asset.id : spec.assets.indexOf(asset) === 0;
  box.addEventListener("toggle", () => { if (box.open) activeAsset = asset.id; });
  const summary = document.createElement("summary");
  const summaryText = document.createElement("span");
  summaryText.textContent = `${asset.name || "Untitled deliverable"} · ${asset.width} × ${asset.height} · ${asset.items.length} items`;
  const remove = button("Remove", () => {
    const index = spec.assets.indexOf(asset);
    spec.assets.splice(index, 1);
    changed(true);
    get("status").textContent = "Deliverable removed from setup. ";
    get("status").append(button("Undo", () => {
      spec.assets.splice(index, 0, asset); activeAsset = asset.id; changed(true); get("status").textContent = "Removal undone.";
    }));
  });
  remove.setAttribute("aria-label", `Remove ${asset.name || "deliverable"}`);
  remove.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
  summary.append(summaryText, remove);
  box.append(summary);
  const head = document.createElement("div");
  head.className = "asset-head";
  const title = document.createElement("h2");
  title.textContent = `Deliverable ${spec.assets.indexOf(asset) + 1}`;
  head.append(title);
  const fields = document.createElement("div");
  fields.className = "grid";
  fields.append(
    field("Deliverable name", asset.name, value => { asset.name = value; summaryText.textContent = `${asset.name || "Untitled deliverable"} · ${asset.width} × ${asset.height} · ${asset.items.length} items`; changed(); }),
    field("Width", asset.width, value => { asset.width = Number(value); changed(); }, "number"),
    field("Height", asset.height, value => { asset.height = Number(value); changed(); }, "number")
  );
  const quantity = field("Quantity", asset.items.length, value => {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 200) return;
    while (asset.items.length < count) asset.items.push({ id: newId(), name: `Frame ${asset.items.length + 1}`, pathOverride: "" });
    asset.items = asset.items.slice(0, count);
    changed(true);
  }, "number");
  const settings = document.createElement("div");
  settings.className = "item-grid";
  settings.append(
    field("Folder path for this deliverable", asset.path || "", value => { asset.path = value; changed(); }),
    field("Placement override (optional)", asset.placement || "", value => { asset.placement = value; changed(); })
  );
  box.append(head, fields, settings, quantity);
  for (const item of asset.items) box.append(renderItem(asset, item));
  box.append(button("+ Add named item", () => {
    asset.items.push({ id: newId(), name: `Frame ${asset.items.length + 1}`, pathOverride: "" });
    changed(true);
  }));
  return box;
}

function renderPreview() {
  const errors = validate(spec);
  get("errors").textContent = errors.join("\n");
  const entries = expand(spec);
  get("count").textContent = `(${spec.assets.length} deliverables, ${entries.length} components)`;
  const list = get("names");
  list.replaceChildren();
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry.name;
    list.append(item);
  }
  (get("generate") as HTMLButtonElement).disabled = busy || errors.length > 0;
  (get("sync") as HTMLButtonElement).disabled = busy || !spec.assets.some(asset => asset.items.some(item => item.nodeId));
}

function render() {
  (get("path") as HTMLInputElement).value = spec.path;
  (get("ticket") as HTMLInputElement).value = spec.ticket || "";
  (get("season-year") as HTMLInputElement).value = spec.seasonYear || "";
  (get("campaign") as HTMLInputElement).value = spec.campaign || "";
  (get("placement") as HTMLInputElement).value = spec.placement || "";
  const container = get("assets");
  container.replaceChildren(...spec.assets.map(renderAsset));
  renderPreview();
}

for (const [id, key] of [["ticket", "ticket"], ["season-year", "seasonYear"], ["campaign", "campaign"], ["placement", "placement"]] as const) {
  get(id).addEventListener("input", event => {
    spec[key] = (event.target as HTMLInputElement).value;
    changed();
  });
}
get("use-file-title").addEventListener("click", () => {
  Object.assign(spec, detectFileTitle(fileTitle));
  changed(true);
});
get("path").addEventListener("input", event => {
  spec.path = (event.target as HTMLInputElement).value;
  changed();
});
get("apply-path").addEventListener("click", () => {
  for (const asset of spec.assets) { asset.path = ""; for (const item of asset.items) item.pathOverride = ""; }
  changed(true);
  get("status").textContent = "Default path applied to every item.";
});
function addDeliverable(name = "", width = 1080, height = 1080) {
  const asset: Asset = { id: newId(), name, path: "", placement: "", width, height,
    items: [{ id: newId(), name: "Frame 1", pathOverride: "" }] };
  spec.assets.push(asset);
  activeAsset = asset.id;
  changed(true);
  const added = Array.from(get("assets").children).find(element => (element as HTMLElement).dataset.assetId === asset.id);
  added?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  (added?.querySelector("input") as HTMLInputElement | null)?.focus({ preventScroll: true });
}
get("add-asset").addEventListener("click", () => addDeliverable());
get("add-carousel").addEventListener("click", () => addDeliverable("In-Feed Carousel", 1080, 1080));
get("add-story").addEventListener("click", () => addDeliverable("IG Story", 1080, 1920));
for (const type of ["generate", "sync"]) get(type).addEventListener("click", () => {
  window.clearTimeout(saveTimer);
  busy = true;
  renderPreview();
  get("status").textContent = type === "generate" ? "Generating components…" : "Syncing dimensions…";
  send(type, { spec });
});

window.onmessage = event => {
  const message = event.data.pluginMessage;
  if (!message) return;
  if (message.type === "init") {
    fileTitle = String(message.fileName || "");
    const detected = detectFileTitle(fileTitle);
    spec = message.spec ? { ...emptySpec(), ...message.spec as Spec } : emptySpec();
    for (const asset of spec.assets) {
      const legacy = asset as Asset & { groups?: { id: string; name: string }[] };
      for (const item of asset.items) {
        const grouped = item as Item & { groupId?: string };
        const group = legacy.groups?.find(group => group.id === grouped.groupId);
        if (group?.name) item.name = `${group.name}_${item.name}`;
        delete grouped.groupId;
      }
      delete legacy.groups;
    }
    if (!spec.ticket) spec.ticket = detected.ticket;
    if (!spec.seasonYear) spec.seasonYear = detected.seasonYear;
    if (!spec.campaign) spec.campaign = detected.campaign;

    get("file-title").textContent = `Figma file: ${fileTitle}`;
    get("page").textContent = `Page: ${message.page}`;
    render();
  } else if (message.type === "complete" || message.type === "synced") {
    busy = false;
    spec = message.spec as Spec;
    render();
    get("status").textContent = message.type === "complete"
      ? `${message.created} created, ${message.updated} updated${message.missing ? `, ${message.missing} missing items recreated` : ""}${message.retained ? `, ${message.retained} removed from the spec and retained in Figma` : ""}.`
      : `${message.updated} synced${message.missing ? `, ${message.missing} missing` : ""}.`;
  } else if (message.type === "error") {
    busy = false;
    if (message.spec) spec = message.spec as Spec;
    render();
    get("status").textContent = message.message;
    get("status").className = "status error";
  }
};

// Ask the plugin for state after the UI listener is installed.
send("ready");
