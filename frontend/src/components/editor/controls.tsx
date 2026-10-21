import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Minus } from "lucide-react";
import { cn, clamp, round } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function Section({
  title,
  children,
  defaultOpen = true,
  action,
  className,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("border-b border-panel-border", className)}>
      <div className="flex h-9 items-center justify-between px-3">
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {title}
        </button>
        {action}
      </div>
      {open && <div className="px-3 pb-3.5">{children}</div>}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  onFocus,
  min = -1_000_000,
  max = 1_000_000,
  step = 1,
  suffix,
  icon,
  disabled,
  className,
  placeholder,
}: {
  value: number;
  onChange: (value: number) => void;
  onFocus?: () => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(String(round(value, 2)));
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setDraft(String(round(value, 2)));
  }, [value, focused]);

  const commit = (raw?: string) => {
    const n = parseFloat(raw ?? draft);
    if (Number.isFinite(n)) {
      const next = clamp(round(n, 2), min, max);
      setDraft(String(next));
      if (next !== value) onChange(next);
    } else {
      setDraft(String(round(value, 2)));
    }
  };

  return (
    <div
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20",
        disabled && "opacity-50",
        className,
      )}
    >
      {icon && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{icon}</span>}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
          requestAnimationFrame(() => ref.current?.select());
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            ref.current?.blur();
          } else if (e.key === "Escape") {
            setDraft(String(round(value, 2)));
            ref.current?.blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const next = clamp(round(value + (e.shiftKey ? step * 10 : step), 2), min, max);
            onChange(next);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            const next = clamp(round(value - (e.shiftKey ? step * 10 : step), 2), min, max);
            onChange(next);
          }
          e.stopPropagation();
        }}
        className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground"
      />
      {suffix && <span className="shrink-0 text-[10px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export function HexInput({
  value,
  onChange,
  onFocus,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  onFocus?: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value.replace("#", "").toUpperCase());
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value.replace("#", "").toUpperCase());
  }, [value, focused]);
  const commit = () => {
    let v = draft.trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(v)) v = v.split("").map((c) => c + c).join("");
    if (/^[0-9a-f]{6}$/i.test(v)) onChange(`#${v.toLowerCase()}`);
    else setDraft(value.replace("#", "").toUpperCase());
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
      className={cn(
        "h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-[12px] uppercase outline-none focus:border-ring focus:ring-2 focus:ring-ring/20",
        className,
      )}
      spellCheck={false}
    />
  );
}

export function ColorSwatch({ color, onChange, onFocus }: { color: string; onChange: (c: string) => void; onFocus?: () => void }) {
  return (
    <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border">
      <span className="absolute inset-0" style={{ background: color }} />
      <input
        type="color"
        value={normalizeColor(color)}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function normalizeColor(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).split("").map((c) => c + c).join("")}`;
  return "#000000";
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 rounded-md border border-input p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          className={cn(
            "flex h-6 flex-1 items-center justify-center rounded px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground",
            value === opt.value && "bg-secondary text-foreground shadow-sm",
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function InlineInput({
  value,
  onChange,
  placeholder,
  className,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      className={cn("h-8 text-[12px]", className)}
      spellCheck={false}
    />
  );
}

export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground"><Minus className="size-3" />{children}</div>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
