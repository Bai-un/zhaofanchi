import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { dismissToast, useToasts } from "../lib/notify";

export function ToastStack() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;
        return (
          <div className={`toast ${toast.tone}`} key={toast.id}>
            <Icon size={18} className={toast.tone === "success" ? "accent" : toast.tone === "error" ? "danger" : "muted"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="toast-title">{toast.title}</div>
              {toast.body ? <div className="toast-body">{toast.body}</div> : null}
            </div>
            <button className="toast-close" aria-label="关闭提示" onClick={() => dismissToast(toast.id)}>
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
