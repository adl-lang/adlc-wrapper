import { getAdlStdLibDir } from "./fs.ts";
import { path, fs } from "../deps.ts";

export interface AdlSourceParams {
  mergeAdlExts?: string[],
  searchPath: string[],
  adlModules: string[],
}


export async function compilerSourceArgsFromParams(params: AdlSourceParams) : Promise<string[]> {
  let args: string[] = [];
  const searchPath = [
    await getAdlStdLibDir(),
    ...params.searchPath,
  ]

  searchPath.forEach((dir) => {
    args = args.concat(["--searchdir", dir]);
  });

  const mergeAdlExts = params.mergeAdlExts || [];
  mergeAdlExts.forEach((ext) => {
    args = args.concat(["--merge-adlext", ext]);
  });

  // The underlying ADL compiler currently expects file path
  // not named modules. Until it does, do the conversion
  // here
  for( const m of params.adlModules) {
    const filePath = await getAdlModuleFile(searchPath, m);
    args.push(filePath);
  }
  return args;
}

export async function getAdlModuleFile(searchPath: string[], module: string): Promise<string> {
  const relFileName = module.replace(".", "/") + ".adl";
  for(const basePath of searchPath) {
    const fileName = path.join(basePath, relFileName);
    if( await fs.exists(fileName)) {
      return fileName;
    }
  }
  throw new Error(`ADL module ${module} not found on search path`);

}