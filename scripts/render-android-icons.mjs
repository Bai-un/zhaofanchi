import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const root = process.argv[2] || ".";
const resDir = `${root}/android-app/app/src/main/res`;
const stamp = Date.now();
const profile = `C:/Users/baima/AppData/Local/Temp/shiji-android-icons-${stamp}`;
const port = 9380 + Math.floor(Math.random() * 40);

setTimeout(() => {
  console.error("ANDROID ICON RENDER WATCHDOG: 超时退出");
  process.exit(2);
}, 60000).unref();

const legacySvg = readFileSync(`${root}/public/icon.svg`, "utf8");
const foregroundSvg = readFileSync(`${root}/android-app/icon-foreground.svg`, "utf8");

function htmlFor(svg) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#B85C43}
svg{display:block;width:100vw;height:100vh}
</style></head><body>${svg}</body></html>`;
}

const legacyUrl = `data:text/html;base64,${Buffer.from(htmlFor(legacySvg)).toString("base64")}`;
const foregroundUrl = `data:text/html;base64,${Buffer.from(htmlFor(foregroundSvg)).toString("base64")}`;

const targets = [
  ["mipmap-mdpi", 48, 108],
  ["mipmap-hdpi", 72, 162],
  ["mipmap-xhdpi", 96, 216],
  ["mipmap-xxhdpi", 144, 324],
  ["mipmap-xxxhdpi", 192, 432],
];

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

async function render(url, size, path) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: size,
    height: size,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await delay(500);
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
    captureBeyondViewport: false,
  });
  if (!shot.result?.data) throw new Error(`渲染失败：${path}`);
  writeFileSync(path, Buffer.from(shot.result.data, "base64"));
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  for (const [dir, legacySize, foregroundSize] of targets) {
    mkdirSync(`${resDir}/${dir}`, { recursive: true });
    await render(legacyUrl, legacySize, `${resDir}/${dir}/ic_launcher.png`);
    await render(foregroundUrl, foregroundSize, `${resDir}/${dir}/ic_launcher_foreground.png`);
    console.log(`rendered ${dir} ${legacySize}/${foregroundSize}`);
  }
  console.log("ANDROID ICONS OK");
} catch (error) {
  console.error("ANDROID ICON RENDER FAILED:", error.message);
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
