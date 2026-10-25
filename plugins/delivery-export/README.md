# Delivery Export

Resolve, preview, and export campaign delivery files from structured Figma sources. Outputs include slices, comps, GIF source files when available, and Word copy documents, packaged in a ZIP. The supplied UI identifies itself as v49.

[Download ZIP](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest/download/delivery-export.zip) · [Install or update](../../docs/installation.md)

## Choose the matching file setup

| File setup | Source structure |
| --- | --- |
| Retention Offense — Theme + Design Space | Comps in the selected Theme and slices in the matching Week section in Design Space. |
| Multi-send - NVS + Similar File Structure (by Client RDs) | Send and channel sections, including responsive assets and supporting content in Design Space. |
| NSP Store Appearance — CXP / Social / Email | Store-specific CXP, social, and email assets; review the audience/store field and any manual selections. |
| Mid Season Promo — Named source paths | Named source paths for the requested phase. Set the phase and optional delivery name before scanning. |

The plugin relies on campaign structure and naming. It is not a general exporter for arbitrary files. Review every resolved source and output name before delivery.

## Export a delivery

1. Open the campaign design file in Figma desktop and run **Tundra Delivery Export - GIF / NVS / Promo**.
2. In **Setup**, choose the matching **File setup**. Check the campaign/ticket code, export date (`DD-MM-YY`), project name, and source page or Theme. Replace the example defaults with your campaign details.
3. Complete the mode-specific fields. For Mid Season Promo, enter the intended phase so the plugin scans only that phase. For NSP, check the audience/store name.
4. Set the offered export formats and scales. Choose whether to create copy documents.
5. Click the scan button (**Scan theme** initially; **Scan sources** in applicable views). Review the results in **Slices** and **Comps & copy**. Select only the items you intend to deliver and check filenames, formats, scales, and folders.
6. For copy from selected canvas frames, use the **Copy** tab and **Read selected frames**, then review the extracted content.
7. Click **Export ZIP**. Wait for processing and the download, extract the archive, and check the files before handing them off.

Output paths and naming depend on the selected setup, channel, source names, date, campaign details, dimensions, and scale. Keep the ZIP structure when extracting. Copy document content follows the supported source tags and layout; review Word documents for completeness and reading order.

## GIFs and limitations

When the plugin finds a supported visible uploaded GIF source, it exports the original GIF bytes. This does not render arbitrary Figma animation into a new GIF or guarantee a composed GIF with other overlaid artwork.

If an original GIF cannot be recovered, the plugin creates a JPG placeholder marked **GIF TO BE EXPORTED** and reports a replacement is required. Replace those placeholders with the final animation before delivery. Retention GIF heroes can also produce a separate still image.

The UI loads **fflate 0.8.2** from `cdn.jsdelivr.net` to prepare ZIP output. Network access to that CDN is required; this version is not fully offline. Keep the existing dependency behavior when maintaining this initial import.

## Troubleshooting

- No expected assets: check the selected setup, page, phase, source structure, and layer names, then scan again.
- Incorrect folders or filenames: correct campaign details and source naming, then check the preview again.
- Missing copy: check tagged text and selected frames, and inspect the generated documents before delivery.
- Slow scans: restrict the scan to the intended page or phase rather than a large all-phase review area.
- ZIP errors: verify network access to the CDN, reopen the plugin, and retry a smaller selection.

## Development

`code.js` and `ui.html` are the current editable runtime source; no build is required. Run `npm test` from this folder for the supplied regression scripts. See [maintenance](../../docs/maintenance.md) for packaging.
