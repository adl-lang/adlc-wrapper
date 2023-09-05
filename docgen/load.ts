import * as adlast from "../adl-gen/sys/adlast.ts";
import {
  LoadedAdl,
  ParseAdlParams,
  forEachDecl,
  parseAdlModules,
  getAnnotation, scopedName
} from "../utils/adl.ts";
import {
  NameMungFn
} from "./utils.ts";

export interface LoadResourcesParams extends ParseAdlParams {
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  nameMung: NameMungFn;
}

export type ScopedDecl<T, K extends keyof adlast.DeclTypeOpts> = {
  moduleName: string;
  decl: Decl<T, K>;
}
export interface Decl<T, K extends keyof adlast.DeclTypeOpts> {
  name: string;
  type_: {
    kind: K;
    value: T;
  };
  annotations: adlast.Annotations;
}

export interface Resources {
  scopedDecls: adlast.ScopedDecl[];
  moduleNames: string[];
  declMap: Record<string, adlast.ScopedDecl>;
}

export async function loadResources(
  params: LoadResourcesParams,
): Promise<{ loadedAdl: LoadedAdl, resources: Resources; }> {
  const loadedAdl = await parseAdlModules(params);
  const moduleNames: Set<string> = new Set();
  const resources: Resources = {
    scopedDecls: [],
    moduleNames: [],
    declMap: {},
  };

  const acceptAll = (_scopedDecl: adlast.ScopedDecl) => true;
  const filter = params.filter ?? acceptAll;

  // Find all of the struct declarations that have a DbTable annotation
  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const accepted = filter(scopedDecl);
    if (!accepted) {
      return;
    }
    if (!params.adlModules.includes(scopedDecl.moduleName)) {
      return;
    }
    moduleNames.add(scopedDecl.moduleName);
    const decl = scopedDecl.decl
    resources.declMap[`${scopedDecl.moduleName}.${decl.name}`] = scopedDecl;
    if( getAnnotation(scopedDecl.decl.annotations, HIDDEN) !== undefined ) {
      return
    }
    // switch (scopedDecl.decl.type_.kind) {
    //   case "struct_":
    //     resources.structs.push(scopedDecl as ScopedDecl<adlast.Struct, "struct_">);
    //     break;
    //   case "union_":
    //     resources.unions.push(scopedDecl as ScopedDecl<adlast.Union, "union_">);
    //     break;
    //   case "type_":
    //     resources.aliases.push(scopedDecl as ScopedDecl<adlast.TypeDef, "type_">);
    //     break;
    //   case "newtype_":
    //     resources.newtypes.push(scopedDecl as ScopedDecl<adlast.NewType, "newtype_">);
    //     break;
    // }
    resources.scopedDecls.push(scopedDecl);
  });

  // dbResources.tables.sort((t1, t2) => t1.name < t2.name ? -1 : t1.name > t2.name ? 1 : 0);
  resources.moduleNames = Array.from(moduleNames.keys());
  return { loadedAdl, resources };
}

export const HIDDEN = scopedName("common.mspec", "Hidden");
