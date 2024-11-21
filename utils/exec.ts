export async function exec(cmd: string, args: string[]): Promise<void> {
  const command = new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  process.stdout.pipeTo(Deno.stdout.writable);
  process.stderr.pipeTo(Deno.stderr.writable);

  const { success } = await process.status;
  if (!success) {
    throw new Error(`Failed to run cmd: ${cmd} ${args.join(' ')}`);
  }
}

export async function execAdlc(args: string[]): Promise<void> {
  await exec("adlc", args);
}

