// Nest Egg — hand-in program for make.fun.
// Copies app/ and screenshots/ into the output directory and writes
// dossier.json with the kit's buildDossier. Node 22+, stdlib only.
// Output goes to $MAKEFUN_OUTPUT_DIR, defaulting to /output.
// The run is deterministic: files are copied in sorted order and the
// dossier is built purely from the copied tree.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-frontend.ts";

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16 * 1024 * 1024,
  app_path_max_bytes: 1000,
};

function sortedEntries(dir: string): string[] {
  return readdirSync(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const name of sortedEntries(src)) {
    const from = join(src, name);
    const to = join(dst, name);
    const info = statSync(from);
    if (info.isDirectory()) {
      copyTree(from, to);
    } else if (info.isFile()) {
      cpSync(from, to);
    }
  }
}

function clearDir(dir: string): void {
  // Clear only the directory's CONTENTS, never the directory itself:
  // the grader bind-mounts an empty directory at /output, and removing
  // a mount point fails with EBUSY ("Device or resource busy") — that
  // is what rejected the first submission (run_completes, exit code 1).
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

function main(): void {
  const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
  const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || "/output");
  clearDir(outDir);

  for (const folder of ["app", "screenshots"]) {
    const src = join(here, folder);
    if (!existsSync(src)) throw new Error(`main.ts: missing ${folder}/ in the repository`);
    copyTree(src, join(outDir, folder));
  }

  const dossier = buildDossier(outDir, CAPS);
  writeFileSync(join(outDir, "dossier.json"), dossier);

  // The grader runs this program twice and demands byte-identical
  // output, so prove it here instead of hoping: rebuild the dossier
  // from the copied tree and refuse to hand in a run that disagrees
  // with itself.
  const rebuilt = buildDossier(outDir, CAPS);
  const same = dossier.length === rebuilt.length &&
    Buffer.from(dossier).equals(Buffer.from(rebuilt));
  if (!same) {
    throw new Error("main.ts: dossier is not deterministic across builds");
  }
  const shotCount = readdirSync(join(outDir, "screenshots")).length;
  const appCount = readdirSync(join(outDir, "app")).length;
  console.log(`Nest Egg handed in: ${outDir} (${appCount} app files, ${shotCount} screenshots, dossier ${dossier.length} bytes)`);
}

main();
