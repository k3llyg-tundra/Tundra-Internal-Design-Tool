import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await build({ entryPoints: ["src/code.ts"], outfile: "dist/code.js", bundle: true, target: "es2020", format: "iife" });
const ui = await build({ entryPoints: ["src/ui.ts"], bundle: true, target: "es2020", format: "iife", write: false });
const template = await readFile("src/ui.html", "utf8");
const script = new TextDecoder().decode(ui.outputFiles[0].contents).replaceAll("</script>", "<\\/script>");
await writeFile("dist/ui.html", template.replace("<!-- APP_SCRIPT -->", `<script>${script}</script>`));
console.log("Built Component Setup into dist/.");
