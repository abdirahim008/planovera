"use client";

import React, { useEffect, useRef } from "react";

interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: string;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: MenuItem[];
}

export default function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Adjust position if menu goes off-screen
  const adjustedX = typeof window !== "undefined" && x + 160 > window.innerWidth ? x - 160 : x;
  const adjustedY = typeof window !== "undefined" && y + 200 > window.innerHeight ? y - 200 : y;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <div
            className={`context-menu-item ${item.danger ? "hover:bg-red-500!" : ""}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span className="w-4 text-center">{item.icon}</span>}
            <span>{item.label}</span>
          </div>
          {index < items.length - 1 && items[index + 1].danger && (
            <div className="context-menu-separator" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
