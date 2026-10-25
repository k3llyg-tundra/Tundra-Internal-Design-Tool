# Maintain and release plugins

## Layout and source of truth

Each plugin is independent under `plugins/`. Component Setup and Bulk Resize compile into their own ignored `dist/` folders. Delivery Export's `code.js` and `ui.html` are its editable runtime source and remain tracked. Keep manifest IDs stable so updates continue to identify the same plugins.

Write current usage instructions in each plugin README and shared installation steps in `docs/installation.md`. Keep the root tool directory short. A future internal website should consume these guides and link to GitHub release assets; do not maintain separate copies of the instructions in a website and Figma.

The initial import deliberately excludes archived projects, fonts, sample artwork, backups, nested repositories, and installed dependencies. Bulk Resize retains its vendored fflate library and MIT notice. Delivery Export retains its existing CDN-loaded fflate 0.8.2 dependency.

## Build and check

Use Node.js 22 or newer and npm. Run these commands from the repository root:

```sh
cd plugins/component-setup
npm ci
npm run build
npm run typecheck
npm test
cd ../bulk-resize
npm ci
npm run build
npm test
cd ../delivery-export
npm test
cd ../..
node scripts/package-plugins.mjs
```

Lockfiles pin build dependencies; commit their updates intentionally. Delivery Export needs no dependency installation or build. Its test runner runs each existing regression script from the plugin directory.

Packaging requires `zip` and `unzip` on PATH (provided on macOS and the GitHub Ubuntu runner). It creates `releases/component-setup.zip`, `releases/delivery-export.zip`, and `releases/bulk-resize.zip`. Each package contains a named folder, manifest, runtime files, README, and any bundled third-party notice. README links are converted to GitHub links for use outside the repository. Packaging checks manifest paths, tests archive integrity, extracts every ZIP, and verifies the runtime files again. Source, tests, and build dependencies are not shipped to designers.

## Check in Figma desktop

Before publishing, import each extracted package's manifest and open the plugin. Use a disposable design page or duplicate file for these checks:

- Component Setup: verify file-title detection, add a preset and custom item, inspect naming, generate, resize, and sync dimensions.
- Bulk Resize: resize a frame, test proportional scaling, save a preset, and export a numbered image inside an Always On Image Library section.
- Delivery Export: use a representative campaign for each supported setup, scan and inspect the preview, export a small selection, review a copy document, and confirm original GIF or placeholder behavior.

Automated checks cannot confirm Figma rendering, operating-system download behavior, or correctness across campaign files. Record which manual checks were performed in the release notes; disclose checks that remain outstanding.

## Publish an update

1. Update the plugin and its guide together. Add no unrelated campaign assets. Preserve the repository's internal visibility.
2. Run the checks above and review the diff. Commit and push the changes to `main`.
3. Choose the next unused repository release tag (`v0.1.0` for the initial release), then push it:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The tag-triggered workflow rebuilds and tests the plugins, packages all three, and publishes a GitHub release. It uses the repository's own `GITHUB_TOKEN`; no personal access token secret is needed. Every release contains all three tools so the homepage's stable latest-download links stay valid. The repository release number versions the bundle; Delivery Export's existing UI version and individual package versions can differ.

Review the published release notes and add designer-facing changes, installation notes, and manual verification status. Confirm all three assets are downloadable while signed in. Manual workflow dispatch builds downloadable workflow artifacts without publishing a release.

If a release check fails, fix the failure before publishing a new tag. Do not replace assets of a published release silently. Designers can restore a previous release package to roll back. For a security or access issue, use the team's internal support process.
