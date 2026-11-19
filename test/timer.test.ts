import test from "node:test";
import assert from "node:assert/strict";
import {
  addTimerSeconds,
  createTimer,
  pauseTimer,
  remainingSec,
  resumeTimer,
  tickTimer,
} from "../src/lib/timer-core.ts";

const NOW = 1_700_000_000_000;

test("创建计时器并按真实时间计算剩余", () => {
  const timer = createTimer({ label: "煮饭", seconds: 1800, kind: "quick" }, NOW);
  assert.equal(timer.state, "running");
  assert.equal(remainingSec(timer, NOW), 1800);
  assert.equal(remainingSec(timer, NOW + 30_000), 1770);
  assert.equal(remainingSec(timer, NOW + 1_800_000), 0);
});

test("暂停和恢复不丢失时间", () => {
  const timer = createTimer({ label: "腌肉", seconds: 1200, kind: "prep" }, NOW);
  const paused = pauseTimer(timer, NOW + 60_000);
  assert.equal(paused.state, "paused");
  assert.equal(remainingSec(paused, NOW + 600_000), 1140);
  const resumed = resumeTimer(paused, NOW + 600_000);
  assert.equal(resumed.state, "running");
  assert.equal(remainingSec(resumed, NOW + 600_000), 1140);
});

test("加时对运行中和已结束的计时器都生效", () => {
  const timer = createTimer({ label: "炖肉", seconds: 600, kind: "step" }, NOW);
  const added = addTimerSeconds(timer, 300, NOW + 10_000);
  assert.equal(remainingSec(added, NOW + 10_000), 890);
  const finished = tickTimer(added, NOW + 1_000_000).timer;
  assert.equal(finished.state, "done");
  const revived = addTimerSeconds(finished, 60, NOW + 1_000_000);
  assert.equal(revived.state, "running");
  assert.equal(remainingSec(revived, NOW + 1_000_000), 60);
});

test("到点会标记完成", () => {
  const timer = createTimer({ label: "蒸蛋", seconds: 60, kind: "step" }, NOW);
  const result = tickTimer(timer, NOW + 60_000);
  assert.equal(result.finished, true);
  assert.equal(result.timer.state, "done");
});
