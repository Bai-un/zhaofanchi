import type { IngredientGroup, ParsedRecipe } from "../types.ts";
import { parseAmount } from "./scale.ts";

type Section = "meta" | "ingredients" | "prep" | "steps" | "tips";

interface ParsedIngredient {
  name: string;
  group: IngredientGroup;
  groupHint?: IngredientGroup;
  qty: number | null;
  unit: string;
  amountText: string;
  scaleRule: "linear" | "fixed";
}

const SECTION_HEADERS: { re: RegExp; section: Section }[] = [
  { re: /^(?:备菜|准备|预处理|事先准备|准备工作)\s*[：:]?\s*/i, section: "prep" },
  { re: /^(?:用料|食材|材料|所需材料|配料|用料清单|食材清单)\s*[：:]?\s*/i, section: "ingredients" },
  {
    re: /^(?:做法|步骤|制作方法|制作步骤|烹饪步骤|做法步骤|烹饪方法|烹饪过程)\s*[：:]?\s*/i,
    section: "steps",
  },
  { re: /^(?:小贴士|贴士|提示|备注|注意|注意事项|小窍门)\s*[：:]?\s*/i, section: "tips" },
];

const GROUP_HEADER_RE = /^(主料|辅料|调料|配菜|腌料)\s*[：:]?\s*/;
const STEP_PREFIX_RE =
  /^\s*(?:步骤\s*\d{1,2}\s*[：:、.]?|(\d{1,2})\s*[.、)）]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*|第[一二三四五六七八九十]+步\s*[：:、.]?\s*)/;
const SEASONING_RE =
  /^(盐|糖|白糖|红糖|冰糖|酱油|生抽|老抽|蚝油|料酒|黄酒|醋|香醋|陈醋|白醋|胡椒|花椒|辣椒粉|辣椒面|淀粉|生粉|鸡精|味精|豆瓣酱|甜面酱|黄豆酱|香油|芝麻油|食用油|橄榄油|五香粉|孜然|咖喱|香料|蜂蜜|白芝麻|黑芝麻|辣椒油|老干妈|沙茶酱|番茄酱|沙拉酱|芥末|八角|桂皮|香叶|陈皮|草果|干辣椒|郫县豆瓣|豆豉|腐乳|鱼露|味极鲜|蒸鱼豉油|椒盐|十三香|白胡椒粉|黑胡椒)/;
const MAIN_RE =
  /(米|饭|面|粉|馒头|饺子|馄饨|肉|牛|猪|羊|鸡|鸭|鹅|鱼|虾|蟹|蛋|豆腐|豆干|土豆|红薯|山药|排骨|鸡翅|鸡腿|培根|香肠|腊肉|火腿|蘑菇|香菇|青菜|白菜|菠菜|西兰花|番茄|西红柿|茄子|黄瓜|胡萝卜|玉米|青椒|洋葱|南瓜|冬瓜|莲藕|豆角|四季豆|花菜|莴笋|芹菜|韭菜|生菜|娃娃菜|芦笋|口蘑|金针菇|木耳|海带|紫菜|粉丝|年糕|米线|河粉|意面|燕麦|小米|黑米|糯米)/;
const PREP_START_RE = /^(切|洗|淘|腌|泡|焯|去皮|改刀|准备|解冻|沥干|擦干|打散|搅匀|剁|拍|剥|择|摘|浸泡|冲洗|剁碎|切块|切片|切丝|切丁)/;
const TIMER_TAG_RE = /(炖|焖|煮|蒸|烤|炸|腌|泡|醒|炒|煎|熬|焯|焗|烘|冷藏|静置|发酵)/;

export function normalizeRecipeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\uFE0F\u20E3]/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(line: string): string {
  return line
    .replace(/^[\s>·•\-–—*●○◆◇▪■□√✓→]+\s*/, "")
    .replace(/\s+$/, "")
    .trim();
}

