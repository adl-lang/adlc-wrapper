import { isEnum } from "../adl-gen/runtime/utils.ts";
import * as adlast from "../adl-gen/sys/adlast.ts";
import { 
  AdlModuleMap,
  ParseAdlParams,
  getAnnotation,
  getModuleLevelAnnotation,
  scopedName
} from "../utils/adl.ts";
import {
  HIDDEN,
  ScopedDecl,
  ScopedStruct,
  ScopedType,
  ScopedUnion,
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

type Arrow = {
  sd: ScopedType;
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
  const iifmn = (moduleName: string) => ifm() && !params.focus_modules!.includes(moduleName) ? false : true;

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

  function get_fields(fld0: adlast.Field) {
    let typeRef = fld0.typeExpr.typeRef;
    let parameters = fld0.typeExpr.parameters
    let card: "" | `"optional"` | `"list"` = "";
    let fcard = "";

    if (typeRef.kind === "primitive") {
      if (typeRef.value === "Vector") {
        typeRef = fld0.typeExpr.parameters[0].typeRef;
        parameters = fld0.typeExpr.parameters[0].parameters;
        card = `"list"`;
        fcard = " 0..*️";
      }
      if (typeRef.value === "Nullable") {
        typeRef = fld0.typeExpr.parameters[0].typeRef;
        parameters = fld0.typeExpr.parameters[0].parameters;
        card = `"optional"`;
        fcard = " ?";
      }
    }

    // TODO this should be done earlier and recursively
    if (typeRef.kind === "reference") {
      const sn = `${typeRef.value.moduleName}.${typeRef.value.name}`;
      const fld_sd = resources.declMap[sn];
      if (getAnnotation(fld_sd.decl.annotations, UNWRAP_TYPE_PARAM) !== undefined) {
        if (parameters.length !== 1) {
          throw new Error(`can only unwrap type param is there is one and only one TP. '${sn}' used on '${fld0.name}'`);
        } else {
          // Deno.stderr.write(new TextEncoder().encode(
          //   `unwrapping '${sn}' used on '${fld0.name}'\n`
          // ));
          typeRef = parameters[0].typeRef;
        }
      }
    }

    const hidden = getAnnotation(fld0.annotations, HIDDEN) !== undefined;
    const embed = getAnnotation(fld0.annotations, EMBED) !== undefined;
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

  // writer.write(`    %% Auto-generated from adl modules: ${resources.moduleNames.join(" ")}\n`);
  writer.write(`classDiagram\n`);
  writer.write(`    direction ${diagOpts !== null ? diagOpts["direction"] : "LR"};\n`);
  writer.write(`\n`);
  // writer.write(`%% structs\n`);

  resources.scopedDecls.forEach(sd => {
    const tp = sd.decl.type_.value.typeParams.length === 0 ? "" : "~" + sd.decl.type_.value.typeParams.join(",") + "~";
    writer.cwrite(iif(sd), `    class ${mndn2mcd(sd)}${tp}["${sd.decl.name}"]\n`);
    const note = getAnnotation(sd.decl.annotations, NOTE);
    if (note) {
      writer.cwrite(iif(sd), `    note for ${mndn2mcd(sd)} "${note}" \n`);
    }
    if (sd.decl.type_.kind === "union_") {
      const is_enum = isEnum(sd.decl.type_.value);
      writer.cwrite(iif(sd), `    <<${is_enum ? "enum" : "union"}>> ${mndn2mcd(sd)}\n`);
    }
  });
  writer.write(`\n`);
  resources.scopedDecls.forEach(sd => iter_sd(sd, collect_arrow_fields));
  arrows.sort(compareArrow);
  arrows.forEach(a => {
    writer.cwrite(iif(a.sd) || iif(a.to_), `    ${mndn2mcd(a.sd)} ${a.arrow} ${sn2mcd(a.to_)} : ${a.name}${a.name_decoration}\n`);
  });
  writer.write(`\n`);
  resources.scopedDecls.forEach(sd => iter_sd(sd, gen_fields));
  writer.write(`\n`);

  function iter_sd(sd: adlast.ScopedDecl, fn: (sd: ScopedType) => void) {
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
        fn(sd as ScopedStruct);
        return;
      case "union_":
        fn(sd as ScopedUnion);
        return;
    }
  }

  function collect_arrow_fields(sd: ScopedType) {
    sd.decl.type_.value.fields.forEach(f => collect_arrow_field(sd, f));
  }

  function collect_arrow_field(sd: ScopedType, fld: adlast.Field) {
    const { typeRef, card, fcard, hidden, embed } = get_fields(fld);
    if (typeRef.kind === "reference") {
      const to_ = typeRef.value;
      if (iif(sd) && iifmn(to_.moduleName)) {
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
            if (getAnnotation(fld.annotations, HIDE_REALIZATION) !== undefined) {
              return;
            }
            arrow = "<|..";
            break;
          }
        }
        arrows.push({
          arrow, sd, to_, card,
          idx: getAnnotation(fld.annotations, ARROW_IDX) as number | undefined,
          comment: "",
          name: fld.name,
          name_decoration: fcard,
        });
        capture_deps(sd, to_);
      }
    }
  }

  function gen_fields(sd: ScopedType) {
    const typeParams = sd.decl.type_.value.typeParams;
    sd.decl.type_.value.fields.forEach(f => {
      const { typeRef, card, fcard, hidden, embed } = get_fields(f);
      if (arrows.find(a => {
        return a.sd.moduleName === sd.moduleName &&
          a.sd.decl.name === sd.decl.name &&
          a.name === f.name;
      }) !== undefined) {
        return;
      }
      writer.cwrite(iif(sd) && !hidden && !embed, `    ${mndn2mcd(sd)} : ${f.name} ${teStr(f.typeExpr)}\n`);
    });
  }

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
  // if (ifm() && xfocus_out.sn.length > 0) {
  //   writer.write(`    namespace _out_ {\n`);
  //   xfocus_out.sn.forEach(sn => {
  //     writer.write(`    class ${sn2mcd(sn)}\n`);
  //   });
  //   writer.write(`    }\n`);
  // }

  // forEachModuleDecl(
  //   loadedAdl.modules,
  //   (mn) => {
  //     if (!iif({ moduleName: mn })) {
  //       return false;
  //     }
  //     if (!iim(mn)) {
  //       return false;
  //     }
  //     writer.write(`    namespace ${mn.replaceAll(".", "_")} {\n`);
  //     return true;
  //   },
  //   (sd) => {
  //     const hidden = getAnnotation(sd.decl.annotations, HIDDEN) !== undefined;
  //     if (hidden) {
  //       return;
  //     }
  //     if (getAnnotation(sd.decl.annotations, REPRESENTED_BY) === undefined) {
  //       writer.write(`        class ${mndn2mcd(sd)}\n`);
  //     }
  //   },
  //   () => {
  //     writer.write(`    }\n`);
  //   }
  // );

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

