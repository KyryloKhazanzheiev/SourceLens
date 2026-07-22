import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-45",
        variant === "primary" &&
          "bg-violet-600 text-white shadow-[0_12px_30px_rgba(124,58,237,.24)] hover:bg-violet-500",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50",
        variant === "ghost" && "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
        size === "default" && "h-11 px-4",
        size === "icon" && "size-9",
        className,
      )}
      {...props}
    />
  );
}
