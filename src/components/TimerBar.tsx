import { Pause, Play, X } from "lucide-react";
import type { TimerRecord } from "../lib/timer-core";
import { formatClock } from "../lib/time";
import { remainingSec } from "../lib/timer-core";

export function TimerBar({
  timers,
  now,
  onAdd,
  onPause,
  onResume,
  onCancel,
}: {
  timers: TimerRecord[];
  now: number;
  onAdd: (id: string, seconds: number) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (!timers.length) return null;
  return (
    <div className="timer-bar" aria-label="运行中的计时器">
      {timers.map((timer) => {
        const remaining = remainingSec(timer, now);
        const done = timer.state === "done";
        return (
          <div className={`timer-pill ${timer.state}`} key={timer.id}>
            <div style={{ minWidth: 0 }}>
              <div className="timer-label">{timer.label}</div>
              <div className="timer-clock">{done ? "已结束" : formatClock(remaining)}</div>
            </div>
            {!done ? (
              <>
                <button className="timer-mini" onClick={() => onAdd(timer.id, 60)} aria-label="加 1 分钟">
                  +1
                </button>
                <button className="timer-mini" onClick={() => onAdd(timer.id, 300)} aria-label="加 5 分钟">
                  +5
                </button>
                {timer.state === "paused" ? (
                  <button className="timer-mini" onClick={() => onResume(timer.id)} aria-label="继续计时">
                    <Play size={12} />
                  </button>
                ) : (
                  <button className="timer-mini" onClick={() => onPause(timer.id)} aria-label="暂停计时">
                    <Pause size={12} />
                  </button>
                )}
              </>
            ) : (
              <button className="timer-mini" onClick={() => onAdd(timer.id, 60)} aria-label="再来 1 分钟">
                +1
              </button>
            )}
            <button className="timer-mini" onClick={() => onCancel(timer.id)} aria-label="关闭计时器">
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
