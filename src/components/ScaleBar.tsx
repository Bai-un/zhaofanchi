import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Recipe } from "../types";
import { findBaseIngredient, ratioLabel } from "../lib/scale";

export type ScaleMode = "servings" | "base";

export function ScaleBar({
  recipe,
  mode,
  onModeChange,
  servings,
  onServingsChange,
  baseValue,
  onBaseValueChange,
  ratio,
}: {
  recipe: Recipe;
  mode: ScaleMode;
  onModeChange: (mode: ScaleMode) => void;
  servings: number;
  onServingsChange: (value: number) => void;
  baseValue: number | null;
  onBaseValueChange: (value: number | null) => void;
  ratio: number;
}) {
  const baseIngredient = findBaseIngredient(recipe);
  const baseUnit = recipe.base.unit || baseIngredient?.unit || "g";
  const hasBase = Boolean(recipe.base.qty && baseIngredient);

  const reset = () => {
    onServingsChange(recipe.servings || 2);
    onBaseValueChange(recipe.base.qty ?? null);
  };

  return (
    <div className="card section" aria-label="份量换算">
      <div className="section-head">
        <div className="section-title">份量换算</div>
        <span className="ratio-badge">{ratioLabel(ratio)}</span>
      </div>
      <div className="segmented" role="tablist" aria-label="换算方式">
        <button
          type="button"
          className={mode === "servings" ? "active" : ""}
          onClick={() => onModeChange("servings")}
        >
          按人份
        </button>
        <button
          type="button"
          className={mode === "base" ? "active" : ""}
          onClick={() => onModeChange("base")}
        >
          按主料
        </button>
      </div>

      {mode === "servings" ? (
        <div className="scale-row">
          <div className="stepper">
            <button
              type="button"
              aria-label="减少人份"
              onClick={() => onServingsChange(Math.max(1, servings - 1))}
            >
              <Minus size={18} />
            </button>
            <div className="value">{servings} 人份</div>
            <button
              type="button"
              aria-label="增加人份"
              onClick={() => onServingsChange(Math.min(20, servings + 1))}
            >
              <Plus size={18} />
            </button>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
            <RotateCcw size={14} /> 恢复
          </button>
        </div>
      ) : (
        <div className="scale-row">
          {hasBase ? (
            <>
              <span className="small muted">{baseIngredient?.name}</span>
              <input
                className="input mini-input"
                type="number"
                inputMode="decimal"
                min={1}
                step={1}
                value={baseValue ?? ""}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  onBaseValueChange(Number.isFinite(value as number) ? (value as number) : null);
                }}
                aria-label="目标主料量"
              />
              <span className="small muted">{baseUnit}</span>
              <span className="tiny muted">
                （基准 {recipe.base.qty}{baseUnit}）
              </span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={reset}>
                <RotateCcw size={14} /> 恢复
              </button>
            </>
          ) : (
            <div className="banner warn" style={{ width: "100%" }}>
              还没有主料基准。去编辑页给某个主料填上数值，并点「设为主料」。
            </div>
          )}
        </div>
      )}
      <div className="scale-hint">
        主料和水、调料会一起等比变化；标了「不缩放」的用量保持不变。
      </div>
    </div>
  );
}
