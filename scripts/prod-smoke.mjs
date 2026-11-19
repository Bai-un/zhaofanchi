import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://127.0.0.1:4173/";
const outDir = process.argv[2] || ".";
const stamp = Date.now();
const profile = `C:/Users/baima/AppData/Local/Temp/shiji-prod-${stamp}`;
const port = 9950 + Math.floor(Math.random() * 40);

setTimeout(() => {
  console.error("PROD SMOKE WATCHDOG: 超时退出");
  process.exit(2);
}, 60000).unref();

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

async function screenshot(name) {
  const response = await send("Page.captureScreenshot", { format: "png" });
  if (!response.result?.data) throw new Error(`screenshot failed: ${name}`);
  writeFileSync(`${outDir}/${name}`, Buffer.from(response.result.data, "base64"));
  console.log(`screenshot ${name}`);
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
  await wait(3500);

  const cards = await evaluate(`document.querySelectorAll('a.recipe-card').length`);
  console.log("online cards", cards);
  if (cards < 2) throw new Error("生产构建没有加载出示例菜谱");
  await screenshot("prod-01-home.png");

  const swState = await evaluate(`(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    return reg ? 'ready' : 'timeout';
  })()`);
  console.log("service worker", swState);
  if (swState !== "ready") throw new Error("Service Worker 没有就绪");

  await wait(800);
  const cacheKeys = await evaluate(`(async () => (await caches.keys()).join(','))()`);
  console.log("cache keys", cacheKeys);
  if (!cacheKeys.includes("shiji-shell-v2")) throw new Error("没有找到壳缓存");

  await send("Page.reload");
  await wait(3000);
  const reloadCards = await evaluate(`document.querySelectorAll('a.recipe-card').length`);
  console.log("reload cards", reloadCards);
  if (reloadCards < 2) throw new Error("刷新后菜谱丢失");

  await send("Network.enable");
  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await send("Page.reload");
  await wait(3000);
  const offlineText = await evaluate(`document.body.innerText`);
  const offlineCards = await evaluate(`document.querySelectorAll('a.recipe-card').length`);
  console.log("offline cards", offlineCards, "has title", offlineText.includes("找饭吃"));
  if (offlineCards < 2 || !offlineText.includes("找饭吃")) {
    throw new Error("断网刷新没有打开离线壳和本地菜谱");
  }
  await screenshot("prod-02-offline.png");
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  const iconChecks = await Promise.all(
    ["/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon-32.png"].map(
      async (path) => {
        const response = await fetch(`${base.replace(/\/$/, "")}${path}`);
        const buffer = await response.arrayBuffer();
        return { path, status: response.status, bytes: buffer.byteLength };
      },
    ),
  );
  console.log("icons", JSON.stringify(iconChecks));
  if (iconChecks.some((item) => item.status !== 200 || item.bytes < 500)) {
    throw new Error("图标资源不完整");
  }

  console.log("logs", JSON.stringify(logs));
  if (logs.length) throw new Error(`页面出现错误：${logs.join(" | ")}`);
  console.log("PROD SMOKE OK");
} catch (error) {
  console.error("PROD SMOKE FAILED:", error.message);
  console.error("logs", JSON.stringify(logs));
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
