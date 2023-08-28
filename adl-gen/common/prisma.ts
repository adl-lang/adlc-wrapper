/* @generated from adl module common.prisma */

import * as ADL from './../runtime/adl.ts';

export interface PrismaBlocks {
  datasource_block_name: (string|null);
  datasource: Datasource;
  generators: {[key: string]: Generator};
}

export function makePrismaBlocks(
  input: {
    datasource_block_name?: (string|null),
    datasource: Datasource,
    generators: {[key: string]: Generator},
  }
): PrismaBlocks {
  return {
    datasource_block_name: input.datasource_block_name === undefined ? "db" : input.datasource_block_name,
    datasource: input.datasource,
    generators: input.generators,
  };
}

const PrismaBlocks_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"datasource_block_name","default":{"kind":"just","value":"db"},"name":"datasource_block_name","typeExpr":{"typeRef":{"kind":"primitive","value":"Nullable"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"datasource","default":{"kind":"nothing"},"name":"datasource","typeExpr":{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"Datasource"}},"parameters":[]}},{"annotations":[],"serializedName":"generators","default":{"kind":"nothing"},"name":"generators","typeExpr":{"typeRef":{"kind":"primitive","value":"StringMap"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"Generator"}},"parameters":[]}]}}]}},"name":"PrismaBlocks","version":{"kind":"nothing"}}};

export const snPrismaBlocks: ADL.ScopedName = {moduleName:"common.prisma", name:"PrismaBlocks"};

export function texprPrismaBlocks(): ADL.ATypeExpr<PrismaBlocks> {
  return {value : {typeRef : {kind: "reference", value : snPrismaBlocks}, parameters : []}};
}

export interface Datasource {
  /**
   * Describes which data source connectors to use.
   */
  provider: Provider;
  /**
   * Connection URL including authentication info. 
   * Most connectors use the syntax provided by the database.
   * https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#:~:text=the%20syntax%20provided%20by%20the%20database
   */
  url: Url;
  shadowDatabaseUrl: (string|null);
  /**
   * Connection URL for direct connection to the database.
   * If you use a connection pooler URL in the url argument (for example, if you use the Data Proxy or pgBouncer), Prisma CLI commands that require a direct connection to the database use the URL in the directUrl argument.
   * The directUrl property is supported by Prisma Studio from version 5.1.0 upwards.
   */
  directUrl: (string|null);
  relationMode: (RelationMode|null);
  extensions: string[];
}

export function makeDatasource(
  input: {
    provider: Provider,
    url: Url,
    shadowDatabaseUrl?: (string|null),
    directUrl?: (string|null),
    relationMode?: (RelationMode|null),
    extensions?: string[],
  }
): Datasource {
  return {
    provider: input.provider,
    url: input.url,
    shadowDatabaseUrl: input.shadowDatabaseUrl === undefined ? null : input.shadowDatabaseUrl,
    directUrl: input.directUrl === undefined ? null : input.directUrl,
    relationMode: input.relationMode === undefined ? null : input.relationMode,
    extensions: input.extensions === undefined ? [] : input.extensions,
  };
}

