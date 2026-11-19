import type { Recipe } from "../types";
import { GROUP_META } from "../types";
import { groupIngredients } from "../lib/recipe";
import { formatPortion, scaledAmount } from "../lib/scale";

export function GroupedIngredients({
  recipe,
  ratio,
  showOrigin = true,
}: {
  recipe: Recipe;
  ratio: number;
  showOrigin?: boolean;
}) {
  const groups = groupIngredients(recipe);
  if (!groups.length) {
    return <div className="muted small">还没有用料，去编辑页添加。</div>;
  }
  return (
    <>
      {groups.map(({ group, items }) => (
        <div className="ing-group" key={group}>
          <div className="ing-group-head">{GROUP_META[group].label}</div>
          {items.map((item) => {
            const original =
              item.amountText || (item.qty != null ? formatPortion(item.qty, item.unit) : "");
            const scaled = scaledAmount(item, ratio);
            const changed =
              showOrigin && ratio !== 1 && item.qty != null && item.scaleRule !== "fixed" && original && original !== scaled;
            return (
              <div className="ing-row" key={item.id}>
                <span className="ing-name">
                  {item.name}
                  {item.isBase ? <span className="badge base" style={{ marginLeft: 6 }}>基准</span> : null}
                  {item.scaleRule === "fixed" ? (
                    <span className="badge fixed" style={{ marginLeft: 6 }}>不缩放</span>
                  ) : null}
                </span>
                <span className="ing-amount">
                  {scaled}
                  {changed ? <span className="ing-origin">原 {original}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