function extractTags(text: string): string[] {
  const tags = new Set<string>();
  const re = /#([^#\s]{1,20})#?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = m[1].trim();
    if (tag && !/^\d+$/.test(tag)) tags.add(tag);
  }
  return Array.from(tags);
}

export function extractDurationSec(text: string): number {
  let best = 0;
  const re =
    /(\d+(?:\.\d+)?)\s*(?:[-~至到]\s*(\d+(?:\.\d+)?))?\s*(秒钟|秒|分钟|分|小时|钟头|h|min)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    const n = Math.max(a, b);
    const unit = m[3].toLowerCase();
    const sec = unit === "秒钟" || unit === "秒" ? n : unit === "小时" || unit === "钟头" || unit === "h" ? n * 3600 : n * 60;
    if (sec > best) best = sec;
  }
  if (/半小时/.test(text)) best = Math.max(best, 1800);
  if (/一刻钟/.test(text)) best = Math.max(best, 900);
  return Math.round(best);
}

function timerTag(text: string): string {
  return text.match(TIMER_TAG_RE)?.[1] || "";
}

function looksNumbered(line: string): boolean {
  return STEP_PREFIX_RE.test(line);
}

function stripStepPrefix(line: string): { content: string; numbered: boolean } {
  const m = line.match(STEP_PREFIX_RE);
  if (!m) return { content: line, numbered: false };
  return { content: line.slice(m[0].length).trim(), numbered: true };
}

const AMOUNT_SOURCE =
  String.raw`\d+(?:\.\d+)?(?:\s*[-~至到]\s*\d+(?:\.\d+)?)?\s*(?:kg|g|克|千克|公斤|ml|毫升|l|升|斤|两|个|只|根|片|瓣|颗|条|块|张|枚|朵|把|勺|汤匙|茶匙|碗|杯|撮)|半(?:个|只|根|片|瓣|颗|条|块|张|枚|朵|勺|茶匙|碗|杯|撮)?|适量|少许|少量|若干|按需`;
const AMOUNT_FIRST_RE = new RegExp(AMOUNT_SOURCE);
const AMOUNT_ALL_RE = new RegExp(AMOUNT_SOURCE, "g");

function findAmountToken(line: string): { index: number; text: string } | null {
  if (looksNumbered(line)) return null;
  const m = line.match(AMOUNT_FIRST_RE);
  if (!m || m.index == null) return null;
  return { index: m.index, text: m[0].trim() };
}

/** 把「米饭 200g 水 300ml」这类一行多料拆成多行。 */
function splitIngredientLine(line: string): string[] {
  if (/[（(].*[）)]/.test(line)) return [line];
  const tokens = [...line.matchAll(AMOUNT_ALL_RE)];
  if (tokens.length <= 1) return [line];
  const parts: string[] = [];
  let prevEnd = 0;
  tokens.forEach((m, index) => {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    parts.push(index === 0 ? line.slice(0, end) : line.slice(prevEnd, end));
    prevEnd = end;
  });
  return parts.map((p) => p.trim()).filter(Boolean);
}

function looksLikeIngredient(line: string): boolean {
  if (!line || line.length > 90) return false;
  if (SECTION_HEADERS.some((h) => h.re.test(line))) return false;
  return Boolean(findAmountToken(line));
}

function inferGroupFirstPass(name: string): IngredientGroup | undefined {
  if (SEASONING_RE.test(name)) return "seasoning";
  if (MAIN_RE.test(name)) return "main";
  return undefined;
}

