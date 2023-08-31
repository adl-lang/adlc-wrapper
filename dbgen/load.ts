import * as adlast from "../adl-gen/sys/adlast.ts";
import {
  LoadedAdl,
  ParseAdlParams,
  forEachDecl,
  getAnnotation,
  parseAdlModules
} from "../utils/adl.ts";
import {
  DB_PRIMARY_KEY, DB_SPREAD, DB_TABLE, DB_VIEW, DbResources,
  NameMungFn, getColumnName, getDbTableName
} from "./utils.ts";

export interface LoadDbResourcesParams extends ParseAdlParams {
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  nameMung: NameMungFn;
}

export async function loadDbResources(
  params: LoadDbResourcesParams,
): Promise<{ loadedAdl: LoadedAdl; dbResources: DbResources; }> {
  const loadedAdl = await parseAdlModules(params);

  const dbResources: DbResources = { tables: [], views: [] };

  const acceptAll = (_scopedDecl: adlast.ScopedDecl) => true;
  const filter = params.filter ?? acceptAll;

  // Find all of the struct declarations that have a DbTable annotation
  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const accepted = filter(scopedDecl);
    if (!accepted) {
      return;
    }
    const ann = getAnnotation(scopedDecl.decl.annotations, DB_TABLE);
    if (ann != undefined) {
      const scopedName = { moduleName: scopedDecl.moduleName, name: scopedDecl.decl.name };
      const name = getDbTableName(scopedDecl, params.nameMung);
      const fields = getDbFields(loadedAdl, scopedDecl);
      const primaryKey = getPrimaryKey(fields, params.nameMung);
      dbResources.tables.push({ scopedName, scopedDecl, fields, ann, name, primaryKey });
    }
  });
  dbResources.tables.sort((t1, t2) => t1.name < t2.name ? -1 : t1.name > t2.name ? 1 : 0);

  // Find all of the struct declarations that have a DbView annotation
  forEachDecl(loadedAdl.modules, (scopedDecl) => {
    const ann = getAnnotation(scopedDecl.decl.annotations, DB_VIEW);
    if (ann != undefined) {
      const name = getDbTableName(scopedDecl, params.nameMung);
      const fields = getDbFields(loadedAdl, scopedDecl);
      dbResources.views.push({ scopedDecl, fields, ann, name });
    }
  });

  dbResources.views.sort((t1, t2) => t1.name < t2.name ? -1 : t1.name > t2.name ? 1 : 0);

  return { loadedAdl, dbResources };
}

/**
 *  Returns the adl fields that will beome table columns
 */
function getDbFields(loadedAdl: LoadedAdl, scopedDecl: adlast.ScopedDecl): DbField[] {

  function _fromDecl(scopedDecl: adlast.ScopedDecl, typeBindings: TypeBinding[]): adlast.Field[] {
    if (scopedDecl.decl.type_.kind == 'type_') {
      const typeExpr0 = scopedDecl.decl.type_.value.typeExpr;
      const typeExpr = substituteTypeBindings(typeExpr0, typeBindings);
      return _fromTypeExpr(typeExpr);
    }

    if (scopedDecl.decl.type_.kind == 'newtype_') {
      const typeExpr0 = scopedDecl.decl.type_.value.typeExpr;
      const typeExpr = substituteTypeBindings(typeExpr0, typeBindings);
      return _fromTypeExpr(typeExpr);
    }

    if (scopedDecl.decl.type_.kind == "struct_") {
      let result: DbField[] = [];
      for (const f of scopedDecl.decl.type_.value.fields) {
        result = [
          ...result,
          ..._fromField(f, typeBindings),
        ];
      }
      return result;
    }
    throw new Error("only structs and type aliases are supported as db tables");
  }

  function _fromTypeExpr(typeExpr: adlast.TypeExpr): DbField[] {
    if (typeExpr.typeRef.kind != 'reference') {
      throw new Error("db type expressions must reference a decl");
    }
    const decl = loadedAdl.resolver(typeExpr.typeRef.value);
    const typeParams = decl.decl.type_.value.typeParams;
    const typeBindings = createTypeBindings(typeParams, typeExpr.parameters);
    return _fromDecl(decl, typeBindings);
  }

  function _fromField(field: adlast.Field, typeBindings: TypeBinding[]): DbField[] {
    const typeExpr = substituteTypeBindings(field.typeExpr, typeBindings);
    const isSpread = getAnnotation(field.annotations, DB_SPREAD) !== undefined;

    if (isSpread) {
      return _fromTypeExpr(typeExpr);
    }

    return [{
      name: field.name,
      serializedName: field.serializedName,
      typeExpr,
      default: field.default,
      annotations: field.annotations
    }];
  }

  return _fromDecl(scopedDecl, []);
}

type DbField = adlast.Field; // For now

/**
 *  Returns the primary key for the table
 */
function getPrimaryKey(fields: DbField[], nmfn: NameMungFn): string[] {
  const primaryKey = fields.filter(
    f => getAnnotation(f.annotations, DB_PRIMARY_KEY) !== undefined
  ).map(
    f => getColumnName(f, nmfn)
  );

  return primaryKey;
}

interface TypeBinding {
  name: string,
  value: adlast.TypeExpr,
}

function createTypeBindings(names: string[], values: adlast.TypeExpr[]): TypeBinding[] {
  const result: TypeBinding[] = [];
  for (let i = 0; i < names.length; i++) {
    result.push({ name: names[i], value: values[i] });
  }
  return result;
}

function substituteTypeBindings(texpr: adlast.TypeExpr, bindings: TypeBinding[]): adlast.TypeExpr {
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