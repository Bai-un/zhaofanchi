import { cpSync, mkdirSync, rmSync } from "node:fs";

const root = process.argv[2] || ".";
const src = `${root}/dist`;
const dest = `${root}/android-app/app/src/main/assets`;

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`synced ${src} -> ${dest}`);