function parseIngredientLine(
  line: string,
  groupHint: IngredientGroup | undefined,
  index: number,
): ParsedIngredient | null {
  let cleaned = line.trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/^[\s·•\-–—*]+/, "").trim();
  if (!cleaned || SECTION_HEADERS.some((h) => h.re.test(cleaned))) return null;

  let name = "";
  let amountText = "";
  const colon = cleaned.match(/^(.{1,45}?)[：:]\s*(.{1,45})$/);
  if (colon) {
    name = colon[1].trim();
    amountText = colon[2].trim();
  } else {
    const token = findAmountToken(cleaned);
    if (!token) return null;
    name = `${cleaned.slice(0, token.index)} ${cleaned.slice(token.index + token.text.length)}`
      .replace(/[（(]\s*[）)]/g, " ")
      .replace(/[，,。;；、]+$/g, "")
      .trim();
    amountText = token.text.trim();
  }
  name = name.replace(/^[（(]|[）)]$/g, "").trim();
  if (!name || name.length > 45) return null;
  if (/^\d+$/.test(name)) return null;

  const parsed = parseAmount(amountText);
  const hinted = groupHint || inferGroupFirstPass(name);
  let group: IngredientGroup = hinted || "side";
  if (!hinted && index === 0) group = "main";
  if (!hinted && index === 1 && MAIN_RE.test(name)) group = "main";

  return {
    name,
    group,
    groupHint,
    qty: parsed.qty,
    unit: parsed.unit,
    amountText: parsed.amountText,
    scaleRule: parsed.qty == null ? "fixed" : "linear",
  };
}

function inferServings(text: string): number {
  const m = text.match(/(\d{1,2})\s*(?:[-~至到]\s*\d{1,2})?\s*(?:人份|人食|人|位)/);
  if (!m) return 2;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(20, n) : 2;
}

function inferExplicitTime(text: string, label: string): number {
  const re = new RegExp(`${label}[^0-9]{0,8}(\\d{1,3})\\s*(?:分钟|分)`);
  const m = text.match(re);
  return m ? Number(m[1]) : 0;
}

function inferTitle(lines: string[], rawText: string): { title: string; skipIndex: number } {
  const bracket = rawText.match(/【([^】]{1,40})】/);
  if (bracket) {
    const line = lines.findIndex((l) => l.includes(bracket[0]));
    return { title: bracket[1].trim(), skipIndex: line };
  }
  for (let i = 0; i < Math.min(lines.length, 5); i += 1) {
    const m = lines[i].match(/^(?:菜名|名称|标题|今日菜谱)\s*[：:]\s*(.{1,40})$/);
    if (m) return { title: m[1].trim(), skipIndex: i };
  }
  for (let i = 0; i < Math.min(lines.length, 3); i += 1) {
    const line = lines[i];
    if (!line || line.length > 30) continue;
    if (SECTION_HEADERS.some((h) => h.re.test(line))) continue;
    if (GROUP_HEADER_RE.test(line)) continue;
    if (looksNumbered(line)) continue;
    if (looksLikeIngredient(line)) continue;
    if (/^\d/.test(line)) continue;
    if (/^\d+\s*(?:人份|人食|人|位)/.test(line)) continue;
    if (/(?:备菜|烹饪|总耗时|用时)\s*\d/.test(line)) continue;
    if (/^(收藏|点赞|关注|分享|评论)/.test(line)) continue;
    if (/[,，。！？!?]/.test(line)) continue;
    return { title: line.replace(/[|｜].*$/, "").trim(), skipIndex: i };
  }
  return { title: "", skipIndex: -1 };
}

function addStep(
  steps: { content: string; durationSec: number; timerTag: string }[],
  content: string,
): void {
  const text = content.trim();
  if (!text) return;
  steps.push({
    content: text,
    durationSec: extractDurationSec(text),
    timerTag: timerTag(text),
  });
}

function addPrep(
  prep: { content: string; durationSec: number; timerTag: string }[],
  content: string,
): void {
  const text = content.trim();
  if (!text) return;
  prep.push({
    content: text,
    durationSec: extractDurationSec(text),
    timerTag: timerTag(text),
  });
}

/**
 * 本地解析粘贴的菜谱文案。零网络、零依赖，失败时保留全文兜底。
 */
