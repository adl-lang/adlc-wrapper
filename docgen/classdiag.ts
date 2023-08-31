import { isEnum } from "../adl-gen/runtime/utils.ts";
import * as adlast from "../adl-gen/sys/adlast.ts";
import { AdlModuleMap, ParseAdlParams, getAnnotation, scopedName } from "../utils/adl.ts";
import { ScopedDecl, loadResources } from "./load.ts";
import {
  FileWriter,
  NameMungFn
} from "./utils.ts";

export interface GenMermaidParams extends ParseAdlParams {
  extensions?: string[];
  verbose?: boolean;
  filter?: (scopedDecl: adlast.ScopedDecl) => boolean;
  createFile: string;
  focus_modules?: string[];
}

interface GenCreatePrismaParams extends GenMermaidParams {
  nameMung: NameMungFn;
}

type Deps = {
  sd: ScopedDecl<unknown, any>[];
  sn: adlast.ScopedName[];
};

export async function genMermaidClassDiagram(
  params0: GenMermaidParams,
): Promise<void> {
  const params = {
    ...params0,
    nameMung: (s: string) => s,
  };

  const { loadedAdl, resources } = await loadResources(params);
  const writer = new FileWriter(params.createFile, !!params.verbose);


  const ifm = () => params.focus_modules && params.focus_modules.length > 0
  // i.i.f. aka isInFocus
  const iif = (sn: { moduleName: string; }) => ifm() && !params.focus_modules!.includes(sn.moduleName) ? false : true;
  const iim = (mn: string) => params.adlModules.includes(mn)

  const xfocus_out: { sn: adlast.ScopedName[]; } = { sn: [] };
  const xfocus_in: { sd: ScopedDecl<unknown, any>[]; } = { sd: [] };

  function capture_deps(sd: ScopedDecl<unknown, any>, to_: adlast.ScopedName) {
    if (!iif(sd) && iif(to_)) {
      xfocus_in.sd.push(sd);
    }
    if (iif(sd) && !iif(to_)) {
      xfocus_out.sn.push(to_);
    }
  }

  function gen_fields(f: adlast.Field, sd: ScopedDecl<adlast.Struct | adlast.Union, "struct_" | "union_">) {
    let typeRef = f.typeExpr.typeRef;
    let card: "" | `"optional"` | `"list"` = "";
    let fcard = ""
    if(typeRef.kind === "primitive") {
      if(typeRef.value === "Vector") {
        typeRef = f.typeExpr.parameters[0].typeRef;
        card = `"list"`;
        fcard = " 0..*️";
      }
      if(typeRef.value === "Nullable") {
        typeRef = f.typeExpr.parameters[0].typeRef;
        card = `"optional"`;
        fcard = " ?";
      }
    }
    const hidden = getAnnotation(f.annotations, HIDDEN) !== undefined;
    const embed = getAnnotation(f.annotations, EMBED) !== undefined;
    writer.cwrite(iif(sd) && !hidden && !embed, `        ${mndn2mcd(sd)} : ${f.name}${fcard}\n`);
    return { typeRef, card };
  }

  writer.write(`%% Auto-generated from adl modules: ${resources.moduleNames.join(" ")}\n`);
  writer.write(`classDiagram\n`);
  writer.write(`    direction LR;\n`);
  writer.write(`\n`);
  writer.write(`%% structs\n`);
  resources.structs.forEach(sd => {
    writer.cwrite(iif(sd), `    class ${mndn2mcd(sd)}["${sd.decl.name}"]\n`);
    sd.decl.type_.value.fields.forEach(f => {
      const {typeRef, card} = gen_fields(f, sd);
      if (typeRef.kind === "reference") {
        const to_ = typeRef.value;
        if (iim(to_.moduleName)) {
          const arrow = getAnnotation(f.annotations, EMBED) !== undefined ? "--|>" : "-->";
          writer.cwrite(iif(sd) || iif(to_), `    ${mndn2mcd(sd)} ${card} ${arrow} ${sn2mcd(to_)}\n`);
          capture_deps(sd, to_);
        }
      }
    });
  });
  writer.write(`\n`);
  writer.write(`%% union\n`);
  resources.unions.forEach(sd => {
    const is_enum = isEnum(sd.decl.type_.value);
    writer.cwrite(iif(sd), `    class ${mndn2mcd(sd)}["${sd.decl.name}"]\n`);
    writer.cwrite(iif(sd), `    <<${is_enum ? "enum" : "union"}>> ${mndn2mcd(sd)}\n`);

    if (!isEnum(sd.decl.type_.value)) {
      sd.decl.type_.value.fields.forEach(br => {
        const { typeRef } = gen_fields(br, sd)
        if (typeRef.kind === "reference") {
          const to_ = typeRef.value;
          writer.cwrite(iif(sd) || iif(to_), `    ${mndn2mcd(sd)} <|.. ${sn2mcd(to_)}\n`);
          capture_deps(sd, to_);
        }
      });
    }

  });
  writer.write(`\n`);

  const gen_type_newtype = (sd: ScopedDecl<adlast.TypeDef, "type_" | "newtype_">) => {
    writer.cwrite(iif(sd), `    class ${mndn2mcd(sd)}["${sd.decl.name}"]\n`);
    const isEmb = getAnnotation(sd.decl.annotations, EMBEDDED);
    if (isEmb !== undefined) {
      let typeRef = sd.decl.type_.value.typeExpr.typeRef;
      if (typeRef.kind === "reference") {
        const to_ = typeRef.value;
        // TODO resolve typeRef.value:ScopedName and list fields
        writer.cwrite(iif(sd) || iif(to_), `    ${mndn2mcd(sd)} --|> ${sn2mcd(to_)}\n`);
        capture_deps(sd, to_);
      }
    }
  };



  writer.write(`%% type alias\n`);
  resources.aliases.forEach(sd => gen_type_newtype(sd));
  writer.write(`\n`);
  writer.write(`%% new type\n`);
  resources.newtypes.forEach(sd => gen_type_newtype(sd));
  writer.write(`\n`);


  if (ifm()) {
    xfocus_in.sd.forEach(sd => {
      writer.write(`    class ${mndn2mcd(sd)}["${sd.moduleName.split(".").slice(-1)}.${sd.decl.name}"]\n`);
    });
    xfocus_out.sn.forEach(sn => {
      writer.write(`    class ${sn2mcd(sn)}["${sn.moduleName.split(".").slice(-1)}.${sn.name}"]\n`);
    });
  }

  if (ifm()  && xfocus_in.sd.length > 0) {
    writer.write(`    namespace _in_ {\n`);
    xfocus_in.sd.forEach(sd => {
      writer.write(`    class ${mndn2mcd(sd)}\n`);
    });
    writer.write(`    }\n`);
  }
  if (ifm() && xfocus_out.sn.length > 0) {
    writer.write(`    namespace _out_ {\n`);
    xfocus_out.sn.forEach(sn => {
      writer.write(`    class ${sn2mcd(sn)}\n`);
    });
    writer.write(`    }\n`);
  }

  forEachModuleDecl(
    loadedAdl.modules,
    (mn) => {
      if (!iif({ moduleName: mn })) {
        return false;
      }
      if (!iim(mn)) {
        return false;
      }
      writer.write(`    namespace ${mn.replaceAll(".", "_")} {\n`);
      return true;
    },
    (sd) => {
      if (getAnnotation(sd.decl.annotations, REPRESENTED_BY) === undefined) {
        writer.write(`        class ${mndn2mcd(sd)}\n`);
      }
    },
    () => {
      writer.write(`    }\n`);
    }
  );

  await writer.close();
}

