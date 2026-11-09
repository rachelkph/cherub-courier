// Copies non-TS renderer files into dist/renderer.
import { cpSync, mkdirSync } from "node:fs";
for (const [from, to] of [
  ["src/renderer/index.html", "dist/renderer/index.html"],
  ["src/renderer/onboarding/index.html", "dist/renderer/onboarding/index.html"],
  ["src/renderer/onboarding/onboarding.css", "dist/renderer/onboarding/onboarding.css"],
]) {
  mkdirSync(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  cpSync(from, to);
}
