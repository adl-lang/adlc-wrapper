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

// export interface DeclConcreteTypeOpts {
//   struct_: adlast.Struct;
//   union_: adlast.Union;
// }
// export interface DeclTypeOpts {
//   struct_: adlast.Struct;
//   union_: adlast.Union;
// }

// export type ScopedType<T, K extends keyof DeclTypeOpts> = {
//   moduleName: string;
//   decl: Decl<T, K>;
// };
// export interface Decl<T, K extends keyof DeclTypeOpts> {
//   name: string;
//   version: sys_types.Maybe<number>;
//   type_: {
//     kind: K;
//     value: T;
//   };
//   annotations: adlast.Annotations;
// }

// export type ScopedStruct = ScopedType<adlast.Struct, "struct_">;
// export type ScopedUnion = ScopedType<adlast.Union, "union_">;
// export type ScopedConcreteType = ScopedStruct | ScopedUnion;

// export interface SchemaType {
//   scopedDecl: ScopedConcreteType;
//   fields: SchemaField[];
//   isReferenced: boolean;
// }

// type Cardinality = "optional" | "one" | "many" | "stringmap";

// export type SchemaField = adlast.Field & {
//   card: Cardinality;
//   // concrete: boolean;
//   // monomophofised: boolean;
// };

// type MonomophicType = {
//   name: string,
//   typeExpr: adlast.TypeExpr,
//   genericDecl: SchemaType,
//   referencesBy: string[];
// };

// export interface Resources {
//   schemaTypes: SchemaType[];
//   schemaGenerics: SchemaType[];
//   monomorphicTypes: MonomophicType[];
//   declMap: Record<string, SchemaType>;
// }

