// Copy exported ABIs from ../abi to ./ui-admin/src/abi
import { mkdirSync, cpSync, existsSync } from "fs";
import { resolve } from "path";

const src = resolve(process.cwd(), "abi");
const dst = resolve(process.cwd(), "ui-admin", "src", "abi");

if (!existsSync(src)) {
  console.error("ABI source folder not found. Run `npm run compile` first.");
  process.exit(1);
}

mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log("ABI copied to ui-admin/src/abi");
