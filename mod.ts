export {getAdlStdLibDir, globFiles} from "./utils/fs.ts";

export {genTypescript} from "./gen-typescript.ts";
export type {GenTypescriptParams} from "./gen-typescript.ts";

export {genRust} from "./gen-rust.ts";
export type {GenRustParams} from "./gen-rust.ts";

export {genJava} from "./gen-java.ts";
export type {GenJavaParams} from "./gen-java.ts";

import {} from "./utils/adl.ts"
import {} from "./adl-gen/resolver.ts"
import {} from "./adl-gen/sys/adlast.ts"
import {} from "./adl-gen/sys/annotations.ts"
import {} from "./adl-gen/sys/dynamic.ts"
import {} from "./adl-gen/sys/types.ts"