export async function loadResources(
  params: LoadResourcesParams,
): Promise<{ loadedAdl: LoadedAdl
  // , resources: Resources; 
}> {
  const loadedAdl = await parseAdlModules(params);
  const references: Set<string> = new Set();
  const declSeen: Record<string, adlast.ScopedDecl> = {};
  // const resources: Resources = {
  //   schemaTypes: [],
  //   schemaGenerics: [],
  //   monomorphicTypes: [],
  //   declMap: {},
  // };

  const acceptAll = (_scopedDecl: adlast.ScopedDecl) => true;
  const filter = params.filter ?? acceptAll;

  let otherTypes: adlast.ScopedDecl[] = []

  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const decl = scopedDecl.decl;
    const accepted = filter(scopedDecl);
    if (!accepted) {
      return;
    }
    const { unfocusedRef } = getSchemaFields(scopedDecl);
    // if( undefined === st.fields.find(f => !f.concrete) ) {
    //   resources.schemaTypes.push(st)
    // } else {
    //   resources.schemaGenerics.push(st)
    // }
    declSeen[`${scopedDecl.moduleName}.${scopedDecl.decl.name}`] = scopedDecl;
    otherTypes.push(...unfocusedRef)
  });

  while( true ) {
    if( otherTypes.length == 0 ) {
      break
    }
    const otherTypes2: adlast.ScopedDecl[] = []
    otherTypes = otherTypes.filter(scopedDecl => declSeen[`${scopedDecl.moduleName}.${scopedDecl.decl.name}`] === undefined)
    otherTypes.forEach(scopedDecl => {
      const { unfocusedRef } = getSchemaFields(scopedDecl);
      // if( undefined === st.fields.find(f => !f.concrete) ) {
      //   resources.schemaTypes.push(st)
      // } else {
      //   resources.schemaGenerics.push(st)
      // }
      declSeen[`${scopedDecl.moduleName}.${scopedDecl.decl.name}`] = scopedDecl;
      otherTypes2.push(...unfocusedRef)
    })
    otherTypes = otherTypes2
  }

  // const monos: Record<string, MonomophicType> = {};
  Object.keys(declSeen).forEach(sn => {
    const sd = declSeen[sn]
    const dgd = getAnnotation<DgraphDecl>(sd.decl.annotations, DGDECL)
    if( dgd === undefined ) {
      throw new Error("all seen decl should have been annotated")
    }
    dgd.referenced = references.has(sn)
    switch( sd.decl.type_.kind ) {
      case "union_":
      case "struct_": {
        sd.decl.type_.value.fields.forEach(f=> {
          const dgf = getAnnotation<DgraphField>(f.annotations, DGFIELD)
          if( dgf === undefined ) {
            throw new Error("all seen decl should have annotated fields")
          }
          if( dgf.monomophofised ) {
            const typeRef = f.typeExpr.typeRef
            if(typeRef.kind !== "reference") {
              throw new Error("can only be a refenece")
            }
            const generic = declSeen[`${typeRef.value.moduleName}.${typeRef.value.name}`]
            const name = params.typeExprToTypeName(f.typeExpr);
            let insts = getAnnotation<GenericInstance[]>(generic.decl.annotations, GENINSTS)
            if( insts === undefined ) {
              insts = []
              generic.decl.annotations.push({key: GENINSTS, value: insts})
            }
            const inst = insts.find(ins => ins.name === name)
            if( inst ) {
              inst.referencesBy.push(`${sd.decl.name}::${f.name}`)
            } else {
              insts.push({
                name,
                typeExpr: f.typeExpr,
                referencesBy: [`${sd.decl.name}::${f.name}`],
              })
            }
          }
        })
      }
    }
  });

  // dbResources.tables.sort((t1, t2) => t1.name < t2.name ? -1 : t1.name > t2.name ? 1 : 0);
  // resources.moduleNames = Array.from(moduleNames.keys());
  return { loadedAdl };

  function getSchemaFields(scopedDecl: adlast.ScopedDecl): {unfocusedRef: adlast.ScopedDecl[]} {
    const unfocusedRef: adlast.ScopedDecl[] = []
    _fromDecl(scopedDecl, [])
    return {
      unfocusedRef,
    };

    function _fromDecl(scopedDecl: adlast.ScopedDecl, typeBindings: TypeBinding[]): void {
      switch (scopedDecl.decl.type_.kind) {
        case "type_":
        case "newtype_": {
          const typeExpr0 = scopedDecl.decl.type_.value.typeExpr;
          const typeExpr = substituteTypeBindings(typeExpr0, typeBindings);
          return _fromTypeExpr(typeExpr);
        }
        case "struct_":
        case "union_": {
          const ff = (field: adlast.Field) => _fromField(field, typeBindings)
          const concretes = scopedDecl.decl.type_.value.fields.map(ff);
          const concrete = concretes.find(c => !c) === undefined
          const dgdecl: DgraphDecl = {
            concrete,
            referenced: false,
          }
          scopedDecl.decl.annotations.push({key: DGDECL, value: dgdecl})
          return
        }
      }
    }

    function _fromTypeExpr(typeExpr: adlast.TypeExpr): void {
      switch (typeExpr.typeRef.kind) {
        case "reference": {
          const sd = loadedAdl.resolver(typeExpr.typeRef.value);
          const typeParams = sd.decl.type_.value.typeParams;
          const typeBindings = createTypeBindings(typeParams, typeExpr.parameters);
          _fromDecl(sd, typeBindings);
          return
        }
        case "primitive":
          throw new Error(`type expressions can't be reference a primative (for now), please wrap it. ${typeExpr.typeRef.kind}`);
        case "typeParam":
          throw new Error(`type expressions can't be reference a typeParam. ${typeExpr.typeRef.kind}`);
      }
    }

    function _fromField(field: adlast.Field, typeBindings: TypeBinding[]): boolean {
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
              card = "optional";
              typeExpr = typeExpr.parameters[0];
              break;
            case "StringMap":
              card = "stringmap";
              typeExpr = typeExpr.parameters[0];
              break;
            case "Json":
              card = "optional"
              break;
          }
          break;
        case "typeParam":
          concrete = false
          break
      }
      let monomophofised = false
      if (typeExpr.typeRef.kind === "reference") {
        let sn = typeExpr.typeRef.value
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
              sn = typeExpr.typeRef.value
              collectTransitive(sn);
              references.add(sn.moduleName + "." + sn.name);
              break
            case "primitive":
              throw new Error(`In Ref<T> T only references are supported.`);
          }
        } else {
          collectTransitive(sn);
        }
        // collect monophoric uses of generics (references only)
        monomophofised = typeExpr.parameters.length > 0 && concrete
      }
      const dgfield: DgraphField = {
        card,
        monomophofised,
        concrete,
      }
      field.annotations.push({key: DGFIELD, value: dgfield})
      return concrete
      // return {
      //   name: field.name,
      //   serializedName: field.serializedName,
      //   typeExpr,
      //   card,
      //   concrete,
      //   monomophofised,
      //   default: field.default,
      //   annotations: field.annotations
      // };

      function collectTransitive(sn: adlast.ScopedName) {
        if(!params.filter_sn(sn)) {
          if(undefined === unfocusedRef.find(x => x.moduleName === sn.moduleName && x.decl.name === sn.name)) {
            const exRef = loadedAdl.resolver(sn);
            unfocusedRef.push(exRef);
          }
        }
      }
    }
  }
}

const REF = adlast.makeScopedName({ moduleName: "savanti.schema.v1.types", name: "Ref" });
const GENINSTS = adlast.makeScopedName({ moduleName: "dgraph.annotations", name: "GenericInstances" });
const DGFIELD = adlast.makeScopedName({ moduleName: "dgraph.annotations", name: "DgraphField" });
const DGDECL = adlast.makeScopedName({ moduleName: "dgraph.annotations", name: "DgraphDecl" });

type DgraphDecl = {
  referenced: boolean,
  concrete: boolean
  // bindings: TypeBinding[]
}

type DgraphField = {
  card: Cardinality
  monomophofised: boolean
  concrete: boolean
  // bindings: TypeBinding[]
}

type GenericInstance = {
  name: string,
  typeExpr: adlast.TypeExpr,
  referencesBy: string[],
}

type Cardinality = "one" | "many" | "optional" | "stringmap"

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

function getAnnotation<T>(
  annotations: adlast.Annotations,
  annotationType: adlast.ScopedName,
): T | undefined {
  for (const ann of annotations) {
    if (scopedNamesEqual(ann.key, annotationType)) {
      return (ann.value as T);
    }
  }
  return undefined;
}