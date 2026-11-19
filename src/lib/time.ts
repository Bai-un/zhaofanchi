export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec || 0));
  if (!total) return "";
  if (total < 60) return `${total}秒`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return seconds ? `${minutes}分${seconds}秒` : `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}小时${rest}分` : `${hours}小时`;
}

export function formatMinutes(min: number): string {
  return formatDuration(Math.round((min || 0) * 60));
}

export function formatClock(sec: number): string {
  const total = Math.max(0, Math.ceil(sec || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
