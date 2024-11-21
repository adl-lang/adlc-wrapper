import { execAdlc } from "./utils/exec.ts";
import { type AdlSourceParams, compilerSourceArgsFromParams } from "./utils/sources.ts";

export interface GenTypescriptParams extends AdlSourceParams {
  outputDir: string;

  runtimeDir?: string;
  verbose?: boolean;
  noOverwrite?: boolean;
  manifest?: string;
  generateTransitive?: boolean;
  includeRuntime?: boolean;
  tsStyle?: "tsc" | "deno";
  includeResolver?: boolean;
  excludeAst?: boolean;
  excludeAstAnnotations?: [];
}

export async function genTypescript(params: GenTypescriptParams): Promise<void> {
  let args: string[] = ["typescript"];
  
  args = args.concat(["--outputdir", params.outputDir]);

  if (params.runtimeDir) {
    args = args.concat(["--runtime-dir", params.runtimeDir]);
  }
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
  if (params.tsStyle) {
    args = args.concat(["--ts-style", params.tsStyle]);
  }
  if (params.includeResolver === undefined || params.includeResolver) {
    args.push("--include-resolver");
  }
  if (params.excludeAst) {
    args.push("--exclude-ast");
  }
  if (params.excludeAstAnnotations != undefined) {
    args = args.concat([
      "--excluded-ast-annotations",
      params.excludeAstAnnotations.join(","),
    ]);
  }

  const sourceArgs = await compilerSourceArgsFromParams(params);
  args = args.concat(sourceArgs);

  if (params.verbose) {
    console.log("Executing", args);
  }

  return execAdlc(args);
}
