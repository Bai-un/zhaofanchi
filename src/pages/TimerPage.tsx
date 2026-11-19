import { useEffect, useState } from "react";
import { Pause, Play, Plus, Timer as TimerIcon, Trash2, X } from "lucide-react";
import type { TimerPreset } from "../lib/timer-core";
import { loadPresets, remainingSec, savePresets, timerProgress } from "../lib/timer-core";
import { formatClock } from "../lib/time";
import {
  addSecondsById,
  cancelTimerById,
  ensureTicker,
  pauseTimerById,
  resumeTimerById,
  startTimer,
  useTimerSnapshot,
} from "../lib/timer-store";
import { pushToast } from "../lib/notify";
import { useWakeLock } from "../lib/wake-lock";

const KIND_LABEL = { prep: "备菜", step: "步骤", quick: "快捷" } as const;

export function TimerPage() {
  const [presets, setPresets] = useState<TimerPreset[]>(() => loadPresets());
  const [label, setLabel] = useState("");
  const [minutes, setMinutes] = useState("15");
  const [presetLabel, setPresetLabel] = useState("");
  const [presetMinutes, setPresetMinutes] = useState("20");
  const timers = useTimerSnapshot();

  useEffect(() => {
    ensureTicker();
  }, []);

  useWakeLock(timers.timers.some((timer) => timer.state === "running"));

  const persist = (next: TimerPreset[]) => {
    setPresets(next);
    savePresets(next);
  };

  const startCustom = () => {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) {
      pushToast({ title: "请输入分钟数", tone: "error" });
      return;
    }
    startTimer({
      label: label.trim() || "临时计时",
      seconds: Math.round(value * 60),
      kind: "quick",
    });
    setLabel("");
    pushToast({ title: "计时开始", tone: "success" });
  };

  const startPreset = (preset: TimerPreset) => {
    startTimer({ label: preset.label, seconds: preset.seconds, kind: "quick" });
    pushToast({ title: `${preset.label} 计时开始`, body: `${Math.round(preset.seconds / 60)} 分钟`, tone: "success" });
  };

  const addPreset = () => {
    const name = presetLabel.trim();
    const value = Number(presetMinutes);
    if (!name) {
      pushToast({ title: "给预设起个名字", tone: "error" });
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      pushToast({ title: "预设时长要大于 0", tone: "error" });
      return;
    }
    const next = [
      ...presets,
      { id: `preset-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, label: name, seconds: Math.round(value * 60) },
    ];
    persist(next);
    setPresetLabel("");
    setPresetMinutes("20");
    pushToast({ title: "预设已添加", tone: "success" });
  };

  return (
    <>
      <div className="page">
        <div className="brand-row">
          <div>
            <div className="brand-title">计时</div>
            <div className="brand-sub">煮饭、炖肉、临时加时，都在这里</div>
          </div>
          <div className="top-actions">
            <span className="ratio-badge">
              {timers.timers.filter((timer) => timer.state === "running").length} 个运行中
            </span>
          </div>
        </div>

        {timers.timers.length ? (
          <div>
            {timers.timers.map((timer) => {
              const remaining = remainingSec(timer, timers.now);
              const progress = timerProgress(timer, timers.now);
              const done = timer.state === "done";
              return (
                <div className="card section" key={timer.id}>
                  <div className="hstack" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="list-title">{timer.label}</div>
                      <div className="list-sub">
                        {KIND_LABEL[timer.kind]} · {done ? "已结束" : timer.state === "paused" ? "已暂停" : "计时中"}
                      </div>
                    </div>
                    <div className="timer-clock" style={{ fontSize: "calc(26px * var(--site-type))" }}>
                      {done ? "00:00" : formatClock(remaining)}
                    </div>
                  </div>
                  <div className="progress-track">
                    <div className={`progress-fill ${done ? "done" : ""}`} style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className="tl-actions">
                    {!done ? (
                      <>
                        <button className="btn btn-sm" onClick={() => addSecondsById(timer.id, 60)}>+1分</button>
                        <button className="btn btn-sm" onClick={() => addSecondsById(timer.id, 300)}>+5分</button>
                        {timer.state === "paused" ? (
                          <button className="btn btn-sm btn-soft" onClick={() => resumeTimerById(timer.id)}>
                            <Play size={14} /> 继续
                          </button>
                        ) : (
                          <button className="btn btn-sm" onClick={() => pauseTimerById(timer.id)}>
                            <Pause size={14} /> 暂停
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => cancelTimerById(timer.id)}>
                          <X size={14} /> 取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-soft" onClick={() => addSecondsById(timer.id, 60)}>
                          <Plus size={14} /> 再来 1 分钟
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => cancelTimerById(timer.id)}>
                          关闭
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ paddingTop: 26 }}>
            <span className="empty-icon">⏱️</span>
            <div className="empty-title">现在没有计时</div>
            <div className="small">选一个预设，或自己定分钟数</div>
          </div>
        )}

        <div className="card section">
          <div className="section-head">
            <div className="section-title">快速开始</div>
            <span className="section-note">到点会响铃、震动并提示</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="timer-label">名称（选填）</label>
            <input
              id="timer-label"
              className="input"
              value={label}
              placeholder="例如：煮饭、烤箱预热"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="timer-minutes">分钟</label>
            <div className="row">
              <input
                id="timer-minutes"
                className="input"
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
              <button className="btn btn-primary" onClick={startCustom}>
                <TimerIcon size={16} /> 开始
              </button>
            </div>
          </div>
        </div>

        <div className="card section">
          <div className="section-head">
            <div className="section-title">我的预设</div>
            <span className="section-note">{presets.length} 个</span>
          </div>
          {presets.map((preset) => (
            <div className="list-row" key={preset.id}>
              <div className="list-main">
                <div className="list-title">{preset.label}</div>
                <div className="list-sub">{Math.round(preset.seconds / 60)} 分钟</div>
              </div>
              <button className="btn btn-sm btn-soft" onClick={() => startPreset(preset)}>
                <Play size={13} /> 开始
              </button>
              <button
                className="btn btn-ghost btn-round"
                aria-label={`删除预设 ${preset.label}`}
                onClick={() => persist(presets.filter((item) => item.id !== preset.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="divider" />
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor="preset-label">新预设名称</label>
              <input
                id="preset-label"
                className="input"
                value={presetLabel}
                placeholder="例如：蒸蛋"
                onChange={(event) => setPresetLabel(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="preset-minutes">分钟</label>
              <input
                id="preset-minutes"
                className="input"
                type="number"
                min={1}
                value={presetMinutes}
                onChange={(event) => setPresetMinutes(event.target.value)}
              />
            </div>
          </div>
          <button className="btn btn-sm btn-soft" onClick={addPreset}>
            <Plus size={14} /> 添加预设
          </button>
        </div>
      </div>
    </>
  );
}
