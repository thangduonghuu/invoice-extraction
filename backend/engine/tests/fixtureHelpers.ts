import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "../extract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(here, "../../../fixtures");

function fixturePath(name: string): string {
  return path.join(FIXTURES_DIR, `${name}.pdf`);
}

export function fixtureExists(name: string): boolean {
  return existsSync(fixturePath(name));
}

export async function extractFixture(name: string) {
  const bytes = readFileSync(fixturePath(name));
  return extract(new Uint8Array(bytes), `test-${name}`);
}

export function allFixtureNames(): string[] {
  return ["IB-55871", "IB-55902", "IB-56010", "IB-56088", "IB-56150", "IB-STMT47"];
}
