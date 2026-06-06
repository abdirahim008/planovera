"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "success" | "ghost" | "warning";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "md", className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-px disabled:active:translate-y-0",
          {
            "bg-bg-surface text-txt border border-border shadow-sm hover:bg-bg-hover hover:border-border-light hover:shadow":
              variant === "default",
            "border-none bg-gradient-to-b from-[#4f8bff] to-[#2f6fed] text-white shadow-lg shadow-blue-500/40 hover:from-[#5a93ff] hover:to-[#3576f5] hover:shadow-xl hover:shadow-blue-500/50":
              variant === "primary",
            "border-none bg-gradient-to-b from-[#fb6f70] to-[#e23d3e] text-white shadow-lg shadow-red-500/35 hover:from-[#fc7e7f] hover:to-[#e84a4b] hover:shadow-xl hover:shadow-red-500/45":
              variant === "danger",
            "border-none bg-gradient-to-b from-[#22c55e] to-[#16a34a] text-white shadow-lg shadow-green-500/35 hover:from-[#2ed06a] hover:to-[#1aae51] hover:shadow-xl hover:shadow-green-500/45":
              variant === "success",
            "border-none bg-gradient-to-b from-[#f7a93b] to-[#e6890f] text-white shadow-lg shadow-amber-500/35 hover:from-[#f9b552] hover:to-[#ef921c] hover:shadow-xl hover:shadow-amber-500/45":
              variant === "warning",
            "bg-transparent text-txt-muted border-none hover:text-txt hover:bg-bg-hover": variant === "ghost",
          },
          {
            "px-2.5 py-1 text-xs": size === "sm",
            "px-3.5 py-1.5 text-sm": size === "md",
            "px-5 py-2.5 text-sm": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
