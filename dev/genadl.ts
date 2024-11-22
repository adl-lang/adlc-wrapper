import {
  genTypescript
} from "../mod.ts";

async function main() {
  const verbose = false;

  const tsadldir = "./adlgen";

  await genTypescript({
    adlModules: [
      "sys.adlast",
      "sys.dynamic",
      "sys.annotations",
      "sys.types",
    ],
    tsStyle: "deno",
    outputDir: tsadldir,
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
