import { execAdlc } from "./utils/exec.ts";
import { type AdlSourceParams, compilerSourceArgsFromParams } from "./utils/sources.ts";

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

export async function genRust(params: GenRustParams): Promise<void> {
  let args: string[] = ["rust"];
  args = args.concat(["--outputdir", params.outputDir]);
  args = args.concat(["--module", params.module]);
  args = args.concat(["--runtime-module", params.runtimeModule]);

  if (params.verbose) {
    args.push("--verbose");
  }
  if (params.noOverwrite) {
    args.push("--no-overwrite");
  }
  if (params.manifest) {
    args = args.concat(["--manifest", params.manifest]);
  }
  if (params.generateTransitive) {
    args.push("--generate-transitive");
  }
  if (params.includeRuntime) {
    args.push("--include-rt");
  }
  const sourceArgs = await compilerSourceArgsFromParams(params);
  args = args.concat(sourceArgs);

  if (params.verbose) {
    console.log("Executing", args);
  }

  return execAdlc(args);
}
