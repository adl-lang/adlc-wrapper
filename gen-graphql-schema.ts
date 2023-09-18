import { typeExprToStringUnscoped } from "./adl-gen/runtime/utils.ts";
import * as adlast from "./adl-gen/sys/adlast.ts";
import {
  SchemaField,
  SchemaType,
  loadResources
} from "./graphql/load.ts";
import {
  FileWriter
} from "./graphql/utils.ts";
import {
  ParseAdlParams,
  getAnnotation
} from "./utils/adl.ts";

export interface GenGraphqlSchemaParams extends ParseAdlParams {
  extensions?: string[];
  verbose?: boolean;
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  output_file: string;
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
  const { loadedAdl, resources } = await loadResources(params);

  const writer = new FileWriter(params.output_file, !!params.verbose);
  resources.schemaTypes.forEach(st => generateSchemaConcrete(st));

  writer.write(`# Generics as interfaces & monomophic implementations\n`);
  resources.schemaGenerics.forEach(gt => {
    switch (gt.scopedDecl.decl.type_.kind) {
      case "union_":
        throw new Error("Generics not implemented for unions");
      case "struct_": {
        writer.write(`interface ${gt.scopedDecl.decl.name} {\n`);
        const cfs = gt.fields.filter(f => f.concrete);
        if (cfs.length === 0) {
          writer.write(`    _phantom: Boolean\n`);
        }
        genStructFields(cfs);
        writer.write(`}\n`);
      }
    }
  });

  resources.monomorphicTypes.forEach(mono => {
    writer.write(`# Used by ${mono.referencesBy.join(", ")}\n`);
    writer.write(`type ${mono.name} implements ${mono.genericDecl.scopedDecl.decl.name} {\n`);
    mono.genericDecl.fields.forEach(f => {
      if( !f.concrete ) {
        if(f.typeExpr.typeRef.kind !== "typeParam") {
          throw new Error(`typeParam expected`)
        }
        const idx = mono.genericDecl.scopedDecl.decl.type_.value.typeParams.indexOf(f.typeExpr.typeRef.value)
        writer.write(`    ${f.name}: ${typeExprToGraphqlType(mono.typeExpr.parameters[idx])}\n`)
      }
    })
    writer.write(`}\n`);
  })

  writer.close();

  function generateSchemaConcrete(st: SchemaType) {
    switch (st.scopedDecl.decl.type_.kind) {
      case "struct_": {
        const doc = getAnnotation(st.scopedDecl.decl.annotations, DOC);
        if( doc !== null && doc !== undefined ) {
          writer.write(`"""\n`)
          writer.write(`${(doc as string).replaceAll("\n", " ").trim()}\n`)
          writer.write(`"""\n`)
        }
        writer.write(`type ${st.scopedDecl.decl.name} {\n`);
        if (resources.isRef(st.scopedDecl)) {
          writer.write(`    id: ID!\n`);
        } else if (st.fields.length == 0) {
          writer.write(`    _phantom: Boolean\n`);
        }
        genStructFields(st.fields);
        writer.write(`}\n`);
        writer.write(`\n`);
        break;
      }
      case "union_": {
        const doc = getAnnotation(st.scopedDecl.decl.annotations, DOC);
        if( doc !== null && doc !== undefined ) {
          writer.write(`"""\n`)
          writer.write(`${(doc as string).replaceAll("\n", " ").trim()}\n`)
          writer.write(`"""\n`)
        }
        writer.write(`type ${st.scopedDecl.decl.name} {\n`);
        writer.write(`    kind: _${st.scopedDecl.decl.name}Branch!\n`);
        writer.write(`    value: _${st.scopedDecl.decl.name}Type!\n`);
        writer.write(`}\n`);
        // const uniqSet: Set<string> = new Set()
        // st.fields.forEach(f => uniqSet.add(typeExprToGraphqlType(f.typeExpr)))
        // const uniqTypes = Array.from(uniqSet.keys())

        const names: [string, string, string, string | undefined][] = st.fields.map(f => {
          const doc = getAnnotation(f.annotations, DOC);
          return [
            f.name,
            typeExprToGraphqlType(f.typeExpr),
            typeExprToStringUnscoped(f.typeExpr),
            doc === null || doc === undefined ? undefined : (doc as string).replaceAll("\n", " ").trim()
          ];
        });
        const maxNameLen = Math.max.apply(null, names.map(n => n[0].length + 1));
        const maxTypeLen = Math.max.apply(null, names.map(n => n[2].length + 1));

        writer.write(`enum _${st.scopedDecl.decl.name}Branch {\n`);
        names.forEach(n => {
          if(n[3]) {
            writer.write(`    """\n`)
            writer.write(`    ${n[3]}\n`)
            writer.write(`    """\n`)
          }    
          writer.write(`    ${n[0].padEnd(maxNameLen)} # ${n[2].padEnd(maxTypeLen)}`.trimEnd());
          writer.write(`\n`)
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
      const doc = getAnnotation(f.annotations, DOC);
      return [
        f.name,
        fieldToGraphqlType(f),
        typeExprToStringUnscoped(f.typeExpr),
        doc === null || doc === undefined ? undefined : (doc as string).replaceAll("\n", " ").trim()
      ];
    });
    const maxNameLen = Math.max.apply(null, names.map(n => n[0].length + 1));
    const maxGqlTypeLen = Math.max.apply(null, names.map(n => n[1].length + 1));
    const maxTypeLen = Math.max.apply(null, names.map(n => n[2].length + 1));
    names.forEach(n => {
      if(n[3]) {
        writer.write(`    """\n`)
        writer.write(`    ${n[3]}\n`)
        writer.write(`    """\n`)
      }
      writer.write(`    ${(n[0] + ":").padEnd(maxNameLen)} ${n[1].padEnd(maxTypeLen)} # ${n[2].padEnd(maxGqlTypeLen)}`.trimEnd());
      writer.write(`\n`)
    });
  }
}

function fieldToGraphqlType(f: SchemaField): string {
  switch (f.card) {
    case "one":
      return typeExprToGraphqlType(f.typeExpr) + "!";
    case "optional":
      return typeExprToGraphqlType(f.typeExpr);
    case "many":
      return "[" + typeExprToGraphqlType(f.typeExpr) + "]!";
    case "map":
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