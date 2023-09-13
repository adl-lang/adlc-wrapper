import * as adlast from "../adl-gen/sys/adlast.ts";
import * as sys_types from '../adl-gen/sys/types.ts';

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
  // nameMung: NameMungFn;
}

export interface DeclConcreteTypeOpts {
  struct_: adlast.Struct;
  union_: adlast.Union;
}
// export type ScopedConcreteType<T, K extends keyof DeclConcreteTypeOpts> = {
//   moduleName: string;
//   decl: Decl<T, K>;
// };

export interface DeclTypeOpts {
  struct_: adlast.Struct;
  union_: adlast.Union;
  generic_struct_: adlast.Struct;
  generic_union_: adlast.Union;
}

export type ScopedType<T, K extends keyof DeclTypeOpts> = {
  moduleName: string;
  decl: Decl<T, K>;
};
export interface Decl<T, K extends keyof DeclTypeOpts> {
  name: string;
  version: sys_types.Maybe<number>;
  type_: {
    kind: K;
    value: T;
  };
  annotations: adlast.Annotations;
}

// // export type ScopedType = ScopedDecl<adlast.Struct | adlast.Union, "struct_" | "union_">
export type ScopedStruct = ScopedType<adlast.Struct, "struct_">;
export type ScopedUnion = ScopedType<adlast.Union, "union_">;
// export type ScopedGenericStruct = ScopedDecl<adlast.Struct, "generic_struct_">;
// export type ScopedGenericUnion = ScopedDecl<adlast.Union, "generic_union_">;
export type ScopedConcreteType = ScopedStruct | ScopedUnion;

export interface Resources {
  concrete: ScopedConcreteType[];
  generic: ScopedType<unknown, "generic_struct_" | "generic_union_">[];
  // scopedDecls: adlast.ScopedDecl[];
  moduleNames: string[];
  declMap: Record<string, adlast.ScopedDecl>;
}

export async function loadResources(
  params: LoadResourcesParams,
): Promise<{ loadedAdl: LoadedAdl, resources: Resources; }> {
  const loadedAdl = await parseAdlModules(params);
  const moduleNames: Set<string> = new Set();
  const resources: Resources = {
    concrete: [],
    generic: [],
    // scopedDecls: [],
    moduleNames: [],
    declMap: {},
  };

  const acceptAll = (_scopedDecl: adlast.ScopedDecl) => true;
  const filter = params.filter ?? acceptAll;

  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const decl = scopedDecl.decl;
    resources.declMap[`${scopedDecl.moduleName}.${decl.name}`] = scopedDecl;
    const accepted = filter(scopedDecl);
    if (!accepted) {
      return;
    }
    if (!params.adlModules.includes(scopedDecl.moduleName)) {
      return;
    }
    moduleNames.add(scopedDecl.moduleName);
    const st = getScopedTypes(loadedAdl, scopedDecl)
    // resources.scopedDecls.push(st);
    resources.concrete.push(...st.concrete)
    resources.generic.push(...st.generic)
  });

  // dbResources.tables.sort((t1, t2) => t1.name < t2.name ? -1 : t1.name > t2.name ? 1 : 0);
  resources.moduleNames = Array.from(moduleNames.keys());
  return { loadedAdl, resources };
}

export type ConcreteField = adlast.Field;
// export interface ConcreteField {
//   name: string;
//   serializedName: string;
//   typeExpr: ConcreteTypeExpr;
//   default: sys_types.Maybe<{}|null>;
//   annotations: adlast.Annotations;
// }
// export interface ConcreteTypeExpr {
//   typeRef: ConcreteTypeTypeRef;
//   parameters: ConcreteTypeExpr[];
// }
// export type ConcreteTypeTypeRef = ConcreteTypeTypeRef_Primitive | ConcreteTypeTypeRef_TypeParam | ConcreteTypeTypeRef_Reference;

export type ScopedTypes = {
  concrete: ScopedConcreteType[];
  generic: ScopedType<unknown, "generic_struct_" | "generic_union_">[];
};

/**
 * Returns a (one) concrete type for the provided scopedDecl (i.e. type and newtype are expanded) and
 * if any fields are generic returns synthetic
 */
