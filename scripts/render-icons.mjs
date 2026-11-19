import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = process.argv[2] || ".";
const stamp = Date.now();
const profile = `C:/Users/baima/AppData/Local/Temp/shiji-icons-${stamp}`;
const port = 9450 + Math.floor(Math.random() * 40);

setTimeout(() => {
  console.error("ICON RENDER WATCHDOG: 超时退出");
  process.exit(2);
}, 45000).unref();

const svg = readFileSync(`${root}/public/icon.svg`, "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#B85C43}
svg{display:block;width:100vw;height:100vh}
</style></head><body>${svg}</body></html>`;
const dataUrl = `data:text/html;base64,${Buffer.from(html).toString("base64")}`;

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

const targets = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
];

try {
  await send("Page.enable");
  await send("Runtime.enable");
  for (const [file, size] of targets) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: size,
      height: size,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: dataUrl });
    await delay(600);
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
      captureBeyondViewport: false,
    });
    if (!shot.result?.data) throw new Error(`渲染失败：${file}`);
    writeFileSync(`${root}/public/${file}`, Buffer.from(shot.result.data, "base64"));
    console.log(`rendered ${file} ${size}x${size}`);
  }
  console.log("ICONS OK");
} catch (error) {
  console.error("ICON RENDER FAILED:", error.message);
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
