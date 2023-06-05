import {
  getAdlStdLibDir,
  globFiles,
  genTypescript
} from "../../adl-tsdeno/mod.ts";

async function main() {
  const adlStdLibDir = await getAdlStdLibDir();
  const verbose = false;
  const sysAdlFiles = await globFiles(adlStdLibDir, "**/sys/*.adl");
  const adlDir = './adl';
  const adlFiles = await globFiles(adlDir, '**/*.adl');

  const tsadldir = "./adl-gen";

  await genTypescript({
    adlFiles: [
      ...sysAdlFiles,
      ...adlFiles,
    ],
    tsStyle: "deno",
    outputDir: tsadldir,
    runtimeDir: "runtime",
    includeRuntime: true,
    searchPath: [adlDir],
    includeResolver: true,
    manifest: tsadldir + "/.adl-manifest",
    verbose,
  });
}

main()
  .catch((err) => {
    console.error("error in main", err);
  });
