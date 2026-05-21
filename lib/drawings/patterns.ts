/** 
 * CAD Hatch Patterns for Fabric.js
 * Generates canvas sources for repeating patterns.
 */

export type PatternType = "concrete" | "earth" | "masonry" | "hatch" | "gravel" | "solid";

export interface PatternDefinition {
  id: PatternType;
  label: string;
  generate: (color: string, scale: number) => HTMLCanvasElement;
}

export const PATTERNS: PatternDefinition[] = [
  {
    id: "hatch",
    label: "Standard Hatch",
    generate: (color, scale) => {
      const size = 16 * scale;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.stroke();
      return canvas;
    },
  },
  {
    id: "concrete",
    label: "Concrete",
    generate: (color, scale) => {
      const size = 32 * scale;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      
      // Random speckles
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Small triangles
      for (let i = 0; i < 3; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const s = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + s, y + s / 2);
        ctx.lineTo(x, y + s);
        ctx.closePath();
        ctx.stroke();
      }
      return canvas;
    },
  },
  {
    id: "earth",
    label: "Earth / Soil",
    generate: (color, scale) => {
      const size = 32 * scale;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;

      // Diagonal triplets
      for (let i = 0; i < 3; i++) {
        const offset = i * 4 * scale;
        ctx.beginPath();
        ctx.moveTo(0, size - offset);
        ctx.lineTo(size - offset, 0);
        ctx.stroke();
      }
      
      // Dots
      ctx.fillStyle = color;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 0.5, 0, 7);
        ctx.fill();
      }
      return canvas;
    },
  },
  {
    id: "masonry",
    label: "Masonry / Bricks",
    generate: (color, scale) => {
      const w = 24 * scale;
      const h = 12 * scale;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;

      // Row 1
      ctx.strokeRect(0, 0, w, h);
      // Row 2 (staggered)
      ctx.strokeRect(-w / 2, h, w, h);
      ctx.strokeRect(w / 2, h, w, h);
      
      return canvas;
    },
  },
  {
    id: "gravel",
    label: "Gravel / Fill",
    generate: (color, scale) => {
      const size = 32 * scale;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;

      for (let i = 0; i < 6; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = (1 + Math.random() * 2) * scale;
        ctx.beginPath();
        // Draw irregular "pebble"
        ctx.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
      return canvas;
    },
  },
];
