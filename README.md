# Tundra Internal Design Tools

Internal Figma plugins for the Tundra design team. Download a plugin, import its manifest in Figma desktop, and follow its guide. No coding tools are needed to use the release downloads.

| Tool | Use it for | Download | Guide |
| --- | --- | --- | --- |
| Component Setup | Create blank components with campaign names, delivery paths, and dimensions | [Download ZIP](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest/download/component-setup.zip) | [Usage guide](plugins/component-setup/README.md) |
| Delivery Export | Preview and export slices, comps, original GIFs, and copy documents | [Download ZIP](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest/download/delivery-export.zip) | [Usage guide](plugins/delivery-export/README.md) |
| Bulk Resize | Resize selected layers and export Always On library images | [Download ZIP](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest/download/bulk-resize.zip) | [Usage guide](plugins/bulk-resize/README.md) |

## Get started

1. Sign in to GitHub with an account that has access to this repository.
2. Download your chosen plugin ZIP from the table above and extract it into a permanent folder on your computer.
3. In a design file in **Figma desktop**, open **Plugins → Development → Import plugin from manifest…** and choose the extracted plugin's `manifest.json`.
4. Run the plugin from **Plugins → Development**, then follow its usage guide.

Keep the extracted folder: Figma loads the plugin files from that location. See [installation, updates, and troubleshooting](docs/installation.md) for details. Downloads become available when the first release is published; the [Releases page](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases) shows published versions and changes.

## Instructions and updates

These guides describe the supplied plugin code. The [Figma instruction file](https://www.figma.com/design/DwEfgBp5OOdPh6j2g5rAlk/Design-Team-Internal-%7C-Figma-Plugins?node-id=2-380) remains a visual reference; some labels and screenshots show older versions. Use the guides here for current steps.

For future updates, maintain the guides beside the code and list changes in each GitHub release. A future internal website can display these same guides and link to these release downloads without introducing a second set of instructions.

## For maintainers

Each tool lives independently under `plugins/`. Release ZIPs contain ready-to-import runtime files; source code and existing tests live in the repository. See [maintenance and releases](docs/maintenance.md).

This repository contains internal tools and campaign-specific naming examples. No public distribution license is granted. Third-party notices remain with their respective libraries.
