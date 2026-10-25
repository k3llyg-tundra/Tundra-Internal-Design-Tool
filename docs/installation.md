# Install and update plugins

## Download and install

You need Figma desktop, a design file you can edit, and GitHub access to this internal repository. Release packages do not require Node.js or a terminal.

1. Open the repository's [latest release](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest) while signed in to GitHub.
2. Under **Assets**, download `component-setup.zip`, `delivery-export.zip`, or `bulk-resize.zip`. The automatically generated **Source code** archives are for maintainers and require builds for some plugins.
3. Extract the ZIP. Move its named plugin folder to a permanent location, such as `Documents/Tundra Plugins/`. Keep every file and subfolder together.
4. Open a design file in Figma desktop. From the Figma menu or canvas context menu, choose **Plugins → Development → Import plugin from manifest…**. Menu placement may vary by Figma version; search for the import command if needed.
5. Select `manifest.json` inside the extracted plugin folder. Do not select the ZIP or a JavaScript file.
6. Run the tool under **Plugins → Development**. Its displayed name may be longer than its download filename; Delivery Export appears as **Tundra Delivery Export - GIF / NVS / Promo**.

Figma’s [official development-plugin guide](https://help.figma.com/hc/en-us/articles/360042786733-Create-a-classic-plugin-for-development) also explains importing a local manifest.

Repeat for each tool you need. These are local development plugins, so every teammate imports their own local copy.

## Update a plugin

1. Read the new release notes and download its ZIP.
2. Close the running plugin. Extract the update into a temporary folder.
3. Replace the contents of the existing plugin folder with the contents of the new folder, keeping `manifest.json` at the same path. Keep the previous package separately if you need to roll back.
4. Run the plugin again. If Figma reports it cannot find the plugin, remove its old development entry and import the new manifest.

Do not rename manifest IDs when updating. If you move or rename the installed folder, reimport its manifest. To roll back, restore the previous package at the same path and reopen the plugin.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Download shows 404 or requests sign-in | Sign in with the GitHub account granted access, check the Releases page, and confirm a release has been published. |
| Cannot find the import command | Use Figma desktop in a design file and search for “Import plugin from manifest”. |
| Manifest reports a missing main or UI file | Extract the full release ZIP, preserving its subfolders. Source archives require the maintainer build steps. |
| Plugin stops opening after moving files | Reimport `manifest.json` from its new permanent location. |
| Export ZIP fails in Delivery Export | Its UI currently loads the ZIP library from `cdn.jsdelivr.net`; check your connection and corporate network access, then reopen the plugin. |
| Artwork is missing or named incorrectly | Check the tool's guide, supported layers, naming, selected source, and preview before exporting again. |

For help, provide the plugin name, release tag, selected mode, reproduction steps, and the exact error. Use the team's usual support channel; avoid attaching confidential artwork to public issues.
