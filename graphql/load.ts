import * as adlast from "../adl-gen/sys/adlast.ts";
import * as sys_types from '../adl-gen/sys/types.ts';

import {
  LoadedAdl,
  ParseAdlParams,
  forEachDecl,
  parseAdlModules,
  scopedNamesEqual
} from "../utils/adl.ts";

export interface LoadResourcesParams extends ParseAdlParams {
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  filter_sn: (sn: adlast.ScopedName) => boolean;
  typeExprToTypeName(te: adlast.TypeExpr): string
  // nameMung: NameMungFn;
}

export interface DeclConcreteTypeOpts {
  struct_: adlast.Struct;
  union_: adlast.Union;
}
export interface DeclTypeOpts {
  struct_: adlast.Struct;
  union_: adlast.Union;
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

export type ScopedStruct = ScopedType<adlast.Struct, "struct_">;
export type ScopedUnion = ScopedType<adlast.Union, "union_">;
export type ScopedConcreteType = ScopedStruct | ScopedUnion;

export interface SchemaType {
  scopedDecl: ScopedConcreteType;
  fields: SchemaField[];
}

type MonomophicType = {
  name: string,
  typeExpr: adlast.TypeExpr,
  genericDecl: SchemaType,
  referencesBy: string[];
};

export interface Resources {
  schemaTypes: SchemaType[];
  schemaGenerics: SchemaType[];
  monomorphicTypes: MonomophicType[];
  declMap: Record<string, SchemaType>;
  isRef: (sd: adlast.ScopedDecl) => boolean;
}

export async function loadResources(
  params: LoadResourcesParams,
): Promise<{ loadedAdl: LoadedAdl, resources: Resources; }> {
  const loadedAdl = await parseAdlModules(params);
  const references: Set<string> = new Set();
  const resources: Resources = {
    schemaTypes: [],
    schemaGenerics: [],
    monomorphicTypes: [],
    declMap: {},
    isRef: (sd: adlast.ScopedDecl) => references.has(`${sd.moduleName}.${sd.decl.name}`)
  };

  const acceptAll = (_scopedDecl: adlast.ScopedDecl) => true;
  const filter = params.filter ?? acceptAll;

  let otherTypes: adlast.ScopedDecl[] = []

  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const decl = scopedDecl.decl;
    const accepted = filter(scopedDecl);
    if (!accepted) {
      return;
    }
    const { st, unfocusedRef } = getSchemaFields(scopedDecl);
    if( undefined === st.fields.find(f => !f.concrete) ) {
      resources.schemaTypes.push(st)
    } else {
      resources.schemaGenerics.push(st)
    }
    resources.declMap[`${scopedDecl.moduleName}.${decl.name}`] = st;
    otherTypes.push(...unfocusedRef)
  });

  while( true ) {
    if( otherTypes.length == 0 ) {
      break
    }
    const otherTypes2: adlast.ScopedDecl[] = []
    otherTypes = otherTypes.filter(scopedDecl => resources.declMap[`${scopedDecl.moduleName}.${scopedDecl.decl.name}`] === undefined)
    otherTypes.forEach(scopedDecl => {
      const { st, unfocusedRef } = getSchemaFields(scopedDecl);
      if( undefined === st.fields.find(f => !f.concrete) ) {
        resources.schemaTypes.push(st)
      } else {
        resources.schemaGenerics.push(st)
      }
      resources.declMap[`${scopedDecl.moduleName}.${scopedDecl.decl.name}`] = st;
      otherTypes2.push(...unfocusedRef)
    })
    otherTypes = otherTypes2
  }

  const monos: Record<string, MonomophicType> = {};
  resources.schemaTypes.forEach(st => {
    st.fields.forEach(f => {
      if (f.monomophofised) {
        const name = params.typeExprToTypeName(f.typeExpr);
        const mono = monos[name];
        if (mono) {
          mono.referencesBy.push(`${st.scopedDecl.decl.name}::${f.name}`);
        } else {
          const typeRef = f.typeExpr.typeRef
          if(typeRef.kind !== "reference") {
            throw new Error("can only be a refenece")
          }
          monos[name] = {
            name,
            typeExpr: f.typeExpr,
            genericDecl: resources.declMap[`${typeRef.value.moduleName}.${typeRef.value.name}`],
            referencesBy: [`${st.scopedDecl.decl.name}::${f.name}`],
          };
        }
      }
    });
  });
  Object.keys(monos).forEach(k => {
    resources.monomorphicTypes.push(monos[k])
  })

  // dbResources.tables.sort((t1, t2) => t1.name < t2.name ? -1 : t1.name > t2.name ? 1 : 0);
  // resources.moduleNames = Array.from(moduleNames.keys());
  return { loadedAdl, resources };

  function getSchemaFields(scopedDecl: adlast.ScopedDecl): {st: SchemaType, unfocusedRef: adlast.ScopedDecl[]} {
    const unfocusedRef: adlast.ScopedDecl[] = []

    function _fromDecl(scopedDecl: adlast.ScopedDecl, typeBindings: TypeBinding[]): SchemaField[] {
      switch (scopedDecl.decl.type_.kind) {
        case "type_":
        case "newtype_": {
          const typeExpr0 = scopedDecl.decl.type_.value.typeExpr;
          const typeExpr = substituteTypeBindings(typeExpr0, typeBindings);
          return _fromTypeExpr(typeExpr);
        }
        case "struct_":
        case "union_": {
          return scopedDecl.decl.type_.value.fields.map(f => _fromField(f, typeBindings));
        }
      }
    }

    function _fromTypeExpr(typeExpr: adlast.TypeExpr): SchemaField[] {
      switch (typeExpr.typeRef.kind) {
        case "reference": {
          const sd = loadedAdl.resolver(typeExpr.typeRef.value);
          const typeParams = sd.decl.type_.value.typeParams;
          const typeBindings = createTypeBindings(typeParams, typeExpr.parameters);
          return _fromDecl(sd, typeBindings);
        }
        case "primitive":
          throw new Error(`type expressions can't be reference a primative (for now), please wrap it. ${typeExpr.typeRef.kind}`);
        case "typeParam":
          throw new Error(`type expressions can't be reference a typeParam. ${typeExpr.typeRef.kind}`);
      }
    }

    function _fromField(field: adlast.Field, typeBindings: TypeBinding[]): SchemaField {
      let typeExpr = substituteTypeBindings(field.typeExpr, typeBindings);
      let card: Cardinality = "one";
      let concrete = true;
      switch (typeExpr.typeRef.kind) {
        case "primitive":
          switch (typeExpr.typeRef.value) {
            case "Vector":
              card = "many";
              // should probably recurse
              // currently output [X] or [X]! should ouput [X!] or [X]!
              typeExpr = typeExpr.parameters[0];
              break;
            case "Nullable":
              card = "one";
              typeExpr = typeExpr.parameters[0];
              break;
            case "StringMap":
              card = "map";
              typeExpr = typeExpr.parameters[0];
              break;
          }
          break;
        case "typeParam":
          concrete = false
          break
      }
      let monomophofised = false
      if (typeExpr.typeRef.kind === "reference") {
        if (scopedNamesEqual(REF, typeExpr.typeRef.value)) {
          typeExpr = typeExpr.parameters[0];
          switch(typeExpr.typeRef.kind) {
            case "typeParam":
              concrete = false
              break
            case "reference":
              if(scopedNamesEqual(REF, typeExpr.typeRef.value)) {
                throw new Error(`In Ref<Ref<T>>, ref<ref<>>> is not supported. ${JSON.stringify(typeExpr.typeRef)}`);
              }
              const sn = typeExpr.typeRef.value
              references.add(sn.moduleName + "." + sn.name);
              if (!params.filter_sn(sn)) {
                if( undefined === unfocusedRef.find(x => x.moduleName === sn.moduleName && x.decl.name === sn.name) ) {
                  const exRef = loadedAdl.resolver(typeExpr.typeRef.value)
                  unfocusedRef.push(exRef)
                }
              }
              break
            case "primitive":
              throw new Error(`In Ref<T> T only references are supported.`);
          }
        }
        // collect monophoric uses of generics (references only)
        monomophofised = typeExpr.parameters.length > 0 && concrete
      }
      return {
        name: field.name,
        serializedName: field.serializedName,
        typeExpr,
        card,
        concrete,
        monomophofised,
        default: field.default,
        annotations: field.annotations
      };
    }

    const st = {
      scopedDecl: scopedDecl as ScopedConcreteType,
      fields: _fromDecl(scopedDecl, []),
    }
    return {
      st,
      unfocusedRef,
    };
  }
}

const REF = adlast.makeScopedName({ moduleName: "savanti.schema.v1.types", name: "Ref" });

type Cardinality = "optional" | "one" | "many" | "map";

export type SchemaField = adlast.Field & {
  card: Cardinality;
  concrete: boolean;
  monomophofised: boolean;
};

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