import { afterEach } from "vitest";

// This file loads for every test in the project (engine/backend tests run in
// plain Node - no `document`), so the DOM-specific setup only runs when a
// jsdom environment is actually present (tests/** - see vitest.config.ts's
// environmentMatchGlobs).
if (typeof document !== "undefined") {
  const [{ cleanup }] = await Promise.all([import("@testing-library/react"), import("@testing-library/jest-dom/vitest")]);
  afterEach(() => {
    cleanup();
  });
}