function teStr(typeExpr: adlast.TypeExpr): string {
  const typeRef = typeExpr.typeRef;
  const parameters = typeExpr.parameters;
  switch (typeRef.kind) {
    case "primitive":
      switch (typeRef.value) {
        case "Vector":
          return teStr(parameters[0]) + "[]";
        case "Nullable":
          return teStr(parameters[0]);
        default:
          return typeRef.value;
      }
    case "reference":
      const tpsStr = parameters.length > 0
        ? "~" + parameters.map((p) => teStr(p)).join("_") + "~"
        : "";
      return `${typeRef.value.name}${tpsStr}`;
    case "typeParam":
      return typeRef.value;
  }
}

function compareArrow(a1: Arrow, a2: Arrow) {
  const a = a1.idx;
  const b = a2.idx;
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a < 0 && b < 0) return a - b;
  if (a < 0) return -1;
  if (b < 0) return 1;
  return a - b;
}

const REPRESENTED_BY = scopedName("common.mspec", "RepresentedBy");
const HIDE_REALIZATION = scopedName("common.mspec", "HideRealization");
const EMBEDDED = scopedName("common.mspec", "Embedded");
const EMBED = scopedName("common.mspec", "Embed");
const ARROW_IDX = scopedName("common.mspec", "ArrowIdx");
const DIAGRAM_OPTIONS = scopedName("common.mspec", "DiagramOptions");
const UNWRAP_TYPE_PARAM = scopedName("common.mspec", "UnwrapTypeParam");
const NOTE = scopedName("common.mspec", "Note");

