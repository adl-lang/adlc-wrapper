import { execAdlc } from "./utils/exec.ts";
import { type AdlSourceParams, compilerSourceArgsFromParams } from "./utils/sources.ts";

export interface GenJavaParams extends AdlSourceParams {
  package: string;
  outputDir: string;

  verbose?: boolean;
  noOverwrite?: boolean;
  manifest?: string;
  generateTransitive?: boolean;
  includeRuntime?: boolean;
  runtimePackage?: string;
  headerComment?: string;
  suppressWarningsAnnotation?: string;
}

export async function genJava(params: GenJavaParams): Promise<void> {
  let args: string[] = ["java"];
  args = args.concat(["--package", params.package]);
  args = args.concat(["--outputdir", params.outputDir]);

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
  if (params.runtimePackage) {
    args = args.concat(["--rtpackage", params.runtimePackage]);
  }
  if (params.headerComment) {
    args = args.concat(["--header-comment", params.headerComment]);
  }
  if (params.suppressWarningsAnnotation) {
    args = args.concat([
      "--suppress-warnings-annotation",
      params.suppressWarningsAnnotation,
    ]);
  }

  const sourceArgs = await compilerSourceArgsFromParams(params);
  args = args.concat(sourceArgs);
  if (params.verbose) {
    console.log("Executing", args);
  }

  return execAdlc(args);
}
