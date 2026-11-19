import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = process.env.SHIJI_BASE || "http://127.0.0.1:5173/";
const stamp = Date.now();
setTimeout(() => {
  console.error("BACKUP E2E WATCHDOG: 超时退出");
  process.exit(2);
}, 75000).unref();
const workDir = `C:/Users/baima/AppData/Local/Temp/shiji-backup-${stamp}`;
mkdirSync(workDir, { recursive: true });
const profile = `${workDir}/profile`;
const port = 9800 + Math.floor(Math.random() * 150);

const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function pageTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* 等待启动 */
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools 没有就绪");
}

const target = await pageTarget();
console.log("checkpoint: page target ready");
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const logs = [];
let seq = 0;

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    logs.push(`exception: ${message.params.exceptionDetails?.text || "unknown"}`);
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    logs.push(`console.error: ${message.params.args?.map((arg) => arg.value ?? arg.description).join(" ")}`);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || "evaluate failed");
  }
  return response.result?.result?.value;
}

const wait = (ms) => delay(ms);

async function clickText(text, exact = false) {
  const ok = await evaluate(`(() => {
    const items = [...document.querySelectorAll('button, a')];
    const found = items.find((el) => {
      const value = (el.textContent || '').trim();
      return ${exact ? `value === ${JSON.stringify(text)}` : `value.includes(${JSON.stringify(text)})`};
    });
    if (!found) return false;
    found.click();
    return true;
  })()`);
  if (!ok) throw new Error(`找不到可点击元素：${text}`);
}

async function goHash(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await wait(800);
}

async function waitForDownload(timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const download = await evaluate(`(async () => {
      const item = window.__downloads?.[0];
      if (!item) return null;
      const text = await (await fetch(item.href)).text();
      return { name: item.name, text };
    })()`);
    if (download) return download;
    await wait(250);
  }
  throw new Error("没有等到导出的备份文件");
}

async function importFile(filePath) {
  const response = await send("Runtime.evaluate", {
    expression: `document.querySelector('input[type=file]')`,
  });
  const objectId = response.result?.result?.objectId;
  if (!objectId) throw new Error("没有找到文件输入框");
  const setResult = await send("DOM.setFileInputFiles", { files: [filePath], objectId });
  if (setResult.error) throw new Error(`设置文件失败：${setResult.error.message}`);
  await wait(400);
  // 某些版本不会自动派发 change，兜底手动触发一次
  await evaluate(`(() => {
    const el = document.querySelector('input[type=file]');
    if (el && el.files && el.files.length) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })()`);
  await wait(1500);
}

