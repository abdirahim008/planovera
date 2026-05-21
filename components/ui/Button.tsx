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
          "inline-flex items-center gap-1.5 rounded-md font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
          {
            "bg-bg-raised text-txt border border-border hover:bg-bg-hover": variant === "default",
            "bg-accent text-white border-none hover:bg-accent-hover": variant === "primary",
            "bg-err/10 text-err border border-err/25 hover:bg-err/20": variant === "danger",
            "bg-ok/10 text-ok border border-ok/25 hover:bg-ok/20": variant === "success",
            "bg-warn/10 text-warn border border-warn/25 hover:bg-warn/20": variant === "warning",
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
