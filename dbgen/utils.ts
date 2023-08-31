import * as adl from "../adl-gen/runtime/adl.ts";
import { JsonObject, JsonValue } from "../adl-gen/runtime/json.ts";
import { isEnum } from "../adl-gen/runtime/utils.ts";
import * as adlast from "../adl-gen/sys/adlast.ts";
import {
  decodeTypeExpr,
  expandNewType,
  expandTypeAlias,
  expandTypes,
  getAnnotation,
  scopedName,
  scopedNamesEqual
} from "../utils/adl.ts";

// Contains customizations for the db mapping
export interface DbProfile {
  idColumnType: string;
  enumColumnType: string;
  primColumnType(ptype: string): string;
}

export interface DbResources {
  tables: DbTable[],
  views: DbView[],
}

export interface DbTable {
  scopedName: adlast.ScopedName;
  scopedDecl: adlast.ScopedDecl;
  fields: adlast.Field[];
  ann: JsonValue;
  name: string;
  primaryKey: string[],
}

export interface DbView {
  scopedDecl: adlast.ScopedDecl;
  fields: adlast.Field[];
  ann: JsonValue;
  name: string;
}

interface ColumnType {
  sqltype: string;
  fkey?: {
    table: string;
    column: string;
  };
  notNullable: boolean;
}

/**
* Returns the SQL name for a column corresponding to a field
*/
export function getColumnName(field: adlast.Field, nmfn: NameMungFn): string {
  const ann = getAnnotation(field.annotations, DB_COLUMN_NAME);
  if (typeof ann === "string") {
    return ann;
  }
  return nmfn(field.name);
}

export function getColumnType(
  resolver: adl.DeclResolver,
  dbTables: DbTable[],
  field: adlast.Field,
  dbProfile: DbProfile,
  nmfn: NameMungFn,
): ColumnType {
  const ann = getAnnotation(field.annotations, DB_COLUMN_TYPE);
  const annctype: string | undefined = typeof ann === "string"
    ? ann
    : undefined;

  const typeExpr = field.typeExpr;

  // For Maybe<T> and Nullable<T> the sql column will allow nulls
  const dtype = decodeTypeExpr(typeExpr);
  if (
    dtype.kind == "Nullable" ||
    dtype.kind == "Reference" && scopedNamesEqual(dtype.refScopedName, MAYBE)
  ) {
    return {
      sqltype: annctype ||
        getColumnType1(resolver, typeExpr.parameters[0], dbProfile),
      fkey: getForeignKeyRef(resolver, dbTables, typeExpr.parameters[0], nmfn),
      notNullable: false,
    };
  }

  // For all other types, the column will not allow nulls
  return {
    sqltype: (annctype || getColumnType1(resolver, typeExpr, dbProfile)),
    fkey: getForeignKeyRef(resolver, dbTables, typeExpr, nmfn),
    notNullable: true,
  };
}

function getColumnType1(
  resolver: adl.DeclResolver,
  typeExpr: adlast.TypeExpr,
  dbProfile: DbProfile,
): string {
  const dtype = decodeTypeExpr(typeExpr);
  switch (dtype.kind) {
    case "Reference": {
      const sdecl = resolver(dtype.refScopedName);

      const ann = getAnnotation(sdecl.decl.annotations, DB_COLUMN_TYPE);
      if (typeof (ann) === "string") {
        return ann;
      }

      if (
        sdecl.decl.type_.kind == "union_" && isEnum(sdecl.decl.type_.value)
      ) {
        return dbProfile.enumColumnType;
      }
      // If we have a reference to a newtype or type alias, resolve
      // to the underlying type
      let texpr2 = null;
      texpr2 = texpr2 || expandTypeAlias(resolver, typeExpr);
      texpr2 = texpr2 || expandNewType(resolver, typeExpr);
      if (texpr2) {
        return getColumnType1(resolver, texpr2, dbProfile);
      }
    }
    /* falls through */
    default:
      return dbProfile.primColumnType(dtype.kind);
  }
}

function getForeignKeyRef(
  resolver: adl.DeclResolver,
  dbTables: DbTable[],
  typeExpr0: adlast.TypeExpr,
  nmfn: NameMungFn,
): { table: string; column: string; } | undefined {
  const typeExpr = expandTypes(resolver, typeExpr0, {
    expandTypeAliases: true,
  });
  const dtype = decodeTypeExpr(typeExpr);
  if (
    dtype.kind == "Reference" && scopedNamesEqual(dtype.refScopedName, DB_KEY)
  ) {
    const param0 = dtype.parameters[0];
    if (param0.kind == "Reference") {
      const table = dbTables.find(t => scopedNamesEqual(param0.refScopedName, t.scopedName));
      if (!table) {
        throw new Error(`No table declaration for ${param0.refScopedName.moduleName}.${param0.refScopedName.name}`);
      }
      if (table.primaryKey.length !== 1) {
        throw new Error(`No singular primary key for ${param0.refScopedName.moduleName}.${param0.refScopedName.name}`);
      }
      const decl = resolver(param0.refScopedName);
      return { table: getDbTableName(decl, nmfn), column: table.primaryKey[0] };
    }
  }
  return undefined;
}

/**
 *  Returns the SQL name for the table
 */
export function getDbTableName(scopedDecl: adlast.ScopedDecl, nmfn: NameMungFn): string {
  const ann = getAnnotation(scopedDecl.decl.annotations, DB_TABLE);
  let tableName = assumeField<string>(ann, "tableName");
  if (tableName) {
    return tableName;
  }
  tableName = nmfn(scopedDecl.decl.name);
  if (tableName.endsWith("_table")) {
    tableName = tableName.substring(0, tableName.length - 6);
  }
  return tableName;
}

export function assumeField<T>(
  obj: JsonValue | undefined,
  key: string,
): T | undefined {
  if (obj == undefined) {
    return undefined;
  }
  return ((obj as JsonObject)[key] as unknown) as T;
}

export type NameMungFn = (value: string, locale?: string) => string;

export class FileWriter {
  content: string[] = [];

  constructor(readonly path: string, readonly verbose: boolean) {
    if (verbose) {
      console.log(`Writing ${path}...`);
    }
    this.content = [];
  }

  write(s: string) {
    this.content.push(s);
  }

  close(): Promise<void> {
    return Deno.writeTextFile(this.path, this.content.join(""));
  }
}

export const DOC = scopedName("sys.annotations", "Doc");
export const MAYBE = scopedName("sys.types", "Maybe");

export const DB_TABLE = scopedName("common.db", "DbTable");
export const DB_SPREAD = scopedName("common.db", "DbSpread");
export const DB_PRIMARY_KEY = scopedName("common.db", "DbPrimaryKey");
export const DB_VIEW = scopedName("common.db", "DbView");

const DB_COLUMN_NAME = scopedName("common.db", "DbColumnName");
const DB_COLUMN_TYPE = scopedName("common.db", "DbColumnType");
const DB_KEY = scopedName("common.db", "DbKey");
