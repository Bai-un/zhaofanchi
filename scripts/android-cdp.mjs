import { setTimeout as delay } from "node:timers/promises";

const expression = process.argv[2];
if (!expression) {
  console.error("usage: node android-cdp.mjs \"<js expression>\"");
  process.exit(1);
}

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((item) => item.type === "page");
if (!page) {
  console.error("no page target");
  process.exit(1);
}

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

await send("Runtime.enable");
const response = await send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true,
});
if (response.result?.exceptionDetails) {
  console.error("exception:", response.result.exceptionDetails.text);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(response.result?.result?.value ?? null, null, 2));
}
ws.close();
await delay(50);
process.exit(process.exitCode || 0);
