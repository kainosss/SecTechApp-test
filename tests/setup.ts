import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Node-environment tests (e.g. workbook generation) have no DOM storage.
  if (typeof window !== "undefined") window.localStorage.clear();
});