async function statCount() {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll('.stat-value')][0];
    return el ? Number(el.textContent) : -1;
  })()`);
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 900,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.navigate", { url: base });
  await wait(3200);
  await evaluate(`(() => {
    window.__downloads = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__downloads.push({ name: this.download, href: this.href });
        return;
      }
      return original.call(this);
    };
  })()`);

  const initialCards = await evaluate(`document.querySelectorAll('a.recipe-card').length`);
  console.log("initial cards", initialCards);
  if (initialCards < 2) throw new Error("示例菜谱不足");

  await goHash("/settings");
  await clickText("导出", true);
  const exported = await waitForDownload();
  const payload = JSON.parse(exported.text);
  console.log("export file", exported.name, "app", payload.app, "version", payload.version, "recipes", payload.recipes.length);
  if (payload.app !== "找饭吃" || payload.version !== 2 || payload.recipes.length < 2) {
    throw new Error("导出 JSON 结构不正确");
  }
  const exportedFile = `${workDir}/${exported.name}`;
  writeFileSync(exportedFile, exported.text);

  // 合并导入：新增一道菜
  const mergeFile = `${workDir}/merge-backup.json`;
  const cloned = structuredClone(payload.recipes[0]);
  cloned.id = `merge-${stamp}`;
  cloned.name = "备份新增菜";
  cloned.updatedAt = Date.now() + 5000;
  cloned.isPinned = false;
  writeFileSync(mergeFile, JSON.stringify({ ...payload, recipes: [...payload.recipes, cloned] }, null, 2));
  await importFile(mergeFile);
  let count = await statCount();
  let text = await evaluate(`document.body.innerText`);
  console.log("after merge count", count, "toast", text.includes("已合并导入"));
  if (count !== initialCards + 1 || !text.includes("已合并导入")) {
    throw new Error(`合并导入结果不对：count=${count}`);
  }

  // 旧版 v1 备份导入
  const legacyFile = `${workDir}/legacy-v1.json`;
  writeFileSync(
    legacyFile,
    JSON.stringify(
      {
        version: 1,
        recipes: [
          {
            id: "legacy-r1",
            name: "红烧肉",
            description: "外婆做法",
            servings: 4,
            prep_time: 10,
            cook_time: 60,
            tags: '["家常"]',
            is_pinned: 0,
            created_at: 1700000000000,
            updated_at: 1700000000000,
          },
        ],
        ingredients: [
          { id: "legacy-i1", recipe_id: "legacy-r1", name: "五花肉", amount: "500g", sort: 0 },
          { id: "legacy-i2", recipe_id: "legacy-r1", name: "生抽", amount: "2勺", sort: 1 },
          { id: "legacy-i3", recipe_id: "legacy-r1", name: "盐", amount: "适量", sort: 2 },
        ],
        prep_items: [{ id: "legacy-p1", recipe_id: "legacy-r1", content: "五花肉切块", sort: 0 }],
        steps: [
          { id: "legacy-s1", recipe_id: "legacy-r1", content: "冷水下锅焯水", duration: 5, sort: 0 },
          { id: "legacy-s2", recipe_id: "legacy-r1", content: "小火慢炖", duration: 50, sort: 1 },
        ],
        notes: [{ id: "legacy-n1", recipe_id: "legacy-r1", content: "糖色别炒糊", created_at: 1700000000000 }],
      },
      null,
      2,
    ),
  );
  await importFile(legacyFile);
  count = await statCount();
  text = await evaluate(`document.body.innerText`);
  console.log("after legacy count", count);
  if (count !== initialCards + 2) throw new Error(`旧版备份导入数量不对：${count}`);

  await goHash("/");
  await wait(600);
  const cards = await evaluate(`[...document.querySelectorAll('a.recipe-card')].map((a) => a.innerText.replace(/\\n/g, ' '))`);
  console.log("cards", JSON.stringify(cards));
  const legacyCard = cards.find((item) => item.includes("红烧肉"));
  if (!legacyCard || !legacyCard.includes("1小时10分")) {
    throw new Error(`旧版备份菜谱显示不对：${legacyCard}`);
  }
  await evaluate(`(() => {
    const link = [...document.querySelectorAll('a.recipe-card')].find((a) => a.innerText.includes('红烧肉'));
    link?.click();
  })()`);
  await wait(900);
  const detail = await evaluate(`document.body.innerText`);
  for (const needle of ["五花肉", "500g", "2勺", "适量", "冷水下锅焯水", "备菜", "糖色别炒糊"]) {
    if (!detail.includes(needle)) throw new Error(`旧版备份详情缺少：${needle}`);
  }
  const baseLabel = await evaluate(`document.querySelector('.badge.base')?.textContent || ''`);
  console.log("legacy base label", baseLabel);
  if (!baseLabel.includes("基准")) throw new Error("旧版备份没有设置主料基准");

  // 覆盖导入：恢复为导出时的状态
  await goHash("/settings");
  await evaluate(`window.confirm = () => true`);
  const replaceClicked = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.list-row')].find((el) => el.innerText.includes('导入并覆盖'));
    const btn = row?.querySelector('button');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (!replaceClicked) throw new Error("找不到覆盖导入按钮");
  await wait(300);
  await importFile(exportedFile);
  await wait(600);
  count = await statCount();
  const replacedText = await evaluate(`document.body.innerText`);
  console.log("after replace count", count, "toast", replacedText.includes("已覆盖导入"));
  if (count !== payload.recipes.length) throw new Error(`覆盖导入数量不对：${count}`);
  if (!replacedText.includes("已覆盖导入")) throw new Error("没有覆盖导入提示");

  // 主题持久化
  await clickText("深色", true);
  await wait(400);
  await send("Page.reload");
  await wait(2500);
  const theme = await evaluate(`document.documentElement.dataset.theme || ''`);
  console.log("theme after reload", theme);
  if (theme !== "dark") throw new Error(`主题没有持久化：${theme}`);

  // 清单与 Service Worker 资源
  const manifest = await fetch(`${base}manifest.webmanifest`);
  const manifestJson = await manifest.json();
  console.log("manifest", manifest.status, manifestJson.name, manifestJson.display);
  if (!manifest.ok || manifestJson.display !== "standalone") throw new Error("manifest 不正确");
  const sw = await fetch(`${base}sw.js`);
  const swText = await sw.text();
  console.log("sw", sw.status, swText.length);
  if (!sw.ok || !swText.includes("addEventListener")) throw new Error("sw.js 不正确");

  console.log("logs", JSON.stringify(logs));
  if (logs.length) throw new Error(`页面出现错误：${logs.join(" | ")}`);
  console.log("BACKUP E2E OK");
} catch (error) {
  console.error("BACKUP E2E FAILED:", error.message);
  console.error("logs", JSON.stringify(logs));
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
