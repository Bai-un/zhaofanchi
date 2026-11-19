import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileJson,
  Info,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import type { ThemePref } from "../lib/theme";
import { setThemePref, useThemePref } from "../lib/theme";
import {
  clearAllRecipes,
  importRecipes,
  listRecipes,
  storageUsage,
} from "../lib/store";
import {
  downloadBackup,
  formatBytes,
  lastBackupAt,
  parseBackupText,
  readTextFile,
} from "../lib/backup";
import { pushToast } from "../lib/notify";
import { isNativeApp } from "../lib/native";

const THEME_OPTIONS: { key: ThemePref; label: string; icon: typeof Sun }[] = [
  { key: "system", label: "跟随系统", icon: Monitor },
  { key: "light", label: "浅色", icon: Sun },
  { key: "dark", label: "深色", icon: Moon },
];

export function SettingsPage() {
  const themePref = useThemePref();
  const native = isNativeApp();
  const [count, setCount] = useState(0);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [backupAt, setBackupAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<"merge" | "replace">("merge");

  const refresh = () => {
    listRecipes()
      .then((rows) => setCount(rows.length))
      .catch(() => undefined);
    storageUsage().then(setUsage).catch(() => undefined);
    setBackupAt(lastBackupAt());
  };

  useEffect(() => {
    refresh();
  }, []);

  const exportAll = async () => {
    setBusy(true);
    try {
      const recipes = await listRecipes();
      if (!recipes.length) {
        pushToast({ title: "还没有菜谱可以导出", tone: "info" });
        return;
      }
      downloadBackup(recipes);
      setBackupAt(Date.now());
      pushToast({ title: "已导出备份", body: `${recipes.length} 道菜，保存好这个 JSON 文件`, tone: "success" });
    } catch {
      pushToast({ title: "导出失败", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (mode: "merge" | "replace") => {
    modeRef.current = mode;
    fileRef.current?.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const text = await readTextFile(file);
      const parsed = parseBackupText(text);
      if (!parsed.recipes.length) throw new Error("备份里没有菜谱");
      const mode = modeRef.current;
      if (mode === "replace") {
        const ok = window.confirm(
          `覆盖导入会先清空当前 ${count} 道菜，再导入 ${parsed.recipes.length} 道。确定继续吗？`,
        );
        if (!ok) return;
      }
      const result = await importRecipes(parsed.recipes, mode);
      pushToast({
        title: mode === "replace" ? "已覆盖导入" : "已合并导入",
        body: `新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}`,
        tone: "success",
      });
      if (parsed.warnings.length) {
        pushToast({ title: "导入提示", body: parsed.warnings.join("；"), tone: "info" });
      }
      refresh();
    } catch (error) {
      pushToast({
        title: "导入失败",
        body: error instanceof Error ? error.message : "文件格式不正确",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (!count) return;
    if (!window.confirm(`将删除全部 ${count} 道菜，且无法恢复。确定吗？`)) return;
    if (!window.confirm("建议先导出备份。真的确定清空吗？")) return;
    setBusy(true);
    try {
      await clearAllRecipes();
      pushToast({ title: "已清空", tone: "success" });
      refresh();
    } catch {
      pushToast({ title: "清空失败", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const staleBackup = !backupAt || Date.now() - backupAt > 14 * 24 * 3600 * 1000;

  return (
    <>
      <div className="page">
        <div className="brand-row">
          <div>
            <div className="brand-title">设置</div>
            <div className="brand-sub">主题、备份和本机数据</div>
          </div>
        </div>

        {staleBackup ? (
          <div className="banner warn" style={{ marginBottom: 14 }}>
            <Info size={17} style={{ flex: "0 0 auto", marginTop: 2 }} />
            <div>
              {backupAt ? "上次备份已经超过两周。" : "还没有备份过。"}
              数据只在这台设备上，建议现在导出一次 JSON。
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="section-head">
            <div className="section-title">主题</div>
            <span className="section-note">默认跟随系统</span>
          </div>
          <div className="segmented theme" role="tablist" aria-label="主题">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`theme-option ${themePref === option.key ? "active" : ""}`}
                  onClick={() => setThemePref(option.key)}
                >
                  <Icon size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card section">
          <div className="section-head">
            <div className="section-title">数据</div>
            <span className="section-note">本地 IndexedDB</span>
          </div>
          <div className="grid-2">
            <div>
              <div className="tiny muted">菜谱数量</div>
              <div className="stat"><span className="stat-value">{count}</span><span className="small muted">道</span></div>
            </div>
            <div>
              <div className="tiny muted">已用存储</div>
              <div className="stat">
                <span className="stat-value" style={{ fontSize: "calc(20px * var(--site-type))" }}>
                  {usage ? formatBytes(usage.usage) : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="divider" />

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">导出全部备份</div>
              <div className="list-sub">
                {backupAt ? `上次备份：${new Date(backupAt).toLocaleString("zh-CN")}` : "建议每次大改后导出一份"}
              </div>
            </div>
            <button className="btn btn-sm btn-soft" onClick={exportAll} disabled={busy}>
              <Download size={14} /> 导出
            </button>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">导入并合并</div>
              <div className="list-sub">保留现有菜谱，同一道菜以更新时间较新的为准</div>
            </div>
            <button className="btn btn-sm" onClick={() => pickFile("merge")} disabled={busy}>
              <Upload size={14} /> 选择
            </button>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title">导入并覆盖</div>
              <div className="list-sub">先清空现有菜谱，再导入备份（会二次确认）</div>
            </div>
            <button className="btn btn-sm" onClick={() => pickFile("replace")} disabled={busy}>
              <FileJson size={14} /> 选择
            </button>
          </div>

          <div className="list-row">
            <div className="list-main">
              <div className="list-title danger">清空全部菜谱</div>
              <div className="list-sub">只删本机数据，不影响已经导出的备份</div>
            </div>
            <button className="btn btn-sm btn-danger" onClick={clearAll} disabled={busy}>
              <Trash2 size={14} /> 清空
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={onFile}
          />
        </div>

        <div className="card section">
          <div className="section-head">
            <div className="section-title">{native ? "安卓安装版" : "装到手机主屏"}</div>
            <Smartphone size={16} className="muted" />
          </div>
          {native ? (
            <div className="tiny muted" style={{ lineHeight: 1.8 }}>
              当前是安装版，已把页面和图标打包在本机，不依赖浏览器和网络。
              <br />
              「导出全部备份」会保存到手机的「下载/找饭吃」文件夹；换机时用「导入并合并」选择该 JSON。
            </div>
          ) : (
            <ol className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>用安卓 Chrome 打开本站地址。</li>
              <li>点右上角菜单，选择“添加到主屏幕”或“安装应用”。</li>
              <li>从桌面图标打开，计时和 Wake Lock 体验更接近原生。</li>
            </ol>
          )}
        </div>

        <div className="card section">
          <div className="section-head">
            <div className="section-title">关于</div>
            <span className="section-note">v1.0</span>
          </div>
          <div className="tiny muted" style={{ lineHeight: 1.8 }}>
            {native ? "找饭吃（安卓安装版）。" : "找饭吃。"}
            菜谱、备菜、步骤和计时都存在本机；粘贴解析也在本机完成，不上传。
            <br />
            换设备请先「导出全部备份」，再到新设备「导入并合并」。没有自动云同步，也不会额外产生服务器费用。
            <br />
            清理应用数据或卸载应用可能导致数据丢失，请定期导出。
          </div>
          <div className="banner" style={{ marginTop: 12 }}>
            <Info size={16} style={{ flex: "0 0 auto", marginTop: 2 }} />
            <div>计时到点会响铃、震动并显示提示。切后台或锁屏时可能被系统延迟，请以页面内倒计时为准。</div>
          </div>
        </div>
      </div>
    </>
  );
}
