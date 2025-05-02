import { execSync, spawn } from "child_process";
import { EnvironmentProvider } from "../EnvironmentProvider";
import * as fs from "fs";
import * as path from "path";
import { getPackageDotJson } from "../../../utils/clack-utils";
import type { WizardOptions } from "../../../utils/types";
import { runCommandInteractively } from "../../../utils/cli-utils";



export class VercelEnvironmentProvider extends EnvironmentProvider {
  name = "Vercel";

  constructor(options: WizardOptions) {
    super(options);
  }

  async detect(): Promise<boolean> {
    return Promise.any([
      this.hasVercelConfig(),
      this.hasVercelDependencies(),
      this.hasDotVercelDir(),
      this.hasVercelCli(),
    ]);
  }

  hasVercelConfig(): boolean {
    const vercelJson = path.join(this.options.installDir, "vercel.json");
    return fs.existsSync(vercelJson);
  }

  async hasVercelDependencies(): Promise<boolean> {
    const packageJson = await getPackageDotJson(this.options);

    // check for any package starting with @vercel
    return (
      Object.keys(packageJson?.dependencies ?? {}).some((key) => key.startsWith("@vercel")) ||
      Object.keys(packageJson?.devDependencies ?? {}).some((key) => key.startsWith("@vercel"))
    );
  }

  hasDotVercelDir(): boolean {
    const dotVercelDir = path.join(this.options.installDir, ".vercel");
    return fs.existsSync(dotVercelDir);
  }

  hasVercelCli(): boolean {
    try {
      execSync("vercel --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  get environments(): string[] {
    return ["production"];
  }

  get dotEnvPath(): string {
    return path.join(this.options.installDir, ".env");
  }

  isAuthenticated(): boolean {
    try {
      execSync("vercel whoami", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  isProjectLinked(): boolean {
    try {
      execSync("vercel ls", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  async linkProject(): Promise<void> {
    await runCommandInteractively("vercel link", undefined, { cwd: this.options.installDir });
  }

  async login(): Promise<void> {
    await runCommandInteractively("vercel login", undefined, { cwd: this.options.installDir });
  }

  async uploadEnvVars(vars: Record<string, string>): Promise<void> {

    if (!this.hasVercelCli()) {
      execSync("npm install -g vercel", { stdio: "ignore" });
    }

    if (!fs.existsSync(this.dotEnvPath)) {
      throw new Error("No .env file found");
    }

    if (!this.isAuthenticated()) {
      await this.login();
    }

    // If project is not already linked, link it
    if (!this.isProjectLinked()) {
      await this.linkProject();
    }

    for (const [key, value] of Object.entries(vars)) {
      for (const environment of this.environments) {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn("vercel", ["env", "add", key, environment, "<", this.dotEnvPath], {
            stdio: ["pipe", "inherit", "inherit"],
          });
          proc.stdin.write(value + "\n");
          proc.stdin.end();
          proc.on("close", code => (code === 0 ? resolve() : reject(new Error(`Failed to upload ${key}`))));
        });
      }
    }
  }
}