import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const base = "http://127.0.0.1:5173/";
const outDir = process.argv[2] || ".";
const port = 9500 + Math.floor(Math.random() * 200);
const profile = `C:/Users/baima/AppData/Local/Temp/shiji-e2e-${Date.now()}`;
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

async function wait(ms) {
  await delay(ms);
}

async function screenshot(name) {
  const response = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  if (!response.result?.data) throw new Error(`screenshot failed: ${name}`);
  writeFileSync(`${outDir}/${name}`, Buffer.from(response.result.data, "base64"));
  console.log(`screenshot ${name}`);
}

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

async function setInput(selector, value) {
  const ok = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`找不到输入框：${selector}`);
}

async function goHash(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await wait(900);
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
  await screenshot("e2e-01-home.png");

  const cards = await evaluate(`[...document.querySelectorAll('a.recipe-card')].map((a) => ({
    href: a.getAttribute('href'),
    name: a.querySelector('.name')?.textContent || ''
  }))`);
  console.log("cards", JSON.stringify(cards));
  if (!cards.length) throw new Error("示例菜谱没有出现");
  const rice = cards.find((card) => card.name.includes("白米饭")) || cards[0];
  await goHash(rice.href);
  await screenshot("e2e-02-detail.png");

  const before = await evaluate(`[...document.querySelectorAll('.ing-row')].map((row) => row.innerText.replace(/\\n/g, ' '))`);
  console.log("ingredients before", JSON.stringify(before));

  await clickText("按主料", true);
  await wait(300);
  await setInput('input[aria-label="目标主料量"]', "300");
  await wait(500);
  const after = await evaluate(`[...document.querySelectorAll('.ing-row')].map((row) => row.innerText.replace(/\\n/g, ' '))`);
  console.log("ingredients after", JSON.stringify(after));
  const joined = after.join("|");
  if (!joined.includes("300g") || !joined.includes("450ml")) {
    throw new Error(`主料缩放没有生效：${joined}`);
  }
  await screenshot("e2e-03-scaled.png");

  await clickText("开始做菜", true);
  await wait(1000);
  await screenshot("e2e-04-cook.png");

  await clickText("开始这步", true);
  await wait(1200);
  const timerCount = await evaluate(`document.querySelectorAll('.timer-pill').length`);
  console.log("timer count", timerCount);
  if (timerCount < 1) throw new Error("步骤计时器没有出现");
  await screenshot("e2e-05-timer.png");

  await clickText("完成这步", true);
  await wait(600);
  const doneCount = await evaluate(`document.querySelectorAll('.tl-item.done').length`);
  console.log("done count", doneCount);
  if (doneCount < 1) throw new Error("完成这步没有生效");

  await clickText("本次用量", true);
  await wait(500);
  await screenshot("e2e-06-amount-sheet.png");
  await evaluate(`document.querySelector('.overlay .icon-btn')?.click()`);
  await wait(300);

  await goHash("/import");
  await wait(600);
  await screenshot("e2e-07-import.png");
  await setInput("textarea", `番茄炒蛋\n2人份\n食材：\n番茄 2个\n鸡蛋 3个\n盐 2g\n做法：\n1. 番茄切块\n2. 鸡蛋打散\n3. 炒5分钟`);
  await clickText("解析文字", true);
  await wait(800);
  await screenshot("e2e-08-import-preview.png");
  const preview = await evaluate(`document.body.innerText`);
  if (!preview.includes("解析结果") || !preview.includes("3")) {
    throw new Error("粘贴解析结果没有出现");
  }

  await clickText("去编辑并保存", true);
  await wait(1200);
  await screenshot("e2e-09-editor.png");
  const nameValue = await evaluate(`document.querySelector('#recipe-name')?.value || ''`);
  console.log("editor name", nameValue);
  await clickText("保存菜谱", true);
  await wait(1400);
  const hash = await evaluate(`location.hash`);
  console.log("after save hash", hash);
  if (!hash.startsWith("#/recipe/")) throw new Error("保存后没有回到菜谱详情");
  await screenshot("e2e-10-saved.png");

  await goHash("/settings");
  await wait(700);
  await clickText("深色", true);
  await wait(500);
  await screenshot("e2e-11-dark-settings.png");
  await goHash("/");
  await wait(700);
  await screenshot("e2e-12-dark-home.png");

  console.log("logs", JSON.stringify(logs));
  if (logs.length) throw new Error(`页面出现错误：${logs.join(" | ")}`);
  console.log("E2E OK");
} catch (error) {
  console.error("E2E FAILED:", error.message);
  console.error("logs", JSON.stringify(logs));
  process.exitCode = 1;
} finally {
  ws.close();
  proc.kill();
}
