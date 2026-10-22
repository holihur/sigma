import {
  Circle,
  Frame,
  Hand,
  Image as ImageIcon,
  MessageCircle,
  MousePointer2,
  Minus,
  PenTool,
  Square,
  Type,
} from "lucide-react";
import type { Tool } from "@/lib/types";
import { useEditor } from "@/store/editor";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const TOOLS: { tool: Tool; icon: React.ReactNode; label: string; shortcut: string }[] = [
  { tool: "select", icon: <MousePointer2 className="size-[17px]" />, label: "Move", shortcut: "V" },
  { tool: "hand", icon: <Hand className="size-[17px]" />, label: "Hand tool", shortcut: "H" },
  { tool: "frame", icon: <Frame className="size-[17px]" />, label: "Frame", shortcut: "F" },
  { tool: "rect", icon: <Square className="size-[16px]" />, label: "Rectangle", shortcut: "R" },
  { tool: "ellipse", icon: <Circle className="size-[17px]" />, label: "Ellipse", shortcut: "O" },
  { tool: "line", icon: <Minus className="size-[17px]" />, label: "Line", shortcut: "L" },
  { tool: "vector", icon: <PenTool className="size-[17px]" />, label: "Pen / vector", shortcut: "P" },
  { tool: "text", icon: <Type className="size-[17px]" />, label: "Text", shortcut: "T" },
  { tool: "image", icon: <ImageIcon className="size-[17px]" />, label: "Place image", shortcut: "⇧I" },
  { tool: "comment", icon: <MessageCircle className="size-[16px]" />, label: "Comment", shortcut: "C" },
];

export function Toolbar({ readOnly }: { readOnly: boolean }) {
  const t = useT();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const showComments = useEditor((s) => s.showComments);
  const setShowComments = useEditor((s) => s.setShowComments);
  const commentCount = useEditor((s) => s.comments.filter((c) => !c.resolved).length);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="no-scrollbar absolute bottom-16 left-1/2 z-40 flex max-w-[calc(100%-0.75rem)] -translate-x-1/2 flex-row items-center gap-0.5 overflow-x-auto rounded-xl border border-panel-border bg-panel/95 p-1 shadow-xl backdrop-blur md:bottom-auto md:left-3 md:top-3 md:max-w-none md:translate-x-0 md:flex-col md:overflow-visible">
        {TOOLS.map((item, index) => {
          const disabled = readOnly && !["select", "hand", "comment"].includes(item.tool);
          return (
            <div key={item.tool} className="contents">
              {index === 2 && <span className="mx-0.5 h-5 w-px shrink-0 bg-border md:mx-0 md:my-0.5 md:h-px md:w-5" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    title={t(item.label)}
                    disabled={disabled}
                    onClick={() => setTool(item.tool)}
                    className={cn(
                      "relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30",
                      tool === item.tool && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
                    )}
                  >
                    {item.icon}
                    {item.tool === "comment" && commentCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                        {commentCount > 9 ? "9" : commentCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t(item.label)} <span className="ml-1 text-muted-foreground">{item.shortcut}</span>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
        <span className="mx-0.5 h-5 w-px shrink-0 bg-border md:mx-0 md:my-0.5 md:h-px md:w-5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              title={t("Comments")}
              onClick={() => setShowComments(!showComments)}
              className={cn(
                "hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex",
                showComments && "bg-secondary text-foreground",
              )}
            >
              <MessageCircle className="size-[16px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("Comments")}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
