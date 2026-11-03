// Copy Next.js standalone server assets without Unix-only shell commands.
// Called after `next build`. Supports Windows PowerShell/cmd, macOS, Linux.
import { existsSync, mkdirSync, cpSync } from "node:fs";
import { resolve, join } from "node:path";

const projectRoot = resolve(process.cwd());
const standalone = join(projectRoot, ".next", "standalone");
const serverEntrypoint = join(standalone, "server.js");
const nextStatic = join(projectRoot, ".next", "static");
const nextTarget = join(standalone, ".next", "static");

if (!existsSync(serverEntrypoint)) {
  throw new Error("Standalone server missing. Check output: 'standalone' in next.config.ts.");
}
if (!existsSync(nextStatic)) {
  throw new Error("Next.js static build missing. Run 'bun run build' after dependencies are installed.");
}

mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(nextStatic, nextTarget, { recursive: true, force: true });

const publicSource = join(projectRoot, "public");
if (existsSync(publicSource)) {
  cpSync(publicSource, join(standalone, "public"), { recursive: true, force: true });
}

console.log("Standalone assets are ready for local Node.js start.");
