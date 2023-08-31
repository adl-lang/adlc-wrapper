

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

  cwrite(f: boolean, s: string) {
    if( f ) {
      this.content.push(s);
    }
  }

  close(): Promise<void> {
    if( this.path === "-" ) {
      Deno.stdout.writeSync(new TextEncoder().encode(this.content.join("")))
    }
    return Deno.writeTextFile(this.path, this.content.join(""));
  }
}

