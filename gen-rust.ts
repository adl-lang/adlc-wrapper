import { AdlSourceParams, compilerSourceArgsFromParams } from "./utils/sources.ts";

export interface GenRustParams extends AdlSourceParams{
  outputDir: string;
  module: string;
  runtimeModule: string;

  verbose?: boolean;
  noOverwrite?: boolean;
  manifest?: string;
  generateTransitive?: boolean;
  includeRuntime?: boolean;
}

export async function genRust(params: GenRustParams) {
  let cmd: string[] = ["adlc", "rust"];
  cmd = cmd.concat(["--outputdir", params.outputDir]);
  cmd = cmd.concat(["--module", params.module]);
  cmd = cmd.concat(["--runtime-module", params.runtimeModule]);

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
  const sourceArgs = await compilerSourceArgsFromParams(params);
  cmd = cmd.concat(sourceArgs);

  if (params.verbose) {
    console.log("Executing", cmd);
  }

  const proc = Deno.run({ cmd });
  const status = await proc.status();
  if (!status.success) {
    throw new Error("Failed to run adl rust");
  }
}
