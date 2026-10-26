import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "bun:test";

const run = promisify(execFile);
const CONFIG_SCRIPT = resolve(import.meta.dir, "../../skills/ascendant/scripts/config.sh");
const CONFIG_FILE = join(".ascendant", "config.txt");

async function withWorkspace(body: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = await mkdtemp(join(tmpdir(), "ascendant-config-"));
  try {
    await body(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function config(cwd: string, ...args: ReadonlyArray<string>) {
  return run("bash", [CONFIG_SCRIPT, ...args], { cwd });
}

describe("method preference script", () => {
  test("writes the two keys in canonical form and reads them back", async () => {
    await withWorkspace(async (cwd) => {
      const written = await config(
        cwd,
        "set",
        "--default-method",
        "kp",
        "--ask-method-every-session",
        "false",
      );
      expect(written.stdout).toContain("status: written");
      expect(written.stdout).toContain("defaultMethod: KP");

      expect(await readFile(join(cwd, CONFIG_FILE), "utf8")).toBe(
        "defaultMethod: KP\naskMethodEverySession: FALSE\n",
      );

      const shown = await config(cwd, "show");
      expect(shown.stdout).toContain("status: found");
      expect(shown.stdout).toContain("defaultMethod: KP");
      expect(shown.stdout).toContain("askMethodEverySession: FALSE");
    });
  });

  test("forces ask-every-session when no default school is chosen", async () => {
    await withWorkspace(async (cwd) => {
      const written = await config(
        cwd,
        "set",
        "--default-method",
        "NULL",
        "--ask-method-every-session",
        "FALSE",
      );
      expect(written.stdout).toContain("defaultMethod: NULL");
      expect(written.stdout).toContain("askMethodEverySession: TRUE");
      expect(await readFile(join(cwd, CONFIG_FILE), "utf8")).toBe(
        "defaultMethod: NULL\naskMethodEverySession: TRUE\n",
      );
    });
  });

  test("reads a missing file as no default school, asked every time", async () => {
    await withWorkspace(async (cwd) => {
      const shown = await config(cwd, "show");
      expect(shown.stdout).toContain("status: missing");
      expect(shown.stdout).toContain("defaultMethod: NULL");
      expect(shown.stdout).toContain("askMethodEverySession: TRUE");
    });
  });

  test("rejects an unknown method without touching the file", async () => {
    await withWorkspace(async (cwd) => {
      const failure = (await config(
        cwd,
        "set",
        "--default-method",
        "Vedic2",
        "--ask-method-every-session",
        "TRUE",
      ).catch((error: unknown) => error)) as { stdout?: string };

      expect(failure.stdout).toContain("code: INVALID_ARGUMENT");
      expect(existsSync(join(cwd, CONFIG_FILE))).toBe(false);
    });
  });
});
