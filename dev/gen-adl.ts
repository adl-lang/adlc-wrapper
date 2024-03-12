import {
  getAdlStdLibDir,
  globFiles,
  genTypescript
} from "../../adl-tsdeno/mod.ts";

async function main() {
  const verbose = false;

  const tsadldir = "./adl-gen";

  await genTypescript({
    adlModules: [
      "sys.adlast",
      "sys.dynamic",
      "sys.annotations",
      "sys.types",
    ],
    tsStyle: "deno",
    outputDir: tsadldir,
    runtimeDir: "runtime",
    includeRuntime: true,
    searchPath: [],
    includeResolver: true,
    manifest: tsadldir + "/.adl-manifest",
    verbose,
  });
}

main()
  .catch((err) => {
    console.error("error in main", err);
  });
