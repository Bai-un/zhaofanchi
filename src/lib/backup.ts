import type { Recipe } from "../types.ts";
import { convertBackup, type ConvertedBackup } from "./legacy.ts";
import { nativeBridge } from "./native.ts";

export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: number;
  recipes: Recipe[];
}

export function buildBackupText(recipes: Recipe[]): string {
  const payload: BackupPayload = {
    app: "找饭吃",
    version: 2,
    exportedAt: Date.now(),
    recipes,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackupText(text: string): ConvertedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (Array.isArray(raw)) {
    return convertBackup({ recipes: raw, version: 2 });
  }
  return convertBackup(raw);
}

export function downloadBackup(recipes: Recipe[]): void {
  const text = buildBackupText(recipes);
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `找饭吃备份-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
  try {
    localStorage.setItem("shiji:lastBackup", String(Date.now()));
  } catch {
    /* 忽略存储异常 */
  }
  const native = nativeBridge();
  if (native) {
    native.saveBackup(name, text);
    return;
  }
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsText(file, "utf-8");
  });
}

export function lastBackupAt(): number {
  try {
    return Number(localStorage.getItem("shiji:lastBackup") || 0);
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
