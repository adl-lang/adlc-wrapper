import { AdlSourceParams, compilerSourceArgsFromParams } from "./utils/sources.ts";

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

export async function genTypescript(params: GenTypescriptParams) {
  let cmd: string[] = ["adlc", "typescript"];
  
  cmd = cmd.concat(["--outputdir", params.outputDir]);

  if (params.runtimeDir) {
    cmd = cmd.concat(["--runtime-dir", params.runtimeDir]);
  }
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
  if (params.tsStyle) {
    cmd = cmd.concat(["--ts-style", params.tsStyle]);
  }
  if (params.includeResolver === undefined || params.includeResolver) {
    cmd.push("--include-resolver");
  }
  if (params.excludeAst) {
    cmd.push("--exclude-ast");
  }
  if (params.excludeAstAnnotations != undefined) {
    cmd = cmd.concat([
      "--excluded-ast-annotations",
      params.excludeAstAnnotations.join(","),
    ]);
  }

  const sourceArgs = await compilerSourceArgsFromParams(params);
  cmd = cmd.concat(sourceArgs);

  if (params.verbose) {
    console.log("Executing", cmd);
  }

  const proc = Deno.run({ cmd });
  const status = await proc.status();
  if (!status.success) {
    throw new Error("Failed to run adl typescript");
  }
}
