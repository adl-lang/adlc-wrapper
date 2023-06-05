export interface GenRustParams {
  adlFiles: string[];
  searchPath: string[];
  outputDir: string;
  module: string;
  runtimeModule: string;

  mergeAdlExts?: string[];
  verbose?: boolean;
  noOverwrite?: boolean;
  manifest?: string;
  generateTransitive?: boolean;
  includeRuntime?: boolean;
}

export async function genRust(params: GenRustParams) {
  let cmd: string[] = ["adlc", "rust"];
  params.searchPath.forEach((dir) => {
    cmd = cmd.concat(["--searchdir", dir]);
  });
  cmd = cmd.concat(["--outputdir", params.outputDir]);
  cmd = cmd.concat(["--module", params.module]);

  cmd = cmd.concat(["--runtime-module", params.runtimeModule]);

  const mergeAdlExts = params.mergeAdlExts || [];
  mergeAdlExts.forEach((ext) => {
    cmd = cmd.concat(["--merge-adlext", ext]);
  });

  if (params.verbose) {
    cmd.push("--verbose");
  }
  if (params.noOverwrite) {
    cmd.push("--no-overwrite");
  }
  if (params.manifest) {
    cmd = cmd.concat(["--manifest", params.manifest]);
  }
  if (params.generateTransitive) {
    cmd.push("--generate-transitive");
  }
  if (params.includeRuntime) {
    cmd.push("--include-rt");
  }
  cmd = cmd.concat(params.adlFiles);
  if (params.verbose) {
    console.log("Executing", cmd);
  }

  const proc = Deno.run({ cmd });
  const status = await proc.status();
  if (!status.success) {
    throw new Error("Failed to run adl rust");
  }
}
