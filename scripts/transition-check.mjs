import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://127.0.0.1:4173/";
const outDir = process.argv[2] || ".";
const stamp = Date.now();
const profile = `C:/Users/baima/AppData/Local/Temp/shiji-transition-${stamp}`;
const port = 9700 + Math.floor(Math.random() * 90);

setTimeout(() => {
  console.error("TRANSITION CHECK WATCHDOG: 超时退出");
  process.exit(2);
}, 45000).unref();

const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
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
    mobile: false,
  });
  await send("Page.navigate", { url: base });
  await wait(3200);

  const highlightGeometry = await evaluate(`(() => {
    const h = document.querySelector('.nav-highlight').getBoundingClientRect();
    const item = document.querySelector('.nav-item').getBoundingClientRect();
    const icon = document.querySelector('.nav-item svg').getBoundingClientRect();
    const label = document.querySelector('.nav-item span').getBoundingClientRect();
    return {
      widthRatio: h.width / item.width,
      heightRatio: h.height / item.height,
      dx: (h.left + h.width / 2) - (icon.left + icon.width / 2),
      wrapsIcon: h.top <= icon.top + 0.5 && h.bottom >= icon.bottom - 0.5,
      wrapsLabel: h.top <= label.top + 0.5 && h.bottom >= label.bottom - 0.5,
    };
  })()`);
  console.log("highlight geometry", JSON.stringify(highlightGeometry));
  if (highlightGeometry.widthRatio < 0.6 || highlightGeometry.widthRatio > 0.72) {
    throw new Error(`高亮宽度没有缩短三分之一：${highlightGeometry.widthRatio}`);
  }
  if (highlightGeometry.heightRatio < 0.95 || highlightGeometry.heightRatio > 1.05) {
    throw new Error(`高亮没有完整包住内容：${highlightGeometry.heightRatio}`);
  }
  if (!highlightGeometry.wrapsIcon || !highlightGeometry.wrapsLabel) {
    throw new Error("高亮没有完整包住图标和名称");
  }
  if (Math.abs(highlightGeometry.dx) > 1) {
    throw new Error(`图标没有居中：dx=${highlightGeometry.dx}`);
  }

  const iconsBefore = await evaluate(
    `[...document.querySelectorAll('.nav-item svg')].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; })`,
  );
  const widthBefore = await evaluate(`document.documentElement.clientWidth`);
  const bgBefore = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  const highlightBefore = await evaluate(
    `parseFloat(getComputedStyle(document.querySelector('.nav-highlight')).left)`,
  );
  await evaluate(`(() => {
    const link = [...document.querySelectorAll('.bottom-nav a')].find((el) => el.textContent.includes('计时'));
    link?.click();
  })()`);
  await wait(80);
  const highlightMid = await evaluate(
    `parseFloat(getComputedStyle(document.querySelector('.nav-highlight')).left)`,
  );
  const bgMid = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  const widthMid = await evaluate(`document.documentElement.clientWidth`);
  const iconsMid = await evaluate(
    `[...document.querySelectorAll('.nav-item svg')].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; })`,
  );
  const layerPresent = await evaluate(`Boolean(document.querySelector('.page-fade-layer'))`);
  const navVisible = await evaluate(`(() => {
    const nav = document.querySelector('.bottom-nav');
    if (!nav) return false;
    const style = getComputedStyle(nav);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.99;
  })()`);
  const durations = await evaluate(
    `document.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => a.effect?.getTiming().duration)`,
  );
  console.log("highlight left", highlightBefore, highlightMid);
  console.log("background", bgBefore, bgMid, "layer", layerPresent, "nav visible", navVisible);
  console.log("running durations", JSON.stringify(durations));
  if (!layerPresent) throw new Error("旧页面淡出层没有出现");
  if (!navVisible) throw new Error("切换过程中底栏消失了");
  if (bgBefore !== bgMid) throw new Error(`切换过程中背景色变了：${bgBefore} → ${bgMid}`);
  if (widthBefore !== widthMid) throw new Error(`切换过程中视口宽度变了：${widthBefore} → ${widthMid}`);
  const sameIcons = (a, b) =>
    a.length === b.length && a.every((point, index) =>
      Math.abs(point[0] - b[index][0]) < 0.5 && Math.abs(point[1] - b[index][1]) < 0.5);
  console.log("icons stable mid", sameIcons(iconsBefore, iconsMid), JSON.stringify(iconsMid));
  if (!sameIcons(iconsBefore, iconsMid)) throw new Error("切换过程中图标位置发生了位移");
  if (durations.filter((value) => value === 300).length < 2) {
    throw new Error("淡入淡出动画没有同时运行");
  }
  await screenshot("transition-mid.png");

  await wait(700);
  const highlightAfter = await evaluate(
    `parseFloat(getComputedStyle(document.querySelector('.nav-highlight')).left)`,
  );
  console.log("highlight after", highlightAfter);
  if (!(highlightMid > highlightBefore + 1 && highlightAfter > highlightMid + 1)) {
    throw new Error(`高亮没有滑动：${highlightBefore} → ${highlightMid} → ${highlightAfter}`);
  }
  const pageText = await evaluate(`document.body.innerText`);
  if (!pageText.includes("快速开始")) throw new Error("没有切换到计时页");
  const layerGone = await evaluate(`!document.querySelector('.page-fade-layer')`);
  console.log("fade layer removed", layerGone);
  if (!layerGone) throw new Error("淡出层没有清理");
  const widthAfter = await evaluate(`document.documentElement.clientWidth`);
  const iconsAfter = await evaluate(
    `[...document.querySelectorAll('.nav-item svg')].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; })`,
  );
  console.log("viewport width", widthBefore, widthAfter, "icons stable", sameIcons(iconsBefore, iconsAfter));
  if (widthBefore !== widthAfter) throw new Error(`切换后视口宽度变了：${widthBefore} → ${widthAfter}`);
  if (!sameIcons(iconsBefore, iconsAfter)) throw new Error("切换后图标位置发生了位移");

  // 反向：计时 → 菜谱，同样不能有位移
  await evaluate(`(() => {
    const link = [...document.querySelectorAll('.bottom-nav a')].find((el) => el.textContent.includes('菜谱'));
    link?.click();
  })()`);
  await wait(80);
  const iconsBackMid = await evaluate(
    `[...document.querySelectorAll('.nav-item svg')].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; })`,
  );
  if (!sameIcons(iconsBefore, iconsBackMid)) throw new Error("返回菜谱过程中图标位置发生了位移");
  await wait(700);
  const iconsBackAfter = await evaluate(
    `[...document.querySelectorAll('.nav-item svg')].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; })`,
  );
  const backText = await evaluate(`document.body.innerText`);
  const backHash = await evaluate(`location.hash`);
  console.log("back hash", backHash, "text", backText.slice(0, 60).replace(/\n/g, " | "));
  if (!sameIcons(iconsBefore, iconsBackAfter)) throw new Error("返回菜谱后图标位置发生了位移");
  if (!backHash.startsWith("#/") || backHash.startsWith("#/timer")) throw new Error("没有返回菜谱页");
  console.log("reverse navigation stable");

  await screenshot("transition-end.png");
  console.log("logs", JSON.stringify(logs));
  if (logs.length) throw new Error(`页面出现错误：${logs.join(" | ")}`);
  console.log("TRANSITION CHECK OK");
} catch (error) {
  console.error("TRANSITION CHECK FAILED:", error.message);
  console.error("logs", JSON.stringify(logs));
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
