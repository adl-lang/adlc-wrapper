import {
  packages,
  forPlatform,
  getHostPlatform,
  installTo
} from "jsr:@adllang/local-setup";

const ADL = packages.adl("1.2.1");

export async function main() {
  if (Deno.args.length != 2) {
    console.error("Usage: local-setup DENOVERSION LOCALDIR");
    Deno.exit(1);
  }
  const denoVersion = Deno.args[0];
  const localdir = Deno.args[1];

  const platform = getHostPlatform();

  const DENO = packages.deno(denoVersion);

  const installs = [
    forPlatform(DENO, platform),
    forPlatform(ADL, platform),
  ];

  await installTo(installs, localdir);
}

main()
  .catch((err) => {
    console.error("error in main", err);
  });
