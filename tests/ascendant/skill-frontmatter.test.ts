import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const ROOT_DIR = resolve(import.meta.dir, "../..");
const SKILL_DIR = join(ROOT_DIR, "skills", "ascendant");
const COPIES = [
  join(SKILL_DIR, "SKILL.md"),
  join(ROOT_DIR, ".claude-plugin", "skills", "ascendant", "SKILL.md"),
];

function frontmatter(file: string): Record<string, string> {
  const content = readFileSync(file, "utf8");
  const block = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  if (block === undefined) throw new Error(`${file} has no frontmatter`);
  const fields: Record<string, string> = {};
  let parent: string | null = null;
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (/^\s+\S/.test(line) && parent) fields[`${parent}.${key}`] = value;
    else {
      fields[key] = value;
      parent = value === "" ? key : null;
    }
  }
  return fields;
}

describe("skill frontmatter", () => {
  test("every published copy names the author and the license", () => {
    const source = frontmatter(join(SKILL_DIR, "SKILL.src.md"));
    expect(source.license).toBe("AGPL-3.0-or-later");
    expect(source["metadata.author"]).toBe("Laxman K R");

    for (const copy of COPIES) {
      const fields = frontmatter(copy);
      expect(fields.license).toBe(source.license);
      expect(fields["metadata.author"]).toBe(source["metadata.author"]);
    }
  });
});
