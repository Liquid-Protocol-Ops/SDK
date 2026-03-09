import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const SDK_DIR = resolve(__dirname, "..");

describe("SDK build output", { timeout: 60_000 }, () => {
  it("npm run build succeeds and produces expected output files", () => {
    execSync("npm run build", { cwd: SDK_DIR, stdio: "pipe" });

    expect(existsSync(resolve(SDK_DIR, "dist/index.js"))).toBe(true);
    expect(existsSync(resolve(SDK_DIR, "dist/index.mjs"))).toBe(true);
    expect(existsSync(resolve(SDK_DIR, "dist/index.d.ts"))).toBe(true);
  });
});
