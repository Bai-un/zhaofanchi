import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2];
const out = process.argv[3] || "shot.png";
const waitMs = Number(process.argv[4] || 3500);
const width = Number(process.argv[5] || 390);
const height = Number(process.argv[6] || 900);

if (!url) {
  console.error("usage: node scripts/shot.mjs <url> <out.png> [waitMs] [width] [height]");
  process.exit(1);
}

const port = 9400 + Math.floor(Math.random() * 200);
const profile = `C:/Users/baima/AppData/Local/Temp/shiji-shot-${Date.now()}`;
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

async function getPage() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* 等待 Chrome 启动 */
    }
    await delay(100);
  }
  throw new Error("Chrome DevTools 没有就绪");
}

const page = await getPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let seq = 0;

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
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

try {
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.navigate", { url });
  await delay(waitMs);
  const result = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  if (!result.result?.data) throw new Error(JSON.stringify(result));
  writeFileSync(out, Buffer.from(result.result.data, "base64"));
  console.log(`saved ${out}`);
} finally {
  ws.close();
  proc.kill();
}
