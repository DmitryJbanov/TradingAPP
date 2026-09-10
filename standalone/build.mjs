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
// Include the licensed, modified indicator sources alongside the release.
for (const name of ["drz", "smc"]) {
  await mkdir(`release/licenses/${name}`, { recursive: true });
  for (const source of [
    `references/${name}-original.pine`,
    `src/indicators/${name}.ts`,
    `src/indicators/${name}-settings.ts`,
    "src/indicators/overlay-model.ts",
    "src/indicators/overlay-settings.ts",
    "src/indicators/price-overlays-renderer.ts",
    "src/hooks/use-overlays.ts",
    "src/components/overlay-settings-dialog.tsx",
  ]) {
    await copyFile(
      source,
      `release/licenses/${name}/${source.split("/").at(-1)}`,
    );
  }
}

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
