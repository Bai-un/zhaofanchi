import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Play, Plus, Timer as TimerIcon } from "lucide-react";
import type { Recipe } from "../types";
import { getRecipe, saveRecipe } from "../lib/store";
import { computeRatio, ratioLabel } from "../lib/scale";
import { formatClock, formatDuration, formatMinutes } from "../lib/time";
import { totalMinutes } from "../lib/recipe";
import { remainingSec } from "../lib/timer-core";
import type { ScaleMode } from "../components/ScaleBar";
import { newId } from "../lib/uuid";
import { navigate } from "../lib/router";
import { pushToast } from "../lib/notify";
import { useWakeLock } from "../lib/wake-lock";
import {
  addSecondsById,
  cancelTimerById,
  ensureTicker,
  pauseTimerById,
  resumeTimerById,
  startTimer,
  useTimerSnapshot,
} from "../lib/timer-store";
import { GroupedIngredients } from "../components/GroupedIngredients";
import { TimerBar } from "../components/TimerBar";
import { Sheet } from "../components/Sheet";

export function CookPage({ id, query }: { id: string; query: URLSearchParams }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<{ mode: ScaleMode; value: number }>({
    mode: "servings",
    value: 2,
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [completedPrep, setCompletedPrep] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<"ingredients" | "finish" | "addTimer" | null>(null);
  const [noteText, setNoteText] = useState("");
  const [customMinutes, setCustomMinutes] = useState("15");
  const [customLabel, setCustomLabel] = useState("");
  const startAt = useRef(Date.now());
  const queryRef = useRef(query);
  const timers = useTimerSnapshot();

  useWakeLock(true);

  useEffect(() => {
    ensureTicker();
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRecipe(id)
      .then((found) => {
        if (!alive) return;
        if (!found) {
          pushToast({ title: "菜谱不存在", tone: "error" });
          navigate("/");
          return;
        }
        setRecipe(found);
        const servings = Number(queryRef.current.get("servings"));
        const base = Number(queryRef.current.get("base"));
        if (Number.isFinite(servings) && servings > 0) {
          setTarget({ mode: "servings", value: servings });
        } else if (Number.isFinite(base) && base > 0) {
          setTarget({ mode: "base", value: base });
        } else {
          setTarget({ mode: "servings", value: found.servings || 2 });
        }
        setCurrentStep(0);
        setCompletedSteps(new Set());
        setCompletedPrep(new Set());
        startAt.current = Date.now();
      })
      .catch(() => {
        if (alive) pushToast({ title: "读取菜谱失败", tone: "error" });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const ratio = useMemo(() => {
    if (!recipe) return 1;
    return computeRatio(recipe, { mode: target.mode, value: target.value });
  }, [recipe, target]);

  if (loading) {
    return (
      <div className="page plain">
        <div className="empty">
          <span className="empty-icon">🍳</span>
          <div className="empty-title">正在准备灶台…</div>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="page plain">
        <div className="empty">
          <span className="empty-icon">🥣</span>
          <div className="empty-title">没有找到这道菜</div>
          <button className="btn btn-soft" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
            回到菜谱
          </button>
        </div>
      </div>
    );
  }

  const targetLabel =
    target.mode === "servings"
      ? `${target.value} 人份`
      : `主料 ${target.value}${recipe.base.unit || "g"}`;

  const timerFor = (refId: string) =>
    timers.timers.find((timer) => timer.refId === refId && timer.state !== "done");

  const startRefTimer = (refId: string, label: string, seconds: number, kind: "prep" | "step") => {
    if (!seconds || seconds <= 0) {
      pushToast({ title: "这一步还没有设置时长", body: "可以先用「加计时」临时定时", tone: "info" });
      return;
    }
    const existing = timers.timers.find((timer) => timer.refId === refId && timer.state !== "done");
    if (existing) {
      pushToast({ title: "计时已经在跑", body: existing.label, tone: "info" });
      return;
    }
    timers.timers
      .filter((timer) => timer.refId === refId && timer.state === "done")
      .forEach((timer) => cancelTimerById(timer.id));
    startTimer({ label, seconds, kind, recipeId: recipe.id, refId });
    pushToast({ title: "计时开始", body: `${label} · ${formatDuration(seconds)}`, tone: "success" });
  };

  const togglePrep = (itemId: string) => {
    setCompletedPrep((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        timers.timers
          .filter((timer) => timer.refId === `prep:${itemId}` && timer.state !== "done")
          .forEach((timer) => cancelTimerById(timer.id));
      }
      return next;
    });
  };

  const startStep = (index: number) => {
    setCurrentStep(index);
    const step = recipe.steps[index];
    if (!step) return;
    if (step.durationSec) {
      startRefTimer(`step:${step.id}`, `第 ${index + 1} 步 ${step.timerTag || "计时"}`, step.durationSec, "step");
    }
    window.setTimeout(() => {
      document.getElementById(`step-${step.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  };

  const completeStep = (index: number) => {
    const step = recipe.steps[index];
    if (!step) return;
    const done = new Set(completedSteps);
    done.add(step.id);
    setCompletedSteps(done);
    timers.timers
      .filter((timer) => timer.refId === `step:${step.id}` && timer.state !== "done")
      .forEach((timer) => cancelTimerById(timer.id));
    const nextIndex = recipe.steps.findIndex((item, i) => i > index && !done.has(item.id));
    const fallback = recipe.steps.findIndex((item) => !done.has(item.id));
    const next = nextIndex >= 0 ? nextIndex : fallback;
    if (next >= 0) {
      setCurrentStep(next);
      window.setTimeout(() => {
        const nextStep = recipe.steps[next];
        document.getElementById(`step-${nextStep.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 60);
    } else {
      pushToast({ title: "所有步骤都完成了", body: "点底部「完成做菜」收尾", tone: "success" });
    }
  };

  const undoStep = (stepId: string) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.delete(stepId);
      return next;
    });
  };

  const finish = async () => {
    let next = recipe;
    if (noteText.trim()) {
      next = {
        ...recipe,
        notes: [{ id: newId(), content: noteText.trim(), createdAt: Date.now() }, ...recipe.notes],
      };
      try {
        await saveRecipe(next);
      } catch {
        pushToast({ title: "笔记保存失败，但做菜记录还在本地", tone: "error" });
      }
    }
    setSheet(null);
    navigate(`/recipe/${recipe.id}`);
  };

  const startCustom = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      pushToast({ title: "请输入分钟数", tone: "error" });
      return;
    }
    startTimer({
      label: customLabel.trim() || "临时计时",
      seconds: Math.round(minutes * 60),
      kind: "quick",
      recipeId: recipe.id,
    });
    setCustomLabel("");
    setCustomMinutes("15");
    setSheet(null);
    pushToast({ title: "临时计时开始", tone: "success" });
  };

  const elapsed = Math.max(1, Math.floor((Date.now() - startAt.current) / 1000));
  const allStepsDone = recipe.steps.length > 0 && completedSteps.size >= recipe.steps.length;

  return (
    <div className="page plain">
      <div className="cook-header">
        <div className="cook-title-row">
          <button className="back-btn" aria-label="返回菜谱" onClick={() => navigate(`/recipe/${recipe.id}`)}>
            <ChevronLeft size={20} />
          </button>
          <div className="cook-title">{recipe.name}</div>
          <button className="btn btn-sm btn-soft" onClick={() => setSheet("ingredients")}>
            本次用量
          </button>
        </div>
        <div className="cook-meta">
          <span className="badge">{targetLabel}</span>
          <span>{ratioLabel(ratio)}</span>
          {totalMinutes(recipe) ? <span>{formatMinutes(totalMinutes(recipe))}</span> : null}
          <span>{completedSteps.size}/{recipe.steps.length} 步</span>
          {allStepsDone ? <span className="accent">全部完成</span> : null}
        </div>
        <TimerBar
          timers={timers.timers}
          now={timers.now}
          onAdd={addSecondsById}
          onPause={pauseTimerById}
          onResume={resumeTimerById}
          onCancel={cancelTimerById}
        />
        <button className="btn btn-sm btn-ghost" onClick={() => setSheet("addTimer")} style={{ marginTop: 4 }}>
          <TimerIcon size={14} /> 加一个临时计时
        </button>
      </div>

      <div className="timeline">
        {recipe.prepItems.length ? (
          <>
            <div className="timeline-section">备菜</div>
            {recipe.prepItems.map((item) => {
              const done = completedPrep.has(item.id);
              const active = timerFor(`prep:${item.id}`);
              return (
                <div className="tl-item" key={item.id}>
                  <div className="tl-card">
                    <div className="check-row" style={{ padding: 0 }}>
                      <button
                        className={`check ${done ? "on" : ""}`}
                        aria-label={done ? "取消完成" : "标记完成"}
                        onClick={() => togglePrep(item.id)}
                      >
                        {done ? <Check size={15} /> : null}
                      </button>
                      <div className="check-body">
                        <div className={`check-text ${done ? "done" : ""}`}>{item.content}</div>
                        {item.durationSec ? (
                          <div className="step-dur">
                            {item.timerTag ? `${item.timerTag} · ` : ""}
                            {formatDuration(item.durationSec)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {item.durationSec && !done ? (
                      <div className="tl-actions">
                        {active ? (
                          <>
                            <span className="ratio-badge">{formatClock(remainingSec(active, timers.now))}</span>
                            <button className="btn btn-sm" onClick={() => addSecondsById(active.id, 60)}>+1分</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => addSecondsById(active.id, 300)}>+5分</button>
                          </>
                        ) : (
                          <button
                            className="btn btn-sm btn-soft"
                            onClick={() =>
                              startRefTimer(
                                `prep:${item.id}`,
                                `备菜 ${item.timerTag || item.content}`.slice(0, 16),
                                item.durationSec,
                                "prep",
                              )
                            }
                          >
                            <Play size={14} /> 开始计时
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        <div className="timeline-section">烹饪步骤</div>
        {recipe.steps.map((step, index) => {
          const done = completedSteps.has(step.id);
          const current = index === currentStep && !done;
          const active = timerFor(`step:${step.id}`);
          return (
            <div
              className={`tl-item ${current ? "current" : ""} ${done ? "done" : ""}`}
              id={`step-${step.id}`}
              key={step.id}
            >
              <div className="tl-card">
                <div className="tl-top" onClick={() => setCurrentStep(index)}>
                  <span className="tl-index">第 {index + 1} 步</span>
                  {step.timerTag ? <span className="badge">{step.timerTag}</span> : null}
                  {step.durationSec ? (
                    <span className="step-dur" style={{ marginTop: 0 }}>{formatDuration(step.durationSec)}</span>
                  ) : null}
                  {done ? <span className="badge" style={{ marginLeft: "auto" }}>已完成</span> : null}
                </div>
                <div className="tl-content" onClick={() => setCurrentStep(index)}>
                  {step.content}
                </div>
                <div className="tl-actions">
                  {done ? (
                    <button className="btn btn-sm btn-ghost" onClick={() => undoStep(step.id)}>
                      撤销完成
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => startStep(index)}>
                        <Play size={14} /> 开始这步
                      </button>
                      <button className="btn btn-sm" onClick={() => completeStep(index)}>
                        <Check size={14} /> 完成这步
                      </button>
                      {active ? (
                        <>
                          <span className="ratio-badge">{formatClock(remainingSec(active, timers.now))}</span>
                          <button className="btn btn-sm btn-ghost" onClick={() => addSecondsById(active.id, 60)}>+1分</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => addSecondsById(active.id, 300)}>+5分</button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
                {current && !step.durationSec ? (
                  <div className="tl-hint">这一步没设时长；可以用上面的「加一个临时计时」。</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="section">
        <button className="btn btn-primary btn-lg btn-block" onClick={() => setSheet("finish")}>
          <Check size={18} /> 完成做菜
        </button>
        <div className="tiny muted center" style={{ marginTop: 10, lineHeight: 1.7 }}>
          切后台或锁屏时计时按真实时间继续，到点提醒可能被系统延迟；关闭页面后计时结束。
        </div>
      </div>

      <Sheet open={sheet === "ingredients"} title="本次用量（已换算）" onClose={() => setSheet(null)}>
        <div className="tiny muted" style={{ marginBottom: 10 }}>
          {targetLabel} · {ratioLabel(ratio)}
        </div>
        <GroupedIngredients recipe={recipe} ratio={ratio} showOrigin={false} />
      </Sheet>

      <Sheet open={sheet === "addTimer"} title="加一个临时计时" onClose={() => setSheet(null)}>
        <div className="field">
          <label className="label" htmlFor="custom-label">名称（选填）</label>
          <input
            id="custom-label"
            className="input"
            value={customLabel}
            placeholder="例如：收汁、烤箱预热"
            onChange={(event) => setCustomLabel(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="custom-minutes">分钟</label>
          <input
            id="custom-minutes"
            className="input"
            type="number"
            inputMode="decimal"
            min={0.5}
            step={0.5}
            value={customMinutes}
            onChange={(event) => setCustomMinutes(event.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" onClick={startCustom}>
          <Plus size={16} /> 开始计时
        </button>
      </Sheet>

      <Sheet open={sheet === "finish"} title="做菜完成" onClose={() => setSheet(null)}>
        <div className="grid-2">
          <div className="card" style={{ boxShadow: "none", background: "var(--bg)" }}>
            <div className="tiny muted">用时</div>
            <div className="stat-value">{formatClock(elapsed)}</div>
          </div>
          <div className="card" style={{ boxShadow: "none", background: "var(--bg)" }}>
            <div className="tiny muted">完成步骤</div>
            <div className="stat-value">{completedSteps.size}/{recipe.steps.length}</div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label className="label" htmlFor="finish-note">记一笔这次的调整（选填）</label>
          <textarea
            id="finish-note"
            className="textarea"
            value={noteText}
            placeholder="例如：这次水多了，下次少 20ml"
            onChange={(event) => setNoteText(event.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-lg btn-block" onClick={finish}>
          保存并回到菜谱
        </button>
        <div className="tiny muted center" style={{ marginTop: 8 }}>
          运行中的计时器会保留在「计时」页，可稍后关闭。
        </div>
      </Sheet>
    </div>
  );
}
