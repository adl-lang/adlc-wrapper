import { typeExprToStringUnscoped } from "./adl-gen/runtime/utils.ts";
import * as adlast from "./adl-gen/sys/adlast.ts";
import {
  loadResources,
  getAnnotation,
  DGDECL,
  DGFIELD,
  GENINSTS,
  REF,
  DgraphDecl,
  DgraphField,
  TypeBinding,
  createTypeBindings,
  substituteTypeBindings,
  GenericInstance,
} from "./graphql/load.ts";
import {
  FileWriter
} from "./graphql/utils.ts";
import {
  ParseAdlParams,
  forEachDecl,
  scopedNamesEqual,
} from "./utils/adl.ts";
import * as sys_types from './adl-gen/sys/types.ts';

export interface GenGraphqlSchemaParams extends ParseAdlParams {
  extensions?: string[];
  verbose?: boolean;
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  output_file: string;
  output_ast_file?: string;
  focus_modules?: string[];
}

export async function genCreateGraphqlSchema(
  params0: GenGraphqlSchemaParams,
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
  const resources: Resources = {
    schemaTypes: [],
    schemaGenerics: [],
    // monomorphicTypes: [],
    // declMap: {},
  };
  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const dgd = getAnnotation<DgraphDecl>(scopedDecl.decl.annotations, DGDECL);
    if (dgd === undefined) {
      return;
    }
    if (!dgd.concrete) {
      const insts = getAnnotation<GenericInstance[]>(scopedDecl.decl.annotations, GENINSTS);
      if (insts === undefined) {
        throw new Error("GENINSTS annotation should exist on dg generics");
      }
      const st = getSchemaFields(scopedDecl, dgd);
      resources.schemaGenerics.push({ ...st, insts });
      return;
    }
    resources.schemaTypes.push(getSchemaFields(scopedDecl, dgd));
  });

  const writer = new FileWriter(params.output_file, !!params.verbose);
  resources.schemaTypes.forEach(st => generateSchemaConcrete(st));

  writer.write(`# Generics as interfaces & monomophic implementations\n`);
  resources.schemaGenerics.forEach(gt => {
    switch (gt.scopedDecl.decl.type_.kind) {
      case "union_":
        throw new Error("Generics not implemented for unions");
      case "struct_": {
        writer.write(`interface ${gt.scopedDecl.decl.name} {\n`);
        const cfs = gt.fields.filter(f => f.dgf.concrete);
        if (cfs.length === 0) {
          writer.write(`    _phantom: Boolean\n`);
        }
        genStructFields(cfs);
        writer.write(`}\n`);
        writer.write(`\n`);
        gt.insts.forEach(mono => {
          writer.write(`# Used by ${mono.referencesBy.join(", ")}\n`);
          writer.write(`type ${mono.name} implements ${gt.scopedDecl.decl.name} {\n`);
          gt.fields.forEach(f => {
            if (!f.dgf.concrete) {
              if (f.field.typeExpr.typeRef.kind !== "typeParam") {
                throw new Error(`typeParam expected`);
              }
              const idx = gt.scopedDecl.decl.type_.value.typeParams.indexOf(f.field.typeExpr.typeRef.value);
              writer.write(`    ${f.field.name}: ${typeExprToGraphqlType(mono.typeExpr.parameters[idx])}\n`);
            }
          });
          writer.write(`}\n`);
          writer.write(`\n`);
        });
      }
    }
  });

  // resources.monomorphicTypes.forEach(mono => {
  //   writer.write(`# Used by ${mono.referencesBy.join(", ")}\n`);
  //   writer.write(`type ${mono.name} implements ${mono.genericDecl.scopedDecl.decl.name} {\n`);
  //   mono.genericDecl.fields.forEach(f => {
  //     if( !f.concrete ) {
  //       if(f.typeExpr.typeRef.kind !== "typeParam") {
  //         throw new Error(`typeParam expected`)
  //       }
  //       const idx = mono.genericDecl.scopedDecl.decl.type_.value.typeParams.indexOf(f.typeExpr.typeRef.value)
  //       writer.write(`    ${f.name}: ${typeExprToGraphqlType(mono.typeExpr.parameters[idx])}\n`)
  //     }
  //   })
  //   writer.write(`}\n`);
  // })

  writer.close();

  function getSchemaFields(scopedDecl: adlast.ScopedDecl, dgd: DgraphDecl): SchemaType {
    _fromDecl(scopedDecl, []);
    const st: SchemaType = {
      scopedDecl: scopedDecl as ScopedConcreteType,
      fields: _fromDecl(scopedDecl, []),
      dgd,
    };
    return st;

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
          const ff = (field: adlast.Field) => _fromField(field, typeBindings);
          return scopedDecl.decl.type_.value.fields.map(ff);
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
      let dgf = getAnnotation<DgraphField>(field.annotations, DGFIELD);
      let typeExpr = substituteTypeBindings(field.typeExpr, typeBindings);
      switch (typeExpr.typeRef.kind) {
        case "primitive":
          if (typeExpr.parameters.length === 1) {
            typeExpr = typeExpr.parameters[0];
          }
          break;
      }
      if (typeExpr.typeRef.kind === "reference") {
        if (scopedNamesEqual(REF, typeExpr.typeRef.value)) {
          typeExpr = typeExpr.parameters[0];
        }
      }
      if (dgf === undefined) {
        throw new Error("DGFIELD annotation needs to be defined for all fields");
      }
      return {
        field: {
          ...field,
          typeExpr
        },
        dgf
      };
    }
  }

  function generateSchemaConcrete(st: SchemaType) {
    switch (st.scopedDecl.decl.type_.kind) {
      case "struct_": {
        const doc = getAnnotation(st.scopedDecl.decl.annotations, DOC);
        if (doc !== null && doc !== undefined) {
          writer.write(`"""\n`);
          writer.write(`${(doc as string).replaceAll("\n", " ").trim()}\n`);
          writer.write(`"""\n`);
        }
        writer.write(`type ${st.scopedDecl.decl.name} {\n`);
        if (st.dgd.referenced) {
          writer.write(`    id: ID!\n`);
        } else if (st.fields.length == 0) {
          writer.write(`    _phantom: Boolean\n`);
        }
        try {
          genStructFields(st.fields);
        } catch (e) {
          throw new Error(`${e} -- ${st.scopedDecl.moduleName}.${st.scopedDecl.decl.name}`);
        }
        writer.write(`}\n`);
        writer.write(`\n`);
        break;
      }
      case "union_": {
        const doc = getAnnotation(st.scopedDecl.decl.annotations, DOC);
        if (doc !== null && doc !== undefined) {
          writer.write(`"""\n`);
          writer.write(`${(doc as string).replaceAll("\n", " ").trim()}\n`);
          writer.write(`"""\n`);
        }
        writer.write(`type ${st.scopedDecl.decl.name} {\n`);
        writer.write(`    kind: _${st.scopedDecl.decl.name}Branch!\n`);
        writer.write(`    value: _${st.scopedDecl.decl.name}Type!\n`);
        writer.write(`}\n`);
        // const uniqSet: Set<string> = new Set()
        // st.fields.forEach(f => uniqSet.add(typeExprToGraphqlType(f.typeExpr)))
        // const uniqTypes = Array.from(uniqSet.keys())

        const names: [string, string, string, string | undefined][] = st.fields.map(f => {
          const doc = getAnnotation(f.field.annotations, DOC);
          return [
            f.field.name,
            typeExprToGraphqlType(f.field.typeExpr),
            typeExprToStringUnscoped(f.field.typeExpr),
            doc === null || doc === undefined ? undefined : (doc as string).replaceAll("\n", " ").trim()
          ];
        });
        const maxNameLen = Math.max.apply(null, names.map(n => n[0].length + 1));
        const maxTypeLen = Math.max.apply(null, names.map(n => n[2].length + 1));

        writer.write(`enum _${st.scopedDecl.decl.name}Branch {\n`);
        names.forEach(n => {
          if (n[3]) {
            writer.write(`    """\n`);
            writer.write(`    ${n[3]}\n`);
            writer.write(`    """\n`);
          }
          writer.write(`    ${n[0].padEnd(maxNameLen)} # ${n[2].padEnd(maxTypeLen)}`.trimEnd());
          writer.write(`\n`);
        });
        writer.write(`}\n`);
        const uniqTypes = names.map(n => n[1]).filter((v, i, a) => a.indexOf(v) === i);
        writer.write(`union _${st.scopedDecl.decl.name}Type =\n`);
        uniqTypes.forEach(t => {
          writer.write(`    | ${t}\n`);
        });
        writer.write(`\n`);
        break;
      }
    }
  }

  function genStructFields(fields: SchemaField[]) {
    const names: [string, string, string, string | undefined][] = fields.map(f => {
      const doc = getAnnotation(f.field.annotations, DOC);
      return [
        f.field.name,
        fieldToGraphqlType(f),
        typeExprToStringUnscoped(f.field.typeExpr),
        doc === null || doc === undefined ? undefined : (doc as string).replaceAll("\n", " ").trim()
      ];
    });
    const maxNameLen = Math.max.apply(null, names.map(n => n[0].length + 1));
    const maxGqlTypeLen = Math.max.apply(null, names.map(n => n[1].length + 1));
    const maxTypeLen = Math.max.apply(null, names.map(n => n[2].length + 1));
    names.forEach(n => {
      if (n[3]) {
        writer.write(`    """\n`);
        writer.write(`    ${n[3]}\n`);
        writer.write(`    """\n`);
      }
      writer.write(`    ${(n[0] + ":").padEnd(maxNameLen)} ${n[1].padEnd(maxTypeLen)} # ${n[2].padEnd(maxGqlTypeLen)}`.trimEnd());
      writer.write(`\n`);
    });
  }
}

