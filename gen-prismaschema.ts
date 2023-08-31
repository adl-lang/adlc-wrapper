import { JsonObject } from "./adl-gen/runtime/json.ts";
import * as adlast from "./adl-gen/sys/adlast.ts";
import { loadDbResources } from "./dbgen/load.ts";
import { 
  DbProfile, DbResources, FileWriter,
  NameMungFn, getColumnName, getColumnType
} from "./dbgen/utils.ts";

import { LoadedAdl, ParseAdlParams, getAnnotation, scopedName } from "./utils/adl.ts";

export interface GenPrismaParams extends ParseAdlParams {
  extensions?: string[];
  // templates?: Template[];
  // viewsFile: string;
  // metadataFile?: string;
  // dbProfile?: "postgresql" | "postgresql2" | "mssql2";
  verbose?: boolean;
  filter?: (scopedDecl: adlast.ScopedDecl)=>boolean
  createFile: string;
}

interface GenCreatePrismaParams extends GenPrismaParams {
  nameMung: NameMungFn
}

export async function genCreatePrismaSchema(
  params0: GenPrismaParams,
): Promise<void> {
  const params = {
    ...params0,
    nameMung: (s: string) => s,
  }
  const { loadedAdl, dbResources } = await loadDbResources(params);
  await generateCreatePrismaSchema(params, loadedAdl, dbResources);
}

async function generateCreatePrismaSchema(
  params: GenCreatePrismaParams,
  loadedAdl: LoadedAdl,
  dbResources: DbResources,
): Promise<void> {
  const dbTables = dbResources.tables;
  // Now generate the SQL file
  const writer = new FileWriter(params.createFile, !!params.verbose);
  const moduleNames: Set<string> = new Set(
    dbTables.map((dbt) => dbt.scopedDecl.moduleName),
  );
  writer.write(
    `// Schema auto-generated from adl modules: ${Array.from(moduleNames.keys()).join(", ")
    }\n`,
  );

  const blocks0 = Object.keys(loadedAdl.modules).flatMap(mName => {
    const module = loadedAdl.modules[mName];
    const ann = getAnnotation(module.annotations, DB_PRISMA_BLOCK);
    if (ann === undefined) {
      return [];
    }
    return [{ module: module, prismaBlock: ann }];
  });
  if (blocks0.length === 0) {
    throw new Error("No module level PrismaBlock annotation found. One needed. This is generally included in the db.adl file");
  }
  if (blocks0.length > 1) {
    throw new Error(`More than one module level PrismaBlock annotation found ${blocks0.map(m => m.module.name).join(", ")}. There can be only one.`);
  }
  const blocks = blocks0[0];
  const pb: any = blocks.prismaBlock;
  writer.write(`\n`);
  writer.write(`datasource ${pb["datasource_block_name"] ? pb["datasource_block_name"] : "db"} {\n`);
  const ds = pb.datasource;
  writer.write(`  provider = "${ds.provider}"\n`);
  writer.write(`  url = ${pb_url(ds.url)}\n`);
  ["shadowDatabaseUrl", "directUrl", "relationMode", "extensions"].forEach(k => conditional(writer, ds, k))
  writer.write(`}\n`);
  writer.write(`\n`);

  Object.keys(pb.generators).forEach(k => {
    const gen = pb.generators[k]
    writer.write(`generator ${k} {\n`)
    writer.write(`  provider = "${gen.provider}"\n`);

    ["output", "previewFeatures", "engineType", "binaryTargets"].forEach(k => {
      conditional(writer, gen, k)
    })
    writer.write(`}\n`);
    writer.write(`\n`);
    })

  if (params.extensions && params.extensions.length > 0) {
    throw new Error("Extensions needed to be placed in the prisma datasource, instead of being passed as params.");
  }

  let allExtraSql: string[] = [];
  const dbProfile = prisma2DbProfile;

  const parent2child: { [key: string]: string[] } = {}

  for (const t of dbTables) {
    for (const f of t.fields) {
      const columnType = getColumnType(loadedAdl.resolver, dbTables, f, dbProfile, params.nameMung);
      if (columnType.fkey) {
        if( parent2child[columnType.fkey.table] ) {
          parent2child[columnType.fkey.table].push( t.name )
        } else {
          parent2child[columnType.fkey.table] = [t.name]
        }
      }
    }
  }

  // Output the tables
  for (const t of dbTables) {
    const ann: JsonObject = t.ann as JsonObject;
    const indexes = (ann["indexes"] || []) as string[][];
    const uniquenessConstraints = (ann["uniquenessConstraints"] || []) as string[][];
    const extraSql = (ann["extraSql"] as string[] || []);

    const lines: { code: string; comment?: string; }[] = [];
    for (const f of t.fields) {
      const fc = getAnnotation(f.annotations, DB_FIELD_COMMENT)
      const prismaAnns: string[] = []
      if(getAnnotation(f.annotations, DB_UNIQUE) !== undefined) {
        prismaAnns.push(" @unique")
      }
      if(getAnnotation(f.annotations, DB_INDEX) !== undefined) {
        prismaAnns.push(" @index")
      }
      const columnName = getColumnName(f, params.nameMung);
      const columnType = getColumnType(loadedAdl.resolver, dbTables, f, dbProfile, params.nameMung);
      lines.push({
        code: `${columnName} ${columnType.sqltype}${columnType.notNullable ? "" : "?" }${prismaAnns.join("")}${fc !== undefined ? " /// " + fc : ""}`,
        // comment: typeExprToStringUnscoped(f.typeExpr),
      });
      if (columnType.fkey) {
        lines.push({
          code: `${columnName}_${columnType.fkey.table} ${columnType.fkey.table} @relation(fields: [${columnName}], references: [${columnType.fkey.column}])`,
        });
      }
    }

    const findColName = function (s: string): string {
      for (const f of t.fields) {
        if (f.name == s) {
          return getColumnName(f, params.nameMung);
        }
      }
      return s;
    };

    if (t.primaryKey.length > 0) {
      const cols = t.primaryKey.map(findColName);
      lines.push({ code: `@@id([${cols.join(",")}])` });
    }
    for (let i = 0; i < indexes.length; i++) {
      const cols = indexes[i].map(findColName);
      lines.push(
        { code: `@@index([${cols.join(", ")}])` }
      );
    }
    for (let i = 0; i < uniquenessConstraints.length; i++) {
      const cols = uniquenessConstraints[i].map(findColName);
      lines.push(
        { code: `@@unique([${cols.join(", ")}])` }
      );
    }
    if( parent2child[t.name] ) {
      parent2child[t.name].forEach(kid => {
        lines.push(
          { code: `${kid} ${kid}[]` }
        );  
      })
    }

    writer.write("\n");
    writer.write(`model ${t.name} {\n`);
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].code;
      if (lines[i].comment) {
        line = line.padEnd(36, " ");
        line = line + " // " + lines[i].comment;
      }
      writer.write("  " + line + "\n");
    }
    writer.write(`}\n`);
    allExtraSql = allExtraSql.concat(extraSql);
  }

  if (allExtraSql.length > 0) {
    writer.write("\n");
  }

  // And any sql
  for (const sql of allExtraSql) {
    writer.write(sql + "\n");
  }

  await writer.close();
}

