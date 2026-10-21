import { Languages } from "lucide-react";
import { useI18n, useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const locale = useI18n((s) => s.locale);
  const toggle = useI18n((s) => s.toggle);
  const t = useT();
  return (
    <button
      type="button"
      onClick={toggle}
      title={locale === "en" ? t("Switch to Chinese") : t("Switch to English")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Languages className="size-3.5" />
      {!compact && <span>{locale === "en" ? "中文" : "EN"}</span>}
    </button>
  );
}