function fieldToGraphqlType(f: SchemaField): string {
  switch (f.dgf.card) {
    case "one":
      return typeExprToGraphqlType(f.field.typeExpr) + "!";
    case "optional":
      return typeExprToGraphqlType(f.field.typeExpr);
    case "many":
      return "[" + typeExprToGraphqlType(f.field.typeExpr) + "]!";
    case "stringmap":
      throw new Error("Map (StringMap) not implemented");
  }
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

const DOC = { moduleName: "sys.annotations", name: "Doc" };
const BOX = adlast.makeScopedName({ moduleName: "savanti.schema.v1.annotations", name: "Box" });
// const REF = adlast.makeScopedName({ moduleName: "savanti.schema.v1.types", name: "Ref" });

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

// export interface DeclConcreteTypeOpts {
//   struct_: adlast.Struct;
//   union_: adlast.Union;
// }
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
  dgd: DgraphDecl;
  fields: SchemaField[];
}

export type GenericSchemaType = SchemaType & {
  insts: GenericInstance[];
};

export type SchemaField = {
  field: adlast.Field,
  dgf: DgraphField,
};

type MonomophicType = {
  name: string,
  typeExpr: adlast.TypeExpr,
  genericDecl: SchemaType,
  referencesBy: string[];
};

export interface Resources {
  schemaTypes: SchemaType[];
  schemaGenerics: GenericSchemaType[];
  // monomorphicTypes: MonomophicType[];
  // declMap: Record<string, SchemaType>;
}