// Copies non-TS renderer files into dist/renderer.
import { cpSync, mkdirSync } from "node:fs";
mkdirSync("dist/renderer", { recursive: true });
cpSync("src/renderer/index.html", "dist/renderer/index.html");