const Datasource_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"provider","default":{"kind":"nothing"},"name":"provider","typeExpr":{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"Provider"}},"parameters":[]}},{"annotations":[],"serializedName":"url","default":{"kind":"nothing"},"name":"url","typeExpr":{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"Url"}},"parameters":[]}},{"annotations":[],"serializedName":"shadowDatabaseUrl","default":{"kind":"just","value":null},"name":"shadowDatabaseUrl","typeExpr":{"typeRef":{"kind":"primitive","value":"Nullable"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"directUrl","default":{"kind":"just","value":null},"name":"directUrl","typeExpr":{"typeRef":{"kind":"primitive","value":"Nullable"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"relationMode","default":{"kind":"just","value":null},"name":"relationMode","typeExpr":{"typeRef":{"kind":"primitive","value":"Nullable"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"RelationMode"}},"parameters":[]}]}},{"annotations":[],"serializedName":"extensions","default":{"kind":"just","value":[]},"name":"extensions","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}}]}},"name":"Datasource","version":{"kind":"nothing"}}};

export const snDatasource: ADL.ScopedName = {moduleName:"common.prisma", name:"Datasource"};

export function texprDatasource(): ADL.ATypeExpr<Datasource> {
  return {value : {typeRef : {kind: "reference", value : snDatasource}, parameters : []}};
}

export interface Url_Env {
  kind: 'env';
  value: string;
}
export interface Url_Literal {
  kind: 'literal';
  value: string;
}

export type Url = Url_Env | Url_Literal;

export interface UrlOpts {
  env: string;
  literal: string;
}

export function makeUrl<K extends keyof UrlOpts>(kind: K, value: UrlOpts[K]) { return {kind, value}; }

const Url_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"union_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"env","default":{"kind":"nothing"},"name":"env","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"literal","default":{"kind":"nothing"},"name":"literal","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}}]}},"name":"Url","version":{"kind":"nothing"}}};

export const snUrl: ADL.ScopedName = {moduleName:"common.prisma", name:"Url"};

export function texprUrl(): ADL.ATypeExpr<Url> {
  return {value : {typeRef : {kind: "reference", value : snUrl}, parameters : []}};
}

export type Provider = 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver' | 'mongodb' | 'cockroachdb';
export const valuesProvider : Provider[] = ['postgresql', 'mysql', 'sqlite', 'sqlserver', 'mongodb', 'cockroachdb'];

const Provider_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"union_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"postgresql","default":{"kind":"nothing"},"name":"postgresql","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"mysql","default":{"kind":"nothing"},"name":"mysql","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"sqlite","default":{"kind":"nothing"},"name":"sqlite","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"sqlserver","default":{"kind":"nothing"},"name":"sqlserver","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"mongodb","default":{"kind":"nothing"},"name":"mongodb","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"cockroachdb","default":{"kind":"nothing"},"name":"cockroachdb","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}}]}},"name":"Provider","version":{"kind":"nothing"}}};

export const snProvider: ADL.ScopedName = {moduleName:"common.prisma", name:"Provider"};

export function texprProvider(): ADL.ATypeExpr<Provider> {
  return {value : {typeRef : {kind: "reference", value : snProvider}, parameters : []}};
}

export type RelationMode = 'foreignKeys' | 'prisma';
export const valuesRelationMode : RelationMode[] = ['foreignKeys', 'prisma'];

const RelationMode_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"union_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"foreignKeys","default":{"kind":"nothing"},"name":"foreignKeys","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"prisma","default":{"kind":"nothing"},"name":"prisma","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}}]}},"name":"RelationMode","version":{"kind":"nothing"}}};

export const snRelationMode: ADL.ScopedName = {moduleName:"common.prisma", name:"RelationMode"};

export function texprRelationMode(): ADL.ATypeExpr<RelationMode> {
  return {value : {typeRef : {kind: "reference", value : snRelationMode}, parameters : []}};
}

export interface Generator {
  provider: string;
  output: (string|null);
  previewFeatures: string[];
  engineType: (EngineType|null);
  binaryTargets: BinaryTargets[];
}

export function makeGenerator(
  input: {
    provider: string,
    output?: (string|null),
    previewFeatures?: string[],
    engineType?: (EngineType|null),
    binaryTargets?: BinaryTargets[],
  }
): Generator {
  return {
    provider: input.provider,
    output: input.output === undefined ? null : input.output,
    previewFeatures: input.previewFeatures === undefined ? [] : input.previewFeatures,
    engineType: input.engineType === undefined ? null : input.engineType,
    binaryTargets: input.binaryTargets === undefined ? [] : input.binaryTargets,
  };
}

const Generator_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"struct_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"provider","default":{"kind":"nothing"},"name":"provider","typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}},{"annotations":[],"serializedName":"output","default":{"kind":"just","value":null},"name":"output","typeExpr":{"typeRef":{"kind":"primitive","value":"Nullable"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"previewFeatures","default":{"kind":"just","value":[]},"name":"previewFeatures","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}]}},{"annotations":[],"serializedName":"engineType","default":{"kind":"just","value":null},"name":"engineType","typeExpr":{"typeRef":{"kind":"primitive","value":"Nullable"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"EngineType"}},"parameters":[]}]}},{"annotations":[],"serializedName":"binaryTargets","default":{"kind":"just","value":[]},"name":"binaryTargets","typeExpr":{"typeRef":{"kind":"primitive","value":"Vector"},"parameters":[{"typeRef":{"kind":"reference","value":{"moduleName":"common.prisma","name":"BinaryTargets"}},"parameters":[]}]}}]}},"name":"Generator","version":{"kind":"nothing"}}};

export const snGenerator: ADL.ScopedName = {moduleName:"common.prisma", name:"Generator"};

export function texprGenerator(): ADL.ATypeExpr<Generator> {
  return {value : {typeRef : {kind: "reference", value : snGenerator}, parameters : []}};
}

export type EngineType = 'library' | 'binary';
export const valuesEngineType : EngineType[] = ['library', 'binary'];

const EngineType_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"union_","value":{"typeParams":[],"fields":[{"annotations":[],"serializedName":"library","default":{"kind":"nothing"},"name":"library","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}},{"annotations":[],"serializedName":"binary","default":{"kind":"nothing"},"name":"binary","typeExpr":{"typeRef":{"kind":"primitive","value":"Void"},"parameters":[]}}]}},"name":"EngineType","version":{"kind":"nothing"}}};

export const snEngineType: ADL.ScopedName = {moduleName:"common.prisma", name:"EngineType"};

export function texprEngineType(): ADL.ATypeExpr<EngineType> {
  return {value : {typeRef : {kind: "reference", value : snEngineType}, parameters : []}};
}

export type BinaryTargets = string;

const BinaryTargets_AST : ADL.ScopedDecl =
  {"moduleName":"common.prisma","decl":{"annotations":[],"type_":{"kind":"type_","value":{"typeParams":[],"typeExpr":{"typeRef":{"kind":"primitive","value":"String"},"parameters":[]}}},"name":"BinaryTargets","version":{"kind":"nothing"}}};

export const snBinaryTargets: ADL.ScopedName = {moduleName:"common.prisma", name:"BinaryTargets"};

export function texprBinaryTargets(): ADL.ATypeExpr<BinaryTargets> {
  return {value : {typeRef : {kind: "reference", value : snBinaryTargets}, parameters : []}};
}

export const _AST_MAP: { [key: string]: ADL.ScopedDecl } = {
  "common.prisma.PrismaBlocks" : PrismaBlocks_AST,
  "common.prisma.Datasource" : Datasource_AST,
  "common.prisma.Url" : Url_AST,
  "common.prisma.Provider" : Provider_AST,
  "common.prisma.RelationMode" : RelationMode_AST,
  "common.prisma.Generator" : Generator_AST,
  "common.prisma.EngineType" : EngineType_AST,
  "common.prisma.BinaryTargets" : BinaryTargets_AST
};
