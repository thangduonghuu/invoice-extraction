import { describe, expect, it } from "vitest";
import { allFixtureNames, extractFixture, fixtureExists } from "./fixtureHelpers.js";

const presentFixtures = allFixtureNames().filter(fixtureExists);

describe.skipIf(presentFixtures.length === 0)("property: every item field is traceable to its source text", () => {
  it.each(presentFixtures)("%s - sourceText.includes(rawValue) for every evidenced field", async (name) => {
    const result = await extractFixture(name);
    for (const item of result.items) {
      for (const [field, raw] of Object.entries(item.evidence.fields)) {
        expect(
          item.evidence.sourceText.includes(raw),
          `${name} ${item.id} field "${field}" raw value "${raw}" not found in sourceText "${item.evidence.sourceText}"`,
        ).toBe(true);
      }
    }
  });
});