function getScopedTypes(loadedAdl: LoadedAdl, scopedDecl: adlast.ScopedDecl): ScopedTypes {

  function _fromDecl(path: string[], scopedDecl: adlast.ScopedDecl, typeBindings: TypeBinding[]): ScopedTypes {
    switch (scopedDecl.decl.type_.kind) {
      case "type_":
      case "newtype_": {
        const typeExpr0 = scopedDecl.decl.type_.value.typeExpr;
        const typeExpr = substituteTypeBindings(typeExpr0, typeBindings);
        return _fromTypeExpr([...path, `${scopedDecl.decl.type_.kind}:${scopedDecl.decl.name}`], scopedDecl, typeExpr);
      }
      case "struct_":
      case "union_": {
        return {
          generic: [],
          concrete: [_makeScopedType(scopedDecl as ScopedConcreteType, scopedDecl.decl.type_.kind, typeBindings)]
        };
      }
    }
  }

  // ScopedConcreteType<T, K extends keyof DeclConcreteTypeOpts>

  function _makeScopedType<K extends keyof DeclConcreteTypeOpts>(
    scopedDecl: ScopedConcreteType,
    // scopedDecl: ScopedConcreteType<DeclConcreteTypeOpts[K],K>,
    kind: K,
    typeBindings: TypeBinding[]
  ): ScopedConcreteType {
    return {
      moduleName: scopedDecl.moduleName,
      decl: {
        name: scopedDecl.decl.name,
        annotations: scopedDecl.decl.annotations,
        version: scopedDecl.decl.version,
        type_: {
          kind,
          value: {
            typeParams: scopedDecl.decl.type_.value.typeParams,
            fields: scopedDecl.decl.type_.value.fields.flatMap(f => _fromField(f, typeBindings)),
          }
        }
      }
    } as ScopedConcreteType;
  }

  function _fromTypeExpr(path: string[], scopedDecl: adlast.ScopedDecl, typeExpr: adlast.TypeExpr): ScopedTypes {
    switch(typeExpr.typeRef.kind) {
      case "reference": {
        const sd = loadedAdl.resolver(typeExpr.typeRef.value);
        const typeParams = sd.decl.type_.value.typeParams;
        const typeBindings = createTypeBindings(typeParams, typeExpr.parameters);
        return _fromDecl(path, sd, typeBindings);    
      }
      case "primitive":
        throw new Error(`type expressions can't be reference a primative (for now), please wrap it. ${path.join("->")} '${scopedDecl.moduleName}.${scopedDecl.decl.name}' ${typeExpr.typeRef.kind}`);
      case "typeParam":
        throw new Error(`type expressions can't be reference a typeParam. ${path.join("->")} '${scopedDecl.moduleName}.${scopedDecl.decl.name}' ${typeExpr.typeRef.kind}`);
      }
  }

  function _fromField(field: adlast.Field, typeBindings: TypeBinding[]): ConcreteField[] {
    const typeExpr = substituteTypeBindings(field.typeExpr, typeBindings);
    // const isSpread = getAnnotation(field.annotations, DB_SPREAD) !== undefined;
    // if (isSpread) {
    //   return _fromTypeExpr(typeExpr);
    // }
    return [{
      name: field.name,
      serializedName: field.serializedName,
      typeExpr,
      default: field.default,
      annotations: field.annotations
    }];
  }

  return _fromDecl([`${scopedDecl.decl.type_.kind}:${scopedDecl.decl.name}`], scopedDecl, []);

}

export interface TypeBinding {
  name: string,
  value: adlast.TypeExpr,
}

export function createTypeBindings(names: string[], values: adlast.TypeExpr[]): TypeBinding[] {
  const result: TypeBinding[] = [];
  for (let i = 0; i < names.length; i++) {
    result.push({ name: names[i], value: values[i] });
  }
  return result;
}

export function substituteTypeBindings(texpr: adlast.TypeExpr, bindings: TypeBinding[]): adlast.TypeExpr {
  const parameters = texpr.parameters.map(
    te => substituteTypeBindings(te, bindings)
  );

  if (texpr.typeRef.kind == 'typeParam') {
    const name = texpr.typeRef.value;
    const binding = bindings.find(b => b.name === name);
    if (!binding) {
      return {
        typeRef: texpr.typeRef,
        parameters
      };
    } else {
      if (parameters.length != 0) {
        throw new Error("Type param not a concrete type");
      }
      return binding.value;
    }
  }

  return {
    typeRef: texpr.typeRef,
    parameters
  };
}