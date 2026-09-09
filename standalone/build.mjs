import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
await viteBuild({ configFile: "standalone/vite.config.ts" });
await build({
  entryPoints: ["standalone/server.ts"],
  outfile: "release/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
});
await mkdir("release", { recursive: true });
await writeFile(
  "release/package.json",
  JSON.stringify(
    {
      name: "vector-terminal-release",
      private: true,
      type: "module",
      scripts: { start: "node server.mjs" },
    },
    null,
    2,
  ),
);
console.log("Standalone ready: node release/server.mjs");

await mkdir("release/licenses", { recursive: true });
await copyFile(
  "node_modules/lightweight-charts/LICENSE",
  "release/licenses/lightweight-charts-LICENSE.txt",
);
await copyFile(
  "THIRD_PARTY_NOTICES.md",
  "release/licenses/THIRD_PARTY_NOTICES.md",
);
await mkdir("release/licenses/sonarlab", { recursive: true });
for (const source of [
  "references/sonarlab-ob-original.pine",
  "src/indicators/order-blocks.ts",
  "src/indicators/order-blocks-settings.ts",
]) {
  await copyFile(
    source,
    `release/licenses/sonarlab/${source.split("/").at(-1)}`,
  );
}