function pb_url(url: any) {
  switch (Object.keys(url)[0]) {
    case "env":
      return `env("${url["env"]}")`
    case "literal":
      return `"${url["literal"]}"`
    default:
      throw new Error(`unknown prisma url key '${Object.keys(url)[0]}'`)
  }
}

function conditional(writer: FileWriter, obj: any, key: string) {
  if( !!obj[key] ) {
    switch ( typeof obj[key] ) {
      case "string":
        writer.write(`  ${key} = "${obj[key]}"\n`)
        break
      case "object": // array
        if (obj[key] instanceof Array) {
          const elem: any[] = obj[key]
          if( elem.length === 0 ) {
            return
          }
          writer.write(`  ${key} = [${elem.map(e => `"${e}"`).join(", ")}]\n`)  
        } else {
          const sm = obj[key]
          const keys = Object.keys(sm)
          const elems = keys.map(k => {
            const params = Object.keys(sm[k]).map(k0 => `${k0}:"${sm[k][k0]}"`)
            return params.length > 0 ? `${k}(${params.join(", ")})` : k
          })
          writer.write(`  ${key} = [${elems.join(", ")}]\n`)
        }
        break
      default:
        throw new Error(`??? '${typeof obj[key]}' ${JSON.stringify(obj[key])}`)
    }
  }
}

const DB_PRISMA_BLOCK = scopedName("common.prisma", "PrismaBlocks");
const DB_FIELD_COMMENT = scopedName("common.prisma", "FieldComment");
const DB_UNIQUE = scopedName("common.prisma", "Unique");
const DB_INDEX = scopedName("common.prisma", "Index");

const prisma2DbProfile: DbProfile = {
  idColumnType: "String",
  enumColumnType: "String",
  primColumnType(ptype: string): string {
    switch (ptype) {
      case "String":
        return "String";
      case "Bool":
        return "Boolean";
      case "Json":
        return "Json";
      case "Int8":
        return "Int";
      case "Int16":
        return "Int";
      case "Int32":
        return "Int";
      case "Int64":
        return "BigInt";
      case "Word8":
        return "Int";
      case "Word16":
        return "Int";
      case "Word32":
        return "Int";
      case "Word64":
        return "BigInt";
      case "Float":
        return "Float"; //"real";
      case "Double":
        return "Decimal";//"double precision";
    }
    return "Json";
  },
};

// String
// Boolean
// Int
// BigInt
// Float
// Decimal
// DateTime
// Json
// Bytes
// Unsupported

