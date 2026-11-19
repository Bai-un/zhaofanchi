import { Pin } from "lucide-react";
import type { Recipe } from "../types";
import { formatMinutes, totalMinutes } from "../lib/recipe";
import { routeHref } from "../lib/router";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const total = totalMinutes(recipe);
  return (
    <a className="card recipe-card" href={routeHref(`/recipe/${recipe.id}`)}>
      {recipe.isPinned ? <Pin size={14} className="pin-mark" fill="currentColor" /> : null}
      <div className="name">{recipe.name || "未命名菜谱"}</div>
      {recipe.description ? <div className="desc">{recipe.description}</div> : null}
      <div className="recipe-meta">
        <span>{total ? `共 ${formatMinutes(total)}` : "时长未填"}</span>
        <span>{recipe.ingredients.length} 种用料</span>
        <span>{recipe.steps.length} 个步骤</span>
        <span>{recipe.servings} 人份基准</span>
      </div>
      {recipe.tags.length ? (
        <div className="recipe-tags">
          {recipe.tags.map((tag) => (
            <span className="tag" key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </a>
  );
}
