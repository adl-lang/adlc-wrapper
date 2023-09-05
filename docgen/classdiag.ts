import { isEnum } from "../adl-gen/runtime/utils.ts";
import * as adlast from "../adl-gen/sys/adlast.ts";
import { AdlModuleMap, ParseAdlParams, getAnnotation, getModuleLevelAnnotation, scopedName } from "../utils/adl.ts";
import {
  HIDDEN,
  ScopedDecl,
  loadResources
} from "./load.ts";
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

type Arrow = {
  sd: adlast.ScopedDecl;
  to_: adlast.ScopedName;
  card: string;
  arrow: string;
  comment: string;
  name: string;
  name_decoration: string;
  idx?: number;
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


  const ifm = () => params.focus_modules && params.focus_modules.length > 0;
  // i.i.f. aka isInFocus
  const iif = (sn: { moduleName: string; }) => ifm() && !params.focus_modules!.includes(sn.moduleName) ? false : true;
  const iim = (mn: string) => params.adlModules.includes(mn);

  const xfocus_out: { sn: adlast.ScopedName[]; } = { sn: [] };
  const xfocus_in: { sd: Record<string, ScopedDecl<unknown, any>>; } = { sd: {} };

  const arrows: Arrow[] = [];

  function capture_deps(sd: ScopedDecl<unknown, any>, to_: adlast.ScopedName) {
    if (!iif(sd) && iif(to_)) {
      xfocus_in.sd[`${sd.moduleName}.${sd.decl.name}`] = sd;
    }
    if (iif(sd) && !iif(to_)) {
      xfocus_out.sn.push(to_);
    }
  }

  function get_fields(f: adlast.Field) {
    let typeRef = f.typeExpr.typeRef;
    let card: "" | `"optional"` | `"list"` = "";
    let fcard = "";
    if (typeRef.kind === "primitive") {
      if (typeRef.value === "Vector") {
        typeRef = f.typeExpr.parameters[0].typeRef;
        card = `"list"`;
        fcard = " 0..*️";
      }
      if (typeRef.value === "Nullable") {
        typeRef = f.typeExpr.parameters[0].typeRef;
        card = `"optional"`;
        fcard = " ?";
      }
    }
    const hidden = getAnnotation(f.annotations, HIDDEN) !== undefined;
    const embed = getAnnotation(f.annotations, EMBED) !== undefined;
    return { typeRef, card, fcard, hidden, embed };
  }

  const diagOptsArr = getModuleLevelAnnotation(loadedAdl.modules, DIAGRAM_OPTIONS)
    .filter(opt => iif({ moduleName: opt.module.name }));

  let diagOpts: any | null = null;
  if (diagOptsArr.length > 1) {
    Deno.stderr.write(new TextEncoder().encode(
      `mutiple Module Level Annotations for DIAGRAM_OPTIONS found, using the first one. Found in ${diagOptsArr.map(d => d.module.name).join(", ")}\n`
    ));
  }
  if (diagOptsArr.length > 0) {
    diagOpts = diagOptsArr[0].ann;
  }

  writer.write(`    %% Auto-generated from adl modules: ${resources.moduleNames.join(" ")}\n`);
  writer.write(`classDiagram\n`);
  writer.write(`    direction ${diagOpts !== null ? diagOpts["direction"] : "LR"};\n`);
  writer.write(`\n`);
  // writer.write(`%% structs\n`);

  resources.scopedDecls.forEach(sd => {
    writer.cwrite(iif(sd), `    class ${mndn2mcd(sd)}["${sd.decl.name}"]\n`);
    if (sd.decl.type_.kind === "union_") {
      const is_enum = isEnum(sd.decl.type_.value);
      writer.cwrite(iif(sd), `    <<${is_enum ? "enum" : "union"}>> ${mndn2mcd(sd)}\n`);
    }
  });
  writer.write(`\n`);
  resources.scopedDecls.forEach(sd => iter_sd(sd, collect_arrow_field));
  arrows.sort((a1, a2) => {
    const a = a1.idx;
    const b = a2.idx;
    if (a === undefined && b === undefined) {
      return 0;
    }
    if (a === undefined) {
      return 1;
    }
    if (b === undefined) {
      return -1;
    }
    if (a < 0 && b < 0) {
      return a - b;
    }
    if (a < 0) {
      return -1;
    }
    if (b < 0) {
      return 1;
    }
    return a - b;
  });
  arrows.forEach(a => {
    writer.cwrite(iif(a.sd) || iif(a.to_), `    ${mndn2mcd(a.sd)} ${a.arrow} ${sn2mcd(a.to_)} : ${a.name}${a.name_decoration}\n`);
  });
  writer.write(`\n`);
  resources.scopedDecls.forEach(sd => iter_sd(sd, gen_field));
  writer.write(`\n`);

  function iter_sd(sd: adlast.ScopedDecl, fn: (sd: adlast.ScopedDecl, f: adlast.Field) => void) {
    switch (sd.decl.type_.kind) {
      case "newtype_":
        if (sd.decl.type_.value.typeExpr.typeRef.kind === "reference") {
          const ref = sd.decl.type_.value.typeExpr.typeRef.value;
          iter_sd(resources.declMap[`${ref.moduleName}.${ref.name}`], fn);
        }
        return;
      case "type_":
        if (sd.decl.type_.value.typeExpr.typeRef.kind === "reference") {
          const ref = sd.decl.type_.value.typeExpr.typeRef.value;
          iter_sd(resources.declMap[`${ref.moduleName}.${ref.name}`], fn);
        }
        return;
      case "struct_":
        sd.decl.type_.value.fields.forEach(f => fn(sd, f));
        return;
      case "union_":
        sd.decl.type_.value.fields.forEach(f => fn(sd, f));
        return;
    }
  }

  function collect_arrow_field(sd: adlast.ScopedDecl, f: adlast.Field) {
    const { typeRef, card, fcard, hidden, embed } = get_fields(f);
    if (typeRef.kind === "reference") {
      const to_ = typeRef.value;
      if (iif(sd) && iim(to_.moduleName)) {
        const toDecl = resources.declMap[`${to_.moduleName}.${to_.name}`];
        if (getAnnotation(toDecl.decl.annotations, HIDDEN) !== undefined) {
          return;
        }
        let arrow = "";
        switch (sd.decl.type_.kind) {
          case "struct_": {
            arrow = embed ? "--|>" : "-->";
            break;
          }
          case "union_": {
            if (getAnnotation(f.annotations, HIDE_REALIZATION) !== undefined) {
              return;
            }
            arrow = "<|..";
            break;
          }
        }
        arrows.push({
          arrow,
          sd,
          to_,
          card,
          idx: getAnnotation(f.annotations, ARROW_IDX) as number | undefined,
          comment: "",
          name: f.name,
          name_decoration: fcard,
        });

        capture_deps(sd, to_);
      }
    }
  }

  function gen_field(sd: adlast.ScopedDecl, f: adlast.Field) {
    const { typeRef, card, fcard, hidden, embed } = get_fields(f);
    if (arrows.find(a => {
      // if (!iif(a.sd) && !iif(a.to_)) {
      //   return false;
      // }
      return a.sd.moduleName === sd.moduleName &&
        a.sd.decl.name === sd.decl.name &&
        a.name === f.name;
    }) !== undefined) {
      return;
    }
    // if( typeRef.kind === "reference" && iif(typeRef.value) ) {
    //   return
    // }
    writer.cwrite(iif(sd) && !hidden && !embed, `    ${mndn2mcd(sd)} : ${f.name}${fcard}\n`);

    // switch (sd.decl.type_.kind) {
    //   case "struct_": {
    //     const { typeRef, card, fcard, hidden, embed } = get_fields(f);
    //     writer.cwrite(iif(sd) && !hidden && !embed, `    ${mndn2mcd(sd)} : ${f.name}${fcard}\n`);
    //     break;
    //   }
    //   case "union_": {
    //     const { typeRef, card, fcard, hidden, embed } = get_fields(f);
    //     writer.cwrite(iif(sd) && !hidden && !embed, `    ${mndn2mcd(sd)} : ${f.name}${fcard}\n`);
    //     break;
    //   }
    // }
  }


  // const gen_type_newtype_fields = (sd: ScopedDecl<adlast.TypeDef, "type_" | "newtype_">) => {
  //   const isEmb = getAnnotation(sd.decl.annotations, EMBEDDED);
  //   if (isEmb !== undefined) {
  //     let typeRef = sd.decl.type_.value.typeExpr.typeRef;
  //     if (typeRef.kind === "reference") {
  //       const to_ = typeRef.value;
  //       // TODO resolve typeRef.value:ScopedName and list fields
  //       writer.cwrite(iif(sd) || iif(to_), `    ${mndn2mcd(sd)} --|> ${sn2mcd(to_)}\n`);
  //       capture_deps(sd, to_);
  //     }
  //   }
  // };

  // resources.aliases.forEach(sd => gen_type_newtype_fields(sd));
  // writer.write(`\n`);
  // resources.newtypes.forEach(sd => gen_type_newtype_fields(sd));
  // writer.write(`\n`);

  if (ifm()) {
    // xfocus_in.sd.forEach(sd => {
    //   writer.write(`    class ${mndn2mcd(sd)}["${sd.moduleName.split(".").slice(-1)}.${sd.decl.name}"]\n`);
    // });
    xfocus_out.sn.forEach(sn => {
      writer.write(`    class ${sn2mcd(sn)}["${sn.moduleName.split(".").slice(-1)}.${sn.name}"]\n`);
    });
  }

  // if (ifm() && xfocus_in.sd.length > 0) {
  //   writer.write(`    namespace _in_ {\n`);
  //   xfocus_in.sd.forEach(sd => {
  //     writer.write(`    class ${mndn2mcd(sd)}\n`);
  //   });
  //   writer.write(`    }\n`);
  // }
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
      const hidden = getAnnotation(sd.decl.annotations, HIDDEN) !== undefined;
      if (hidden) {
        return;
      }
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
const HIDE_REALIZATION = scopedName("common.mspec", "HideRealization");
const EMBEDDED = scopedName("common.mspec", "Embedded");
const EMBED = scopedName("common.mspec", "Embed");
const ARROW_IDX = scopedName("common.mspec", "ArrowIdx");
const DIAGRAM_OPTIONS = scopedName("common.mspec", "DiagramOptions");