function mndn2mcd(sd: ScopedDecl<unknown, any>) {
  const ann = getAnnotation(sd.decl.annotations, REPRESENTED_BY);
  if (ann) {
    return `${sd.moduleName.replaceAll(".", "_")}_${ann}`;
  }
  return `${sd.moduleName.replaceAll(".", "_")}_${sd.decl.name}`;
}
function sn2mcd(sn: adlast.ScopedName) {
  return `${sn.moduleName.replaceAll(".", "_")}_${sn.name}`;
}

function forEachModuleDecl(
  moduleMap: AdlModuleMap,
  startModule: (moduleName: string) => boolean,
  scopedDecl: (sdecl: adlast.ScopedDecl) => void,
  endModule: () => void,
): void {
  for (const moduleName of Object.keys(moduleMap)) {
    if (!startModule(moduleName)) {
      continue;
    }
    const module: adlast.Module = moduleMap[moduleName];
    for (const declName of Object.keys(module.decls)) {
      const decl = module.decls[declName];
      scopedDecl({ moduleName, decl });
    }
    endModule();
  }
}

const REPRESENTED_BY = scopedName("common.mspec", "RepresentedBy");
const HIDDEN = scopedName("common.mspec", "Hidden");
const EMBEDDED = scopedName("common.mspec", "Embedded");
const EMBED = scopedName("common.mspec", "Embed");
