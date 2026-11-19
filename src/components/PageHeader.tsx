import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { navigate } from "../lib/router";

export function PageHeader({
  title,
  backTo = "/",
  actions,
  onBack,
}: {
  title: string;
  backTo?: string;
  actions?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="page-head">
      <button className="back-btn" aria-label="返回" onClick={onBack || (() => navigate(backTo))}>
        <ChevronLeft size={20} />
      </button>
      <h1>{title}</h1>
      {actions}
    </div>
  );
}
