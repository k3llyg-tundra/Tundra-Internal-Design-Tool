# Component Setup

Create blank Figma components with campaign naming, folder paths, and pixel dimensions. Use this to prepare deliverables before adding artwork.

[Download ZIP](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest/download/component-setup.zip) · [Install or update](../../docs/installation.md)

## Create deliverables

1. Open the destination page in Figma desktop and run **Component Setup** from Development plugins.
2. Expand **Campaign details**. Check **Ticket number**, **Season / year**, and **Campaign title**. **Use file title** restores values detected from the Figma file title.
3. Enter **Default folder path**, for example `Meta / Brand Social`. Slash-separated paths become part of the component name; they do not create folders on your computer.
4. Set **Extra naming label (optional)** only when the naming convention needs it. For a paid-media brief, this can hold a placement or deliverable label; check the preview to avoid repeating the deliverable name.
5. Add a deliverable with **+ In-feed carousel**, **+ IG Story**, or **+ Custom**. Edit its name, width, height, quantity, and individual item names. Use **+ Add named item** for another item.
6. Check the generated names in **Preview**, resolve any validation errors, then click **Generate all deliverables**.

For gender-specific work, explicitly name the deliverables and items as required by the brief and verify the preview. The supplied version does not have a separate Dual Gender Mode switch shown in the older Figma guide.

## Naming example

With file title `[NIKRA0990] FA26 NikeSKIMS Drop 2 | Paid Media`, folder path `Meta / Brand Social`, extra label `Brand Social`, deliverable `IG Carousel`, and item `Frame 2` at 1080 × 1080, the component name is:

```text
Meta / Brand Social / [NIKRA0990] FA26 NikeSKIMS Drop 2_Brand Social_IG Carousel_Frame 2_1080x1080
```

An item can override its folder path or its full export name. The dimension suffix stays automatic. **Reset name correction** removes the full-name override. To change every item's folder, edit the default path and click **Apply path to all**.

## Change an existing setup

The specification is saved on the current Figma page. Running generation again updates tracked components and adds new items. Removing an item from the specification leaves its component on the canvas; the next generation reports it so you can review it yourself.

After resizing generated components on the canvas, click **Sync dimensions**. This reads their actual sizes, updates their naming suffixes, and separates an asset row when its items now have different sizes. Use Figma Undo for canvas changes when needed.

## Troubleshooting

- If campaign details are wrong, edit them manually or check the file title before using **Use file title**.
- If generation reports duplicate names, give the items distinct names or paths. Dimensions must be positive.
- If names show old dimensions, run **Sync dimensions** after resizing.
- Generated components are blank; this tool does not generate artwork or mockups.

## Development

From this directory, run `npm ci`, `npm run build`, `npm run typecheck`, and `npm test`. Import this directory's `manifest.json`; its runtime files are generated under `dist/`.

No external services or network requests are used. See [maintenance](../../docs/maintenance.md) for release packaging.
