import * as fs from "@std/fs"
import * as path from "@std/path"

export async function globFiles(
  root: string,
  pattern: string,
): Promise<string[]> {
  const paths: string[] = [];
  for await (const f of fs.expandGlob(pattern, { root })) {
    paths.push(f.path);
  }
  return paths;
}

export function getHelixCore(): string {
  const modulepath = new URL(import.meta.url).pathname;
  return path.dirname(path.dirname(path.dirname(path.dirname(modulepath))));
}

export async function getAdlStdLibDir(): Promise<string> {
  const proc = new Deno.Command("adlc", {
    args: ["show", "--adlstdlib"],
  });
  const {stdout} = await proc.output();
  return new TextDecoder().decode(stdout).trim();
}
