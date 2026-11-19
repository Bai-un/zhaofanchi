import type { Recipe } from "../types.ts";
import { normalizeRecipe, syncBase } from "./recipe.ts";
import { sampleRecipes } from "./samples.ts";

const DB_NAME = "shiji";
const DB_VERSION = 1;
const STORE = "recipes";

let dbPromise: Promise<IDBDatabase> | null = null;
let seedPromise: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前浏览器不支持本地数据库"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("打开本地数据库失败"));
  });
  return dbPromise;
}

function requestDone<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("数据库操作失败"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("数据库事务失败"));
    tx.onabort = () => reject(tx.error || new Error("数据库事务被取消"));
  });
}

function sortRecipes(recipes: Recipe[]): Recipe[] {
  return recipes
    .slice()
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt);
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const rows = await requestDone(tx.objectStore(STORE).getAll());
  await transactionDone(tx);
  return sortRecipes((rows as Recipe[]).map(normalizeRecipe));
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const row = await requestDone(tx.objectStore(STORE).get(id));
  await transactionDone(tx);
  return row ? normalizeRecipe(row as Recipe) : null;
}

export async function saveRecipe(input: Recipe): Promise<Recipe> {
  const recipe = syncBase(normalizeRecipe(input));
  recipe.updatedAt = Date.now();
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(recipe);
  await transactionDone(tx);
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await transactionDone(tx);
}

export async function clearAllRecipes(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await transactionDone(tx);
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

export async function importRecipes(
  inputs: Recipe[],
  mode: "merge" | "replace",
): Promise<ImportResult> {
  const incoming = inputs.map((r) => syncBase(normalizeRecipe(r)));
  if (mode === "replace") {
    await clearAllRecipes();
  }
  const existing = mode === "merge" ? await listRecipes() : [];
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
  const toPut: Recipe[] = [];
  for (const recipe of incoming) {
    const old = existingMap.get(recipe.id);
    if (mode === "merge" && old && old.updatedAt >= recipe.updatedAt) {
      result.skipped += 1;
      continue;
    }
    if (old) result.updated += 1;
    else result.added += 1;
    toPut.push(recipe);
  }
  if (toPut.length) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    toPut.forEach((recipe) => store.put(recipe));
    await transactionDone(tx);
  }
  return result;
}

export function seedSamplesIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const existing = await listRecipes();
    if (existing.length > 0) return;
    for (const recipe of sampleRecipes()) {
      await saveRecipe(recipe);
    }
  })().catch(() => {
    seedPromise = null;
  });
  return seedPromise;
}

export async function storageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage || 0, quota: estimate.quota || 0 };
  } catch {
    return null;
  }
}
