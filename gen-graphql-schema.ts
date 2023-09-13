import { isEnum } from "./adl-gen/runtime/utils.ts";
import * as adlast from "./adl-gen/sys/adlast.ts";
import {
  AdlModuleMap,
  ParseAdlParams,
  getAnnotation,
  getModuleLevelAnnotation,
  scopedName,
  scopedNamesEqual
} from "./utils/adl.ts";
import {
  ScopedConcreteType,
  ScopedType,
  TypeBinding,
  createTypeBindings,
  loadResources,
substituteTypeBindings
} from "./graphql/load.ts";
import {
  FileWriter,
  NameMungFn
} from "./graphql/utils.ts";
import { snResult } from "./adl-gen/sys/types.ts";

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
    filter: (scopedDecl: adlast.ScopedDecl) => {
      if (!params.adlModules.includes(scopedDecl.moduleName)) {
        return false;
      }
      if (params0.focus_modules) {
        return params0.focus_modules.includes(scopedDecl.moduleName);
      }
      // if needed check annotation here
      return true;
    }
  };
  const { loadedAdl, resources } = await loadResources(params);

  // console.log(JSON.stringify(resources.concrete, null, 2))
  const writer = new FileWriter(params.output_file, !!params.verbose);
  const references: Set<string> = new Set();
  resources.concrete.forEach(st => st.decl.type_.value.fields.forEach(f =>  collectReferences(f.typeExpr)));
  console.log(Array.from(references.keys()).join("\n\t"))
  resources.concrete.forEach(st => generateSchemaConcrete(st));
  writer.close();

  function collectReferences(typeExpr: adlast.TypeExpr) {
      switch( typeExpr.typeRef.kind ) {
        case "primitive":
          switch (typeExpr.typeRef.value) {
            case "StringMap":
            case "Nullable":
            case "Vector": {
              collectReferences(typeExpr.parameters[0])
              return
            }
          }
          return
        case "reference":
          if (scopedNamesEqual(REF, typeExpr.typeRef.value)) {
            const typeExpr0 = typeExpr.parameters[0]
            if( typeExpr0.typeRef.kind !== "reference" ) {
              console.log("!!!")
              return
            }
            references.add(typeExpr0.typeRef.value.moduleName+"."+typeExpr0.typeRef.value.name)
            return
            // const sd = loadedAdl.resolver(typeExpr0.typeRef.value)
            // switch( sd.decl.type_.kind ) {
            //   case "newtype_":
            //   case "type_":
            //     if( sd.decl.type_.value.typeExpr.typeRef.kind != "reference" ) {
            //       console.error("@@@@")
            //       return
            //     }
            // }
          }
            const sd = loadedAdl.resolver(typeExpr.typeRef.value)
            switch(sd.decl.type_.kind) {
              case "type_":
              case "newtype_":
                collectReferences(sd.decl.type_.value.typeExpr)
                return
              case "struct_":
              case "union_":
                sd.decl.type_.value.fields.forEach(f => collectReferences(f.typeExpr))
                return
            }
        case "typeParam":
          console.error("###")
          return
      }
  }

  function generateSchemaConcrete(st: ScopedConcreteType) {
    switch (st.decl.type_.kind) {
      case "struct_": {
        writer.write(`type ${st.decl.name} {\n`);
        if (st.decl.type_.value.fields.length == 0) {
          writer.write(`    _phantom: Boolean\n`);
        }
        st.decl.type_.value.fields.forEach(f => {
          let typeBindings: TypeBinding[] = []
          if( f.typeExpr.typeRef.kind === "reference" ) {
            const sd = loadedAdl.resolver(f.typeExpr.typeRef.value);
            const typeParams = sd.decl.type_.value.typeParams
            typeBindings = createTypeBindings(typeParams, f.typeExpr.parameters);
            console.log(JSON.stringify(typeBindings))
          }
          const res = _genField(f.typeExpr, false, typeBindings);
          if (res.isref) {
            writer.write(`    id: ID!\n`);
          }
          res.tname.forEach(n => {
            writer.write(`    ${f.name}: ${n}\n`);
          })
          res.errors?.forEach(e => {
            writer.write(`    # ${f.name} -- ${e}\n`);
          })
        });
        writer.write(`}\n\n`);
        break;
      }
      case "union_": {
        writer.write(`type ${st.decl.name} {\n`);
        writer.write(`    kind: _${st.decl.name}Branch!\n`);
        writer.write(`    value: _${st.decl.name}Type!\n`);
        writer.write(`}\n`);
        writer.write(`union _${st.decl.name}Type = ${_getUniqBranches(st.decl.type_.value.fields).join(" | ")}\n`);
        writer.write(`enum _${st.decl.name}Branch {\n`);
        st.decl.type_.value.fields.forEach(br => {
          writer.write(`    ${br.name}\n`);
        });
        writer.write(`}\n\n`);
        break;
      }
    }
  }

  type FieldInfo = {
    tname: string[]
    isref: boolean
    errors?: string[]
  }

  function _genField(typeExpr: adlast.TypeExpr, nullable: boolean, tbs: TypeBinding[]): FieldInfo {
    switch (typeExpr.typeRef.kind) {
      case "primitive":
        switch (typeExpr.typeRef.value) {
          case "Vector": {
            const res = _genField(typeExpr.parameters[0], false, tbs)
            return {
              tname:  res.tname.map(t => `[${t}]${nullable ? "" : "!"}`), //[`[${res.tname}]${nullable ? "" : "!"}`],
              isref: false,
            };
          }
          case "Nullable": {
            const res = _genField(typeExpr.parameters[0], true, tbs)
            return {
              tname: res.tname,
              isref: false,
              errors: res.errors
            };
          }
          case "StringMap":
            throw new Error("not implemented");
          default:
            return {
              tname: [adl2graphqlType(typeExpr.typeRef.value)],
              isref: false,
            };
        }
      case "reference":
        if (scopedNamesEqual(REF, typeExpr.typeRef.value)) {

          // const typeParams = typeExpr.;
          // const typeBindings = createTypeBindings(typeParams, typeExpr.parameters);

          const typeExpr0 = substituteTypeBindings(typeExpr, tbs);

          const ref = typeExpr0.parameters[0];
          if (ref.typeRef.kind !== "reference") {
            console.error(`In Ref<T> T only references are supported. ${JSON.stringify(ref.typeRef)}`);
            return {
              tname: [],
              isref: false,
              errors: [`In Ref<T> T only references are supported. ${JSON.stringify(ref.typeRef)}`]
            }
          }
          const sd = loadedAdl.resolver(ref.typeRef.value);
          if (sd.decl.type_.kind !== "struct_") {
            throw new Error(`In Ref<T> T only references to structs are supported (for now). ${ref.typeRef.value.moduleName}.${ref.typeRef.value.name}`);
          }
          return {
            tname: sd.decl.type_.value.fields.flatMap(f => _genField(f.typeExpr, false, []).tname),
            isref: true,
          };
        }
        return {
          tname: [`${typeExpr.typeRef.value.name}${nullable ? "" : "!"}`],
          isref: false
        };
      case "typeParam":
        console.error(`typeParams??? ${JSON.stringify(typeExpr)}`)
        return {
          tname: [],
          isref: false,
          errors: [`typeParams??? ${JSON.stringify(typeExpr)}`]
        }
    }
  }

  function _getUniqBranches(fields: adlast.Field[]): string[] {
    const types: Set<string> = new Set();
    fields.forEach(f => {
      let typeExpr = f.typeExpr;
      if (typeExpr.typeRef.kind !== "reference") {
        throw new Error(`only references are supported. should have got here (maybe). ${f.name}`);
      }
      const sd = loadedAdl.resolver(typeExpr.typeRef.value);
      if (getAnnotation(sd.decl.annotations, BOX) !== undefined) {
        typeExpr = f.typeExpr.parameters[0];
        if (typeExpr.typeRef.kind !== "reference") {
          throw new Error(`only references are supported. should have got here (maybe). ${f.name}`);
        }
      }
      types.add(typeExpr.typeRef.value.name);
    });
    return Array.from(types.keys());
  }

}


const BOX = adlast.makeScopedName({ moduleName: "savanti.schema.v1.annotations", name: "Box" });
const REF = adlast.makeScopedName({ moduleName: "savanti.schema.v1.types", name: "Ref" });

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