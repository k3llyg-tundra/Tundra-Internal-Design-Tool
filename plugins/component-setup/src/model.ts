export type Item = { id: string; name: string; pathOverride: string; nameOverride?: string; nodeId?: string };
export type Asset = { id: string; name: string; path?: string; placement?: string; width: number; height: number; items: Item[] };
export type Spec = { version: 1; path: string; ticket: string; seasonYear: string; campaign: string; placement: string; assets: Asset[] };
export type Entry = { item: Item; asset: Asset; name: string; width: number; height: number };

let nextId = 0;
export function newId(): string {
  nextId += 1;
  return `${Date.now().toString(36)}-${nextId.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const emptySpec = (): Spec => ({
  version: 1,
  path: "Meta",
  ticket: "", seasonYear: "", campaign: "", placement: "",
  assets: [{ id: newId(), name: "", width: 1080, height: 1080, items: [{ id: newId(), name: "Frame 1", pathOverride: "" }] }]
});

export function cleanPath(path: string): string {
  return path.split("/").map(segment => segment.trim()).filter(Boolean).join(" / ");
}

export function detectFileTitle(title: string): Pick<Spec, "ticket" | "seasonYear" | "campaign"> {
  const clean = title.split("|")[0].trim();
  const match = clean.match(/^\[?([A-Z]{2,}[A-Z0-9]*\d{3,})\]?\s*[-_ ]*\s*([A-Z]{2}\d{2})\s*[-_ ]*\s*(.+)$/i);
  return match
    ? { ticket: match[1].toUpperCase(), seasonYear: match[2].toUpperCase(), campaign: match[3].trim() }
    : { ticket: "", seasonYear: "", campaign: clean };
}

export function baseName(spec: Spec, asset: Asset, item: Item): string {
  const path = cleanPath(item.pathOverride || asset.path || spec.path);
  const season = spec.seasonYear.trim();
  let campaign = spec.campaign.trim();
  if (season && campaign.toLowerCase().startsWith(season.toLowerCase() + " ")) campaign = campaign.slice(season.length).trim();
  const prefix = `[${spec.ticket.trim()}] ${season} ${campaign}`;
  const parts = [prefix, (asset.placement || spec.placement).trim(), asset.name.trim(), item.name.trim()].filter(Boolean);
  const generated = `${path} / ${parts.join("_")}`;
  return item.nameOverride?.trim() || generated;
}

export function expand(spec: Spec): Entry[] {
  return spec.assets.flatMap(asset => asset.items.map(item => ({
    asset, item, width: Number(asset.width), height: Number(asset.height),
    name: `${baseName(spec, asset, item)}_${Math.round(Number(asset.width))}x${Math.round(Number(asset.height))}`
  })));
}

export function validate(spec: Spec): string[] {
  const errors: string[] = [];
  if (!spec || spec.version !== 1 || !Array.isArray(spec.assets) || !spec.assets.length) return ["Add at least one asset."];
  if (!spec.ticket?.trim()) errors.push("Enter a ticket number.");
  if (!spec.seasonYear?.trim()) errors.push("Enter a season and year, such as FA26.");
  if (!spec.campaign?.trim()) errors.push("Enter a campaign title.");

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const asset of spec.assets) {
    if (!asset.name?.trim() || asset.name.includes("/")) errors.push("Each asset needs a name without slashes.");
    if (![asset.width, asset.height].every(n => Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) <= 100000)) errors.push(`${asset.name || "Asset"}: dimensions must be whole pixels from 1 to 100000.`);
    if (!Array.isArray(asset.items) || !asset.items.length) errors.push(`${asset.name || "Asset"}: add at least one item.`);
    for (const item of asset.items || []) {
      if (!item.id || ids.has(item.id)) errors.push("Each item needs a unique ID.");
      ids.add(item.id);
      if (!item.name?.trim() || item.name.includes("/")) errors.push(`${asset.name || "Asset"}: each item needs a name without slashes.`);
      if (!(item.pathOverride || asset.path || spec.path)?.trim() || !cleanPath(item.pathOverride || asset.path || spec.path)) errors.push(`${asset.name || "Asset"}: enter an export path.`);
      if (item.nameOverride?.trim() && !item.nameOverride.includes("/")) errors.push("A custom export name must include a folder path.");
      const name = `${baseName(spec, asset, item)}_${Math.round(Number(asset.width))}x${Math.round(Number(asset.height))}`;
      if (names.has(name)) errors.push(`Duplicate component name: ${name}`);
      names.add(name);
    }
  }
  if (ids.size > 200) errors.push("A batch can contain up to 200 components.");
  return [...new Set(errors)];
}
