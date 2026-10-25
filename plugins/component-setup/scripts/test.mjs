import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const directory = await mkdtemp(join(tmpdir(), "component-setup-test-"));
try {
  const outfile = join(directory, "model.mjs");
  await build({ entryPoints: ["src/model.ts"], outfile, bundle: true, platform: "node", format: "esm" });
  const { expand, validate, detectFileTitle } = await import(pathToFileURL(outfile).href);
  const spec = {
    version: 1, path: "Meta / Brand Social", ticket: "NIKRA0990", seasonYear: "FA26", campaign: "NikeSKIMS Drop 2", placement: "Brand Social", assets: [{
      id: "asset", name: "IG Carousel", width: 1080, height: 1080,
      items: [
        { id: "one", name: "Frame 1", pathOverride: "" },
        { id: "two", name: "Frame 2", pathOverride: "Meta / Paid / Carousel" }
      ]
    }]
  };
  assert.deepEqual(validate(spec), []);
  assert.deepEqual(expand(spec).map(entry => entry.name), [
    "Meta / Brand Social / [NIKRA0990] FA26 NikeSKIMS Drop 2_Brand Social_IG Carousel_Frame 1_1080x1080",
    "Meta / Paid / Carousel / [NIKRA0990] FA26 NikeSKIMS Drop 2_Brand Social_IG Carousel_Frame 2_1080x1080"
  ]);
  assert.deepEqual(detectFileTitle("[NIKRA0990] FA26 NikeSKIMS Drop 2 | Paid Media"), {
    ticket: "NIKRA0990", seasonYear: "FA26", campaign: "NikeSKIMS Drop 2"
  });
  spec.assets[0].items[1].nameOverride = "Meta / Custom / Approved Export";
  assert.equal(expand(spec)[1].name, "Meta / Custom / Approved Export_1080x1080");
  spec.assets[0].items[1].nameOverride = "";
  spec.assets[0].items[1].name = "Frame 1";
  spec.assets[0].items[1].pathOverride = "";
  assert.match(validate(spec).join(" "), /Duplicate component name/);
  spec.assets[0].width = 0;
  assert.match(validate(spec).join(" "), /dimensions/);
  console.log("Component naming and validation checks passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
