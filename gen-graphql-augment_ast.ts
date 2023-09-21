import { RESOLVER } from "./adl-gen/resolver.ts";
import { createJsonBinding } from "./adl-gen/runtime/json.ts";
import { typeExprToStringUnscoped } from "./adl-gen/runtime/utils.ts";
import * as adlast from "./adl-gen/sys/adlast.ts";
import * as adl from "./adl-gen/runtime/adl.ts";
import {
  loadResources
} from "./graphql/load.ts";
import {
  FileWriter
} from "./graphql/utils.ts";
import {
  ParseAdlParams,
  getAnnotation
} from "./utils/adl.ts";

export interface AugmentAstWithDgraphAnnotationsParams extends ParseAdlParams {
  extensions?: string[];
  verbose?: boolean;
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  output_file: string;
  output_ast_file?: string;
  focus_modules?: string[];
}

export async function augmentAstWithDgraphAnnotations(
  params0: AugmentAstWithDgraphAnnotationsParams,
): Promise<void> {
  const params = {
    ...params0,
    filter_sn: (sn: adlast.ScopedName) => {
      if (params0.focus_modules) {
        return params0.focus_modules.includes(sn.moduleName);
      }
      // if needed check annotation here
      return true;
    },
    filter: (scopedDecl: adlast.ScopedDecl) => {
      if (!params.adlModules.includes(scopedDecl.moduleName)) {
        return false;
      }
      if (params0.focus_modules) {
        return params0.focus_modules.includes(scopedDecl.moduleName);
      }
      // if needed check annotation here
      return true;
    },
    typeExprToTypeName: typeExprToGraphqlType,
  };
  const { loadedAdl } = await loadResources(params);
  loadedAdl.allAdlDecls

  const moduleMapJB = createJsonBinding(
    RESOLVER,
    adl.texprStringMap(adlast.texprModule()),
  );
  const modules = moduleMapJB.toJson(loadedAdl.modules)
  Deno.stdout.writeSync(new TextEncoder().encode(JSON.stringify(modules, null, 2)))
}

function typeExprToGraphqlType(te: adlast.TypeExpr): string {
  switch (te.typeRef.kind) {
    case "primitive":
      return adl2graphqlType(te.typeRef.value);
    case "reference":
      if (te.parameters.length > 0) {
        return `_${te.typeRef.value.name}_${te.parameters.map(p => typeExprToGraphqlType(p)).join("_")}`;
      }
      return te.typeRef.value.name;
    case "typeParam":
      throw new Error(`typeParam not valid here`);
  }
}

function adl2graphqlType(ptype: string) {
  switch (ptype) {
    case "String":
      return "String";
    case "Bool":
      return "Boolean";
    case "Json":
      return "String";
    case "Int8":
      return "Int";
    case "Int16":
      return "Int";
    case "Int32":
      return "Int";
    case "Int64":
      return "Int";
    case "Word8":
      return "Int";
    case "Word16":
      return "Int";
    case "Word32":
      return "Int";
    case "Word64":
      return "Int";
    case "Float":
      return "Float";
    case "Double":
      return "Float";
  }
  return "String";
}