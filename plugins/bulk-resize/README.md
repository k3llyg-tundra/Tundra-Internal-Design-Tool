# Bulk Resize

A local Figma plugin for resizing selected frames, components, and component instances, including nested instances.

[Download ZIP](https://github.com/k3llyg-tundra/Tundra-Internal-Design-Tool/releases/latest/download/bulk-resize.zip) · [Install or update](../../docs/installation.md)

## Install in Figma desktop

1. Open a design file.
2. Open **Plugins → Development → Import plugin from manifest…**.
3. Choose `manifest.json` inside the extracted `bulk-resize` folder.
4. Run **Plugins → Development → Bulk Resize**.

Select your layers, enter width and height, then click **Resize**. The default is **2048 × 2048 px**; select any number of 1080 × 1080 layers to enlarge them together.

**Scale contents proportionally** scales artwork to fit the target bounds from the top left, then sets the outer frame to the exact requested size. Matching aspect ratios fill the frame. Different aspect ratios may leave extra space. Turn this off to resize using existing constraints and auto layout.

The plugin fixes selected layers' sizing and removes their min/max size limits to apply the requested dimensions. Component definitions affect their linked instances according to Figma's normal behavior. Locked or unsupported layers are skipped. Selected parents are resized before selected children. A parent and child selected together will both receive the requested dimensions. Use Figma Undo to undo the operation.

## One-click library export

Select frames or sections within the **Always On Image Library** section and click **Export PNG**. A section exports its contained image frames individually. Selecting both a section and one of its frames exports that frame once. Components and instances are also supported; their internal frames are not separately exported.

Image numbers come from a frame name or ancestor name such as `Image 1`. Exports always download as a ZIP to preserve the folder structure, even for one image:

```
Always On Image Library/
  Image 1/
    [NIKRA1027] HO26 NVS Always On Image Library_Image 1_4096x4096.png
```

The filename prefix is editable and defaults to the archived naming example. Dimensions come from the frame's current size at 1×, rounded to whole pixels. Frames without an Image number or outside the library section are excluded. Duplicate paths get `(2)`, `(3)`, etc. Existing folders on disk are not modified; extract the ZIP into the destination parent folder.

## Build

From this plugin directory, run `npm ci`, `npm run build`, and `npm test`. Import this directory’s `manifest.json`. Release downloads already contain the built files, so designers can skip these commands. See [maintenance](../../docs/maintenance.md) for packaging.

No network requests or external services are used. Import and execution in Figma are required to confirm behavior with your artwork.

## Export performance

PNG exports still use Figma's renderer. The status shows elapsed time while rendering and a final split between render time and download preparation. Render time sums `exportAsync` calls; total also includes message delivery, UI scheduling, and packaging. These timings do not include the operating system finishing the file save. ZIP creation preserves the library folder structure for every export.

ZIP packaging uses the vendored [fflate 0.8.3](https://github.com/101arrowz/fflate) `ZipPassThrough` implementation. PNG bytes are not recompressed. Its MIT license is in `src/vendor/fflate-LICENSE.txt`. The library is bundled locally; export makes no network requests.

## Editable presets

Choose **Edit presets** to change the three quick sizes. Select the radio button beside the size to use when the plugin opens, then **Save**. **Reset** restores the original sizes in the editor; Save applies them. Presets and filename prefix are saved locally with Figma client storage. Width and height can always be entered directly for a single resize.

## Troubleshooting

- If resizing skips a layer, check whether it is locked or unsupported.
- If PNG export finds no images, select supported image frames or sections inside **Always On Image Library** and check that an `Image 1`-style number exists in the frame or ancestor name.
- If scaling leaves space, check the source and target aspect ratios.
- For missing runtime files or moved installations, follow the [installation guide](../../docs/installation.md).