export function parseRecipeText(input: string): ParsedRecipe {
  const warnings: string[] = [];
  const raw = normalizeRecipeText(input);
  if (!raw) {
    return {
      name: "",
      description: "",
      servings: 2,
      prepTime: 0,
      cookTime: 0,
      tags: [],
      ingredients: [],
      prepItems: [],
      steps: [],
      warnings: ["内容为空，请先粘贴菜谱文字"],
    };
  }

  const tags = extractTags(raw);
  const bodyText = raw.replace(/#[^#\s]{1,20}#?/g, " ").replace(/[ \t]+/g, " ");
  const lines = bodyText
    .split("\n")
    .map(cleanLine)
    .filter((l) => l.length > 0);

  const { title, skipIndex } = inferTitle(lines, bodyText);
  if (!title) warnings.push("没有识别到菜名，已用「未命名菜谱」");
  if (lines.length <= 2) warnings.push("内容较短，建议检查解析结果");

  const bodyLines = lines.filter((_, i) => i !== skipIndex);
  const hasHeaders = bodyLines.some((l) =>
    SECTION_HEADERS.some((h) => h.re.test(l)) || GROUP_HEADER_RE.test(l),
  );

  const parsedIngredients: ParsedIngredient[] = [];
  const prepItems: { content: string; durationSec: number; timerTag: string }[] = [];
  const steps: { content: string; durationSec: number; timerTag: string }[] = [];
  const metaParts: string[] = [];
  const tips: string[] = [];

  let section: Section = "meta";
  let groupHint: IngredientGroup | undefined;
  let ingredientIndex = 0;
  let numberedSteps = false;

  const handleLine = (line: string) => {
    if (!line) return;

    const groupHeader = line.match(GROUP_HEADER_RE);
    if (groupHeader) {
      const key = groupHeader[1];
      groupHint = key === "主料" ? "main" : key === "调料" || key === "腌料" ? "seasoning" : "side";
      section = "ingredients";
      const rest = line.slice(groupHeader[0].length).trim();
      if (rest) handleLine(rest);
      return;
    }

    for (const header of SECTION_HEADERS) {
      const m = line.match(header.re);
      if (m && m.index === 0) {
        section = header.section;
        const rest = line.slice(m[0].length).trim();
        if (rest) handleLine(rest);
        return;
      }
    }

    if (section === "ingredients") {
      const parts = splitIngredientLine(line);
      if (parts.length > 1) {
        parts.forEach((part) => handleLine(part));
        return;
      }
      const item = parseIngredientLine(line, groupHint, ingredientIndex);
      if (item) {
        ingredientIndex += 1;
        parsedIngredients.push(item);
        return;
      }
      const amountToken = findAmountToken(line);
      if (amountToken) {
        const fallback = parseIngredientLine(
          `未命名用料${ingredientIndex + 1}：${amountToken.text}`,
          groupHint,
          ingredientIndex,
        );
        if (fallback) {
          ingredientIndex += 1;
          parsedIngredients.push(fallback);
          return;
        }
      }
      if (line.length > 2) metaParts.push(line);
      return;
    }

    if (section === "prep") {
      addPrep(prepItems, line);
      return;
    }

    if (section === "steps") {
      const { content, numbered } = stripStepPrefix(line);
      if (!content) return;
      if (numbered) numberedSteps = true;
      if (numbered || !numberedSteps || steps.length === 0) {
        addStep(steps, content);
      } else {
        steps[steps.length - 1].content += ` ${content}`;
        const sec = extractDurationSec(content);
        if (sec > steps[steps.length - 1].durationSec) {
          steps[steps.length - 1].durationSec = sec;
          steps[steps.length - 1].timerTag = timerTag(content);
        }
      }
      return;
    }

    if (section === "tips") {
      tips.push(line);
      return;
    }

    // meta：先判断步骤/用料，否则作描述
    if (looksNumbered(line)) {
      const { content } = stripStepPrefix(line);
      addStep(steps, content);
      section = "steps";
      numberedSteps = true;
      return;
    }
    if (looksLikeIngredient(line)) {
      section = "ingredients";
      handleLine(line);
      return;
    }
    metaParts.push(line);
  };

  if (hasHeaders) {
    bodyLines.forEach(handleLine);
  } else {
    // 无标题分区时按行启发式：有数字编号→步骤；有单位→用料；其余→描述/备菜
    const stepLines = bodyLines.filter((l) => looksNumbered(l));
    const ingredientLines = bodyLines.filter((l) => !looksNumbered(l) && looksLikeIngredient(l));
    if (stepLines.length || ingredientLines.length) {
      ingredientLines.flatMap(splitIngredientLine).forEach((line, i) => {
        const item = parseIngredientLine(line, undefined, i);
        if (item) parsedIngredients.push(item);
      });
      stepLines.forEach((line) => addStep(steps, stripStepPrefix(line).content));
    } else {
      metaParts.push(...bodyLines);
    }
  }

  // 没识别到用料时，再扫一遍含单位的行
  if (!parsedIngredients.length) {
    bodyLines.forEach((line, i) => {
      if (looksLikeIngredient(line)) {
        const item = parseIngredientLine(line, undefined, i);
        if (item) parsedIngredients.push(item);
      }
    });
  }

  // 没有显式备菜区时，把以切/洗/腌等开头的步骤提到备菜
  if (!prepItems.length && steps.length) {
    const remain: typeof steps = [];
    steps.forEach((s) => {
      if (PREP_START_RE.test(s.content) && s.content.length <= 40) {
        addPrep(prepItems, s.content);
      } else {
        remain.push(s);
      }
    });
    if (prepItems.length) {
      steps.length = 0;
      steps.push(...remain);
    }
  }

  // 分组兜底：第一个非调料为主料，第二个命中主料关键词也归主料
  let mainSeen = 0;
  parsedIngredients.forEach((item, idx) => {
    if (item.groupHint) return;
    if (item.group === "seasoning") return;
    if (idx === 0 || (mainSeen < 2 && MAIN_RE.test(item.name))) {
      item.group = "main";
      mainSeen += 1;
    } else {
      item.group = "side";
    }
  });

  // 没有步骤时兜底：把描述/全文作为一条步骤
  if (steps.length === 0) {
    const fallbackBody = metaParts.filter((m) => m.length > 2).join("\n") || raw;
    if (fallbackBody.trim()) {
      steps.push({ content: fallbackBody.trim(), durationSec: 0, timerTag: "" });
      warnings.push("没有识别到步骤，已把正文作为一条步骤，请手动拆分");
    }
  } else if (!parsedIngredients.length) {
    warnings.push("没有识别到用料，请手动补充");
  }

  if (parsedIngredients.some((i) => i.qty == null)) {
    warnings.push("部分用量是「适量」，不会参与等比缩放");
  }

  const explicitPrep = inferExplicitTime(raw, "备菜");
  const explicitCook = inferExplicitTime(raw, "烹饪");
  const prepTime =
    explicitPrep ||
    Math.round(prepItems.reduce((sum, p) => sum + p.durationSec, 0) / 60);
  const cookTime =
    explicitCook || Math.round(steps.reduce((sum, s) => sum + s.durationSec, 0) / 60);

  const description = Array.from(new Set(metaParts))
    .filter(
      (m) =>
        m.length > 0 &&
        !/^#/.test(m) &&
        !/^\d+\s*(?:人份|人食|人|位)/.test(m) &&
        !/^(?:备菜|烹饪|总耗时|用时)\s*\d/.test(m),
    )
    .concat(tips.length ? [`小贴士：${tips.join(" ")}`] : [])
    .join(" ")
    .slice(0, 240);

  return {
    name: (title || "未命名菜谱").replace(/[【】]/g, "").trim(),
    description,
    servings: inferServings(raw),
    prepTime,
    cookTime,
    tags,
    ingredients: parsedIngredients.map(({ groupHint: _groupHint, ...rest }) => rest),
    prepItems,
    steps,
    warnings,
  };
}
