import { jsPDF } from "jspdf";
import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from "react";

type ImageAsset = {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
};

type CardItem = {
  id: string;
  name: string;
  front: ImageAsset;
  back?: ImageAsset;
};

type IconAsset = ImageAsset & {
  token: string;
};

type SizePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type PagePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type ExportSide = "fronts" | "backs" | "duplex";
type BackMode = "none" | "single" | "matched" | "generated";
type FitMode = "contain" | "cover";
type PreviewSide = "fronts" | "backs";
type CardLayoutMode = "standard" | "fullArt";
type TypeLinePosition = "aboveImage" | "belowImage";
type CostAlign = "left" | "center" | "right";
type CostLabelPlacement = "inline" | "overlay";
type DigitalExportTarget = "generic" | "unity" | "godot";
type TemplateElementKey = "title" | "cost" | "art" | "type" | "rules" | "statLeft" | "statRight" | "footer";
type TemplateRect = { x: number; y: number; w: number; h: number };
type TemplateLayout = Record<TemplateElementKey, TemplateRect>;
type TemplateDragMode = "move" | "resize";

const TEMPLATE_ELEMENTS: Array<{ key: TemplateElementKey; label: string; hint: string }> = [
  { key: "title", label: "Title", hint: "Auto-starts near the top." },
  { key: "cost", label: "Cost / icons", hint: "Mana, cost, action, or custom icons." },
  { key: "art", label: "Art", hint: "Image box for standard cards." },
  { key: "type", label: "Type line", hint: "Move above or below art." },
  { key: "rules", label: "Rules box", hint: "Text box position and size." },
  { key: "statLeft", label: "Left stat", hint: "Power, attack, value, etc." },
  { key: "statRight", label: "Right stat", hint: "Health, defense, cost, etc." },
  { key: "footer", label: "Footer", hint: "Prototype/footer line." }
];

const DEFAULT_TEMPLATE_LAYOUT: TemplateLayout = {
  title: { x: 10.5, y: 7.1, w: 79, h: 7.5 },
  cost: { x: 63, y: 8.2, w: 25, h: 5.8 },
  type: { x: 10.5, y: 15.6, w: 79, h: 4.4 },
  art: { x: 10.5, y: 21.6, w: 79, h: 37.5 },
  rules: { x: 10.5, y: 62.2, w: 79, h: 21.2 },
  statLeft: { x: 11, y: 87, w: 13, h: 7 },
  statRight: { x: 76, y: 87, w: 13, h: 7 },
  footer: { x: 18, y: 94, w: 64, h: 4 }
};

const BELOW_IMAGE_TEMPLATE_LAYOUT: TemplateLayout = {
  ...DEFAULT_TEMPLATE_LAYOUT,
  art: { x: 10.5, y: 15.6, w: 79, h: 40.6 },
  type: { x: 10.5, y: 57.4, w: 79, h: 4.4 },
  rules: { x: 10.5, y: 63.8, w: 79, h: 20.4 }
};

const FULL_ART_TEMPLATE_LAYOUT: TemplateLayout = {
  ...DEFAULT_TEMPLATE_LAYOUT,
  title: { x: 10.5, y: 7.1, w: 79, h: 7.5 },
  cost: { x: 63, y: 8.2, w: 25, h: 5.8 },
  art: { x: 4, y: 4, w: 92, h: 92 },
  type: { x: 10.5, y: 55, w: 79, h: 4.6 },
  rules: { x: 10.5, y: 61.5, w: 79, h: 23.5 },
  footer: { x: 18, y: 94, w: 64, h: 4 }
};

const CARD_PRESETS: SizePreset[] = [
  { id: "tcg", label: "Standard TCG / Poker — 63 x 88 mm", width: 63, height: 88 },
  { id: "mini", label: "Mini Euro — 44 x 68 mm", width: 44, height: 68 },
  { id: "tarot", label: "Tarot — 70 x 120 mm", width: 70, height: 120 },
  { id: "square", label: "Square — 70 x 70 mm", width: 70, height: 70 },
  { id: "custom", label: "Custom", width: 63, height: 88 }
];

const PAGE_PRESETS: PagePreset[] = [
  { id: "letter", label: "US Letter — 8.5 x 11 in", width: 215.9, height: 279.4 },
  { id: "a4", label: "A4 — 210 x 297 mm", width: 210, height: 297 }
];

const DEFAULT_CARD_EDITOR = {
  title: "Custom Card",
  typeLine: "Creature / Item / Ability",
  rules: "Rules text supports uploaded icons like [icon:mana]. Use full-art mode for card art behind the text box.",
  footer: "Prototype • Not tournament legal",
  statLeft: "3",
  statRight: "5",
  costText: "",
  costLabel: "",
  costAlign: "right" as CostAlign,
  costLabelPlacement: "inline" as CostLabelPlacement,
  costIconSize: 36,
  layoutMode: "standard" as CardLayoutMode,
  typeLinePosition: "aboveImage" as TypeLinePosition,
  templateLayout: DEFAULT_TEMPLATE_LAYOUT,
  accent: "#7c3aed",
  frame: "#111827",
  body: "#f8fafc",
  border: "#7c3aed",
  innerBorder: "#ffffff",
  titleColor: "#111827",
  textColor: "#111827",
  titleBox: "#f8fafc",
  typeBox: "#ede9fe",
  textBox: "#f8fafc",
  textBoxOpacity: 88,
  borderWidth: 18,
  cornerRadius: 34,
  artFit: "cover" as FitMode,
  showTitleBar: true,
  showTypeBar: true,
  showStats: true
};

type CardEditor = typeof DEFAULT_CARD_EDITOR;

type CardTemplatePreset = {
  id: string;
  label: string;
  family: string;
  description: string;
  layout: TemplateLayout;
  editor: Partial<CardEditor>;
};

const FANTASY_RESOURCE_LAYOUT: TemplateLayout = {
  title: { x: 7.8, y: 5.2, w: 67, h: 6.5 },
  cost: { x: 74.5, y: 5.5, w: 18, h: 6 },
  art: { x: 8.2, y: 13.4, w: 83.6, h: 41.2 },
  type: { x: 8.2, y: 56.2, w: 83.6, h: 5.1 },
  rules: { x: 8.2, y: 62.7, w: 83.6, h: 22.6 },
  statLeft: { x: 65.5, y: 87.1, w: 12.5, h: 5.8 },
  statRight: { x: 79.2, y: 87.1, w: 12.5, h: 5.8 },
  footer: { x: 16, y: 94.2, w: 68, h: 3.8 }
};

const MONSTER_BATTLE_LAYOUT: TemplateLayout = {
  title: { x: 7.5, y: 4.6, w: 56, h: 6.8 },
  cost: { x: 65.5, y: 4.7, w: 27, h: 6.6 },
  art: { x: 7.8, y: 13.2, w: 84.4, h: 38.6 },
  type: { x: 8.4, y: 53.3, w: 83.2, h: 4.8 },
  rules: { x: 8.4, y: 59.2, w: 83.2, h: 25.8 },
  statLeft: { x: 9, y: 87.8, w: 24, h: 5.8 },
  statRight: { x: 67, y: 87.8, w: 24, h: 5.8 },
  footer: { x: 16, y: 95, w: 68, h: 3.4 }
};

const DUEL_MONSTER_LAYOUT: TemplateLayout = {
  title: { x: 6.8, y: 5.3, w: 86.4, h: 7.2 },
  cost: { x: 54, y: 13.7, w: 38.5, h: 4.8 },
  art: { x: 11.5, y: 19.6, w: 77, h: 45.6 },
  type: { x: 9.2, y: 68, w: 81.6, h: 4.8 },
  rules: { x: 9.2, y: 74.2, w: 81.6, h: 15.8 },
  statLeft: { x: 58.5, y: 91.2, w: 15, h: 5.3 },
  statRight: { x: 76, y: 91.2, w: 15, h: 5.3 },
  footer: { x: 11, y: 96.2, w: 78, h: 3 }
};

const COMMANDER_HERO_LAYOUT: TemplateLayout = {
  title: { x: 8, y: 5, w: 63, h: 6.8 },
  cost: { x: 70.8, y: 5.1, w: 21, h: 6.5 },
  art: { x: 7, y: 12.7, w: 86, h: 50.5 },
  type: { x: 8, y: 64.7, w: 84, h: 4.8 },
  rules: { x: 8, y: 71, w: 84, h: 15.2 },
  statLeft: { x: 8.8, y: 88.5, w: 18, h: 5.8 },
  statRight: { x: 73.2, y: 88.5, w: 18, h: 5.8 },
  footer: { x: 16, y: 95.3, w: 68, h: 3.3 }
};

const ANIME_BATTLE_LAYOUT: TemplateLayout = {
  title: { x: 8.2, y: 5.3, w: 62.8, h: 6.4 },
  cost: { x: 72, y: 5.2, w: 20, h: 6.2 },
  art: { x: 4.8, y: 12.5, w: 90.4, h: 54 },
  type: { x: 9.2, y: 66.8, w: 81.6, h: 4.7 },
  rules: { x: 9.2, y: 72.9, w: 81.6, h: 14.3 },
  statLeft: { x: 9.2, y: 89.1, w: 17, h: 5.6 },
  statRight: { x: 73.8, y: 89.1, w: 17, h: 5.6 },
  footer: { x: 16, y: 95.4, w: 68, h: 3.2 }
};

const INK_CHARACTER_LAYOUT: TemplateLayout = {
  title: { x: 8, y: 5.4, w: 68, h: 6.5 },
  cost: { x: 5.8, y: 5.2, w: 12, h: 7.4 },
  art: { x: 5.5, y: 12.4, w: 89, h: 51 },
  type: { x: 9, y: 64.8, w: 82, h: 5 },
  rules: { x: 9, y: 71.2, w: 82, h: 14.6 },
  statLeft: { x: 9, y: 88.2, w: 18, h: 6.2 },
  statRight: { x: 73, y: 88.2, w: 18, h: 6.2 },
  footer: { x: 17, y: 95.5, w: 66, h: 3.2 }
};

const TEXT_HEAVY_ACTION_LAYOUT: TemplateLayout = {
  title: { x: 8.4, y: 6, w: 63, h: 6.2 },
  cost: { x: 72.5, y: 5.8, w: 19.2, h: 6 },
  art: { x: 9.2, y: 14.3, w: 81.6, h: 27.5 },
  type: { x: 9.2, y: 43.5, w: 81.6, h: 4.8 },
  rules: { x: 9.2, y: 50.2, w: 81.6, h: 35.4 },
  statLeft: { x: 10, y: 88.7, w: 17, h: 5.8 },
  statRight: { x: 73, y: 88.7, w: 17, h: 5.8 },
  footer: { x: 16, y: 95.2, w: 68, h: 3.2 }
};

const CARD_TEMPLATE_PRESETS: CardTemplatePreset[] = [
  {
    id: "standardAbove",
    label: "Starter card",
    family: "Simple",
    description: "Clean default card with type line above the image.",
    layout: DEFAULT_TEMPLATE_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "aboveImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#111827",
      body: "#f8fafc",
      border: "#7c3aed",
      innerBorder: "#ffffff",
      titleBox: "#f8fafc",
      typeBox: "#ede9fe",
      textBox: "#f8fafc",
      titleColor: "#111827",
      textColor: "#111827",
      costAlign: "right",
      costIconSize: 36,
      borderWidth: 18,
      cornerRadius: 34
    }
  },
  {
    id: "standardBelow",
    label: "Starter below-art",
    family: "Simple",
    description: "Default card with type line below the art box.",
    layout: BELOW_IMAGE_TEMPLATE_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#111827",
      body: "#f8fafc",
      border: "#2563eb",
      innerBorder: "#ffffff",
      titleBox: "#f8fafc",
      typeBox: "#dbeafe",
      textBox: "#f8fafc",
      titleColor: "#111827",
      textColor: "#111827",
      costAlign: "right",
      costIconSize: 36,
      borderWidth: 18,
      cornerRadius: 34
    }
  },
  {
    id: "fantasyResource",
    label: "MTG-style fantasy",
    family: "Popular TCG-inspired",
    description: "Top title/cost, large art, type bar, rules box, and bottom stats.",
    layout: FANTASY_RESOURCE_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#1f2937",
      body: "#eee7d5",
      border: "#7c2d12",
      innerBorder: "#f8fafc",
      titleBox: "#fef3c7",
      typeBox: "#fde68a",
      textBox: "#fff7ed",
      titleColor: "#111827",
      textColor: "#111827",
      accent: "#92400e",
      costAlign: "right",
      costIconSize: 34,
      borderWidth: 16,
      cornerRadius: 32
    }
  },
  {
    id: "monsterBattle",
    label: "Pokémon-style monster",
    family: "Popular TCG-inspired",
    description: "Name/HP feel, wide art, move/rules section, and bottom utility stats.",
    layout: MONSTER_BATTLE_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#78350f",
      body: "#fef3c7",
      border: "#f59e0b",
      innerBorder: "#fffbeb",
      titleBox: "#fde68a",
      typeBox: "#fcd34d",
      textBox: "#fffbeb",
      titleColor: "#111827",
      textColor: "#111827",
      accent: "#dc2626",
      costAlign: "right",
      costIconSize: 32,
      borderWidth: 20,
      cornerRadius: 40
    }
  },
  {
    id: "duelMonster",
    label: "Yu-Gi-Oh-style duel",
    family: "Popular TCG-inspired",
    description: "Title bar, attribute/level row, square-ish art, compact text, bottom stats.",
    layout: DUEL_MONSTER_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#422006",
      body: "#f2c078",
      border: "#9a3412",
      innerBorder: "#fed7aa",
      titleBox: "#f7c873",
      typeBox: "#fef3c7",
      textBox: "#fff7ed",
      titleColor: "#111827",
      textColor: "#111827",
      accent: "#7c2d12",
      costAlign: "right",
      costIconSize: 26,
      borderWidth: 14,
      cornerRadius: 10
    }
  },
  {
    id: "animeBattle",
    label: "Anime battle TCG",
    family: "Popular TCG-inspired",
    description: "Modern full-character look with art pushed large and text compressed.",
    layout: ANIME_BATTLE_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#0f172a",
      body: "#e0f2fe",
      border: "#0284c7",
      innerBorder: "#f8fafc",
      titleBox: "#e0f2fe",
      typeBox: "#bae6fd",
      textBox: "#f0f9ff",
      titleColor: "#0f172a",
      textColor: "#0f172a",
      accent: "#0ea5e9",
      costAlign: "right",
      costIconSize: 32,
      borderWidth: 18,
      cornerRadius: 28
    }
  },
  {
    id: "commanderHero",
    label: "Hero/leader card",
    family: "Popular TCG-inspired",
    description: "Hero card with taller art, subtitle bar, and small rules section.",
    layout: COMMANDER_HERO_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#312e81",
      body: "#ede9fe",
      border: "#7c3aed",
      innerBorder: "#f5f3ff",
      titleBox: "#ddd6fe",
      typeBox: "#c4b5fd",
      textBox: "#f5f3ff",
      titleColor: "#111827",
      textColor: "#111827",
      accent: "#7c3aed",
      costAlign: "right",
      costIconSize: 34,
      borderWidth: 18,
      cornerRadius: 36
    }
  },
  {
    id: "inkCharacter",
    label: "Ink character card",
    family: "Popular TCG-inspired",
    description: "Left cost, big character art, compact abilities, and bottom stats.",
    layout: INK_CHARACTER_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#134e4a",
      body: "#ccfbf1",
      border: "#14b8a6",
      innerBorder: "#f0fdfa",
      titleBox: "#99f6e4",
      typeBox: "#5eead4",
      textBox: "#f0fdfa",
      titleColor: "#0f172a",
      textColor: "#0f172a",
      accent: "#0f766e",
      costAlign: "left",
      costIconSize: 38,
      borderWidth: 18,
      cornerRadius: 34
    }
  },
  {
    id: "textHeavyAction",
    label: "Action/spell card",
    family: "Utility",
    description: "Short art area and a large rules box for effects, events, and items.",
    layout: TEXT_HEAVY_ACTION_LAYOUT,
    editor: {
      layoutMode: "standard",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: false,
      frame: "#172554",
      body: "#dbeafe",
      border: "#2563eb",
      innerBorder: "#eff6ff",
      titleBox: "#bfdbfe",
      typeBox: "#93c5fd",
      textBox: "#eff6ff",
      titleColor: "#0f172a",
      textColor: "#0f172a",
      accent: "#2563eb",
      costAlign: "right",
      costIconSize: 32,
      borderWidth: 16,
      cornerRadius: 30
    }
  },
  {
    id: "fullArtShowcase",
    label: "Full-art showcase",
    family: "Collector/custom",
    description: "Full-art card with floating title, type, and translucent rules box.",
    layout: FULL_ART_TEMPLATE_LAYOUT,
    editor: {
      layoutMode: "fullArt",
      typeLinePosition: "belowImage",
      showTitleBar: true,
      showTypeBar: true,
      showStats: true,
      frame: "#020617",
      body: "#111827",
      border: "#e5e7eb",
      innerBorder: "#ffffff",
      titleBox: "#0f172a",
      typeBox: "#0f172a",
      textBox: "#0f172a",
      titleColor: "#ffffff",
      textColor: "#ffffff",
      accent: "#7c3aed",
      textBoxOpacity: 74,
      costAlign: "right",
      costIconSize: 36,
      borderWidth: 10,
      cornerRadius: 38
    }
  }
];


function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanBaseName(name: string) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[-_\s]*(front|back|card|proxy)$/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function cleanTokenName(name: string) {
  return cleanBaseName(name).replace(/^icon/, "") || "icon";
}

function safeFileName(name: string) {
  return (name || "proxysheet")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "proxysheet";
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0
  };
}

function withAlpha(hex: string, alphaPercent: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, alphaPercent)) / 100})`;
}

function cloneTemplateLayout(layout: TemplateLayout): TemplateLayout {
  return Object.fromEntries(
    Object.entries(layout).map(([key, rect]) => [key, { ...rect }])
  ) as TemplateLayout;
}

function clampRect(rect: TemplateRect): TemplateRect {
  const w = Math.max(3, Math.min(100, rect.w));
  const h = Math.max(2, Math.min(100, rect.h));
  const x = Math.max(0, Math.min(100 - w, rect.x));
  const y = Math.max(0, Math.min(100 - h, rect.y));
  return { x, y, w, h };
}

function canvasRect(rect: TemplateRect, canvasW: number, canvasH: number) {
  return {
    x: (rect.x / 100) * canvasW,
    y: (rect.y / 100) * canvasH,
    w: (rect.w / 100) * canvasW,
    h: (rect.h / 100) * canvasH
  };
}

function rectCenter(rect: { x: number; y: number; w: number; h: number }) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

async function fileToPngAsset(file: File): Promise<ImageAsset> {
  const sourceUrl = await readAsDataUrl(file);
  const image = await loadImage(sourceUrl);
  const maxSide = 2600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    id: uid(),
    name: file.name,
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height
  };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitRect(sourceW: number, sourceH: number, targetX: number, targetY: number, targetW: number, targetH: number, fit: FitMode) {
  const sourceRatio = sourceW / sourceH;
  const targetRatio = targetW / targetH;

  if (fit === "cover") {
    if (sourceRatio > targetRatio) {
      const drawW = targetH * sourceRatio;
      return { x: targetX - (drawW - targetW) / 2, y: targetY, w: drawW, h: targetH };
    }
    const drawH = targetW / sourceRatio;
    return { x: targetX, y: targetY - (drawH - targetH) / 2, w: targetW, h: drawH };
  }

  if (sourceRatio > targetRatio) {
    const drawH = targetW / sourceRatio;
    return { x: targetX, y: targetY + (targetH - drawH) / 2, w: targetW, h: drawH };
  }

  const drawW = targetH * sourceRatio;
  return { x: targetX + (targetW - drawW) / 2, y: targetY, w: drawW, h: targetH };
}

async function imageToCardSurface(imageAsset: ImageAsset, aspectWidth: number, aspectHeight: number, fit: FitMode, background = "#ffffff", targetWidth = 900) {
  const baseWidth = Math.max(64, Math.round(targetWidth));
  const baseHeight = Math.max(1, Math.round(baseWidth * (aspectHeight / aspectWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = baseWidth;
  canvas.height = baseHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  const image = await loadImage(imageAsset.dataUrl);
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();
  const p = fitRect(image.naturalWidth, image.naturalHeight, 0, 0, canvas.width, canvas.height, fit);
  ctx.drawImage(image, p.x, p.y, p.w, p.h);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

function dataUrlToBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dateToDosTime(date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

class SimpleZip {
  private encoder = new TextEncoder();
  private files: Array<{ name: string; data: Uint8Array; crc: number; dosTime: number; dosDate: number }> = [];

  async file(name: string, content: Blob | string) {
    const cleanName = name.replace(/\\/g, "/");
    const data = typeof content === "string"
      ? this.encoder.encode(content)
      : new Uint8Array(await content.arrayBuffer());
    const { dosTime, dosDate } = dateToDosTime();
    this.files.push({ name: cleanName, data, crc: crc32(data), dosTime, dosDate });
  }

  generateBlob() {
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBytes = this.encoder.encode(file.name);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      writeU32(localView, 0, 0x04034b50);
      writeU16(localView, 4, 20);
      writeU16(localView, 6, 0);
      writeU16(localView, 8, 0);
      writeU16(localView, 10, file.dosTime);
      writeU16(localView, 12, file.dosDate);
      writeU32(localView, 14, file.crc);
      writeU32(localView, 18, file.data.length);
      writeU32(localView, 22, file.data.length);
      writeU16(localView, 26, nameBytes.length);
      writeU16(localView, 28, 0);
      local.set(nameBytes, 30);
      chunks.push(local, file.data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      writeU32(centralView, 0, 0x02014b50);
      writeU16(centralView, 4, 20);
      writeU16(centralView, 6, 20);
      writeU16(centralView, 8, 0);
      writeU16(centralView, 10, 0);
      writeU16(centralView, 12, file.dosTime);
      writeU16(centralView, 14, file.dosDate);
      writeU32(centralView, 16, file.crc);
      writeU32(centralView, 20, file.data.length);
      writeU32(centralView, 24, file.data.length);
      writeU16(centralView, 28, nameBytes.length);
      writeU16(centralView, 30, 0);
      writeU16(centralView, 32, 0);
      writeU16(centralView, 34, 0);
      writeU16(centralView, 36, 0);
      writeU32(centralView, 38, 0);
      writeU32(centralView, 42, offset);
      centralHeader.set(nameBytes, 46);
      central.push(centralHeader);

      offset += local.length + file.data.length;
    }

    const centralOffset = offset;
    const centralSize = central.reduce((sum, item) => sum + item.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeU32(endView, 0, 0x06054b50);
    writeU16(endView, 4, 0);
    writeU16(endView, 6, 0);
    writeU16(endView, 8, this.files.length);
    writeU16(endView, 10, this.files.length);
    writeU32(endView, 12, centralSize);
    writeU32(endView, 16, centralOffset);
    writeU16(endView, 20, 0);

    return new Blob([...chunks, ...central, end] as BlobPart[], { type: "application/zip" });
  }
}

function wrapPlainText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !current) current = test;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type RichToken =
  | { type: "word"; value: string }
  | { type: "space"; value: string }
  | { type: "icon"; value: string };

function parseRichText(text: string): RichToken[] {
  const tokens: RichToken[] = [];
  const parts = text.split(/(\[icon:[^\]]+\]|\s+)/g).filter((part) => part.length > 0);
  for (const part of parts) {
    const iconMatch = part.match(/^\[icon:([^\]]+)\]$/i);
    if (iconMatch) tokens.push({ type: "icon", value: cleanTokenName(iconMatch[1]) });
    else if (/^\s+$/.test(part)) tokens.push({ type: "space", value: " " });
    else tokens.push({ type: "word", value: part });
  }
  return tokens;
}

async function buildIconImageMap(icons: IconAsset[]) {
  const entries = await Promise.all(
    icons.map(async (icon) => [icon.token, await loadImage(icon.dataUrl)] as const)
  );
  return new Map(entries);
}

function richTokenWidth(ctx: CanvasRenderingContext2D, token: RichToken, iconSize: number) {
  if (token.type === "icon") return iconSize + 6;
  return ctx.measureText(token.value).width;
}

function layoutRichText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, iconSize: number) {
  const rawTokens = parseRichText(text);
  const lines: RichToken[][] = [];
  let line: RichToken[] = [];
  let width = 0;

  for (const token of rawTokens) {
    if (token.type === "space" && line.length === 0) continue;
    const tokenWidth = richTokenWidth(ctx, token, iconSize);
    if (line.length > 0 && width + tokenWidth > maxWidth && token.type !== "space") {
      while (line.length && line[line.length - 1].type === "space") line.pop();
      lines.push(line);
      line = [token];
      width = tokenWidth;
    } else {
      line.push(token);
      width += tokenWidth;
    }
  }
  while (line.length && line[line.length - 1].type === "space") line.pop();
  if (line.length) lines.push(line);
  return lines;
}

function drawRichText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  iconImages: Map<string, HTMLImageElement>,
  color: string
) {
  const iconSize = lineHeight * 0.78;
  const lines = layoutRichText(ctx, text, maxWidth, iconSize).slice(0, maxLines);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  lines.forEach((line, lineIndex) => {
    let cursorX = x;
    const baseY = y + lineIndex * lineHeight;
    for (const token of line) {
      if (token.type === "icon") {
        const image = iconImages.get(token.value);
        if (image) {
          ctx.drawImage(image, cursorX, baseY - iconSize + 5, iconSize, iconSize);
        } else {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          drawRoundedRect(ctx, cursorX, baseY - iconSize + 5, iconSize, iconSize, iconSize * 0.2);
          ctx.stroke();
          ctx.restore();
        }
        cursorX += iconSize + 6;
      } else {
        ctx.fillText(token.value, cursorX, baseY);
        cursorX += ctx.measureText(token.value).width;
      }
    }
  });
}

function compactTokens(tokens: RichToken[]) {
  const result: RichToken[] = [];
  for (const token of tokens) {
    if (token.type === "space") {
      if (!result.length || result[result.length - 1].type === "space") continue;
      result.push(token);
    } else {
      result.push(token);
    }
  }
  while (result.length && result[result.length - 1].type === "space") result.pop();
  return result;
}

function measureTokenRow(ctx: CanvasRenderingContext2D, tokens: RichToken[], iconSize: number) {
  return tokens.reduce((total, token) => {
    if (token.type === "icon") return total + iconSize + 6;
    if (token.type === "space") return total + Math.max(6, iconSize * 0.24);
    return total + ctx.measureText(token.value).width;
  }, 0);
}

function drawTokenRow(
  ctx: CanvasRenderingContext2D,
  tokens: RichToken[],
  x: number,
  y: number,
  maxWidth: number,
  iconSize: number,
  iconImages: Map<string, HTMLImageElement>,
  color: string,
  align: CostAlign,
  overlayLabel: string
) {
  const compacted = compactTokens(tokens);
  if (!compacted.length && !overlayLabel.trim()) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - 8, maxWidth, iconSize + 18);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textBaseline = "middle";

  const width = Math.min(maxWidth, measureTokenRow(ctx, compacted, iconSize));
  let cursorX = x;
  if (align === "center") cursorX = x + (maxWidth - width) / 2;
  if (align === "right") cursorX = x + maxWidth - width;

  let overlayDrawn = false;
  for (const token of compacted) {
    if (token.type === "icon") {
      const image = iconImages.get(token.value);
      if (image) {
        ctx.drawImage(image, cursorX, y, iconSize, iconSize);
      } else {
        ctx.lineWidth = 2;
        drawRoundedRect(ctx, cursorX, y, iconSize, iconSize, iconSize * 0.2);
        ctx.stroke();
      }

      if (overlayLabel.trim() && !overlayDrawn) {
        const label = overlayLabel.trim().slice(0, 4);
        ctx.save();
        ctx.font = `bold ${Math.max(16, iconSize * 0.54)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(3, iconSize * 0.11);
        ctx.strokeStyle = "rgba(255,255,255,0.86)";
        ctx.fillStyle = color;
        ctx.strokeText(label, cursorX + iconSize / 2, y + iconSize / 2 + 1, iconSize * 0.9);
        ctx.fillText(label, cursorX + iconSize / 2, y + iconSize / 2 + 1, iconSize * 0.9);
        ctx.restore();
        overlayDrawn = true;
      }
      cursorX += iconSize + 6;
    } else if (token.type === "space") {
      cursorX += Math.max(6, iconSize * 0.24);
    } else {
      ctx.fillText(token.value, cursorX, y + iconSize / 2);
      cursorX += ctx.measureText(token.value).width;
    }
  }

  if (overlayLabel.trim() && !overlayDrawn) {
    ctx.font = `bold ${Math.max(18, iconSize * 0.62)}px Arial`;
    ctx.textAlign = align === "right" ? "right" : align === "center" ? "center" : "left";
    const textX = align === "right" ? x + maxWidth : align === "center" ? x + maxWidth / 2 : x;
    ctx.fillText(overlayLabel.trim(), textX, y + iconSize / 2);
  }

  ctx.restore();
}

function makeGeneratedBack(text: string, accent: string, background: string): ImageAsset {
  const canvas = document.createElement("canvas");
  canvas.width = 744;
  canvas.height = 1039;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const pad = 58;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 16;
  drawRoundedRect(ctx, pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, 42);
  ctx.stroke();

  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 9; i += 1) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, pad + i * 20, pad + i * 28, canvas.width - (pad + i * 20) * 2, canvas.height - (pad + i * 28) * 2, 42);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 76px Arial";
  const lines = wrapPlainText(ctx, text || "PROXY", canvas.width - 170).slice(0, 3);
  const startY = canvas.height / 2 - (lines.length - 1) * 48;
  lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, startY + index * 96));

  ctx.font = "28px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText("PLAYTEST / PROTOTYPE", canvas.width / 2, canvas.height - 120);

  return {
    id: "generated-back",
    name: "generated-back.png",
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height
  };
}

async function makeCustomCard(
  editor: CardEditor,
  imageAsset: ImageAsset | undefined,
  icons: IconAsset[],
  frameOverlay: ImageAsset | undefined,
  textBoxImage: ImageAsset | undefined
): Promise<ImageAsset> {
  const canvas = document.createElement("canvas");
  canvas.width = 744;
  canvas.height = 1039;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";

  const iconImages = await buildIconImageMap(icons);
  const layout = editor.templateLayout ?? DEFAULT_TEMPLATE_LAYOUT;
  const borderW = Math.max(0, Math.min(70, editor.borderWidth));
  const radius = Math.max(0, Math.min(80, editor.cornerRadius));
  const innerX = borderW + 20;
  const innerY = borderW + 20;
  const innerW = canvas.width - innerX * 2;
  const innerH = canvas.height - innerY * 2;

  ctx.fillStyle = editor.frame;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = editor.border;
  drawRoundedRect(ctx, 24, 24, canvas.width - 48, canvas.height - 48, radius + 12);
  ctx.fill();

  ctx.fillStyle = editor.innerBorder;
  drawRoundedRect(ctx, 24 + borderW, 24 + borderW, canvas.width - (24 + borderW) * 2, canvas.height - (24 + borderW) * 2, radius);
  ctx.fill();

  ctx.save();
  drawRoundedRect(ctx, innerX, innerY, innerW, innerH, Math.max(0, radius - 10));
  ctx.clip();
  ctx.fillStyle = editor.body;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  if (imageAsset && editor.layoutMode === "fullArt") {
    const image = await loadImage(imageAsset.dataUrl);
    const p = fitRect(image.naturalWidth, image.naturalHeight, innerX, innerY, innerW, innerH, editor.artFit);
    ctx.drawImage(image, p.x, p.y, p.w, p.h);
  }
  ctx.restore();

  const titleRect = canvasRect(layout.title, canvas.width, canvas.height);
  const costRect = canvasRect(layout.cost, canvas.width, canvas.height);
  const artRect = canvasRect(layout.art, canvas.width, canvas.height);
  const typeRect = canvasRect(layout.type, canvas.width, canvas.height);
  const rulesRect = canvasRect(layout.rules, canvas.width, canvas.height);
  const statLeftRect = canvasRect(layout.statLeft, canvas.width, canvas.height);
  const statRightRect = canvasRect(layout.statRight, canvas.width, canvas.height);
  const footerRect = canvasRect(layout.footer, canvas.width, canvas.height);

  if (imageAsset && editor.layoutMode === "standard") {
    const image = await loadImage(imageAsset.dataUrl);
    ctx.save();
    drawRoundedRect(ctx, artRect.x, artRect.y, artRect.w, artRect.h, Math.min(24, artRect.h / 3));
    ctx.clip();
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(artRect.x, artRect.y, artRect.w, artRect.h);
    const p = fitRect(image.naturalWidth, image.naturalHeight, artRect.x, artRect.y, artRect.w, artRect.h, editor.artFit);
    ctx.drawImage(image, p.x, p.y, p.w, p.h);
    ctx.restore();
  } else if (!imageAsset && editor.layoutMode === "standard") {
    ctx.fillStyle = "#e5e7eb";
    drawRoundedRect(ctx, artRect.x, artRect.y, artRect.w, artRect.h, Math.min(24, artRect.h / 3));
    ctx.fill();
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(18, Math.min(34, artRect.h * 0.12))}px Arial`;
    ctx.fillText("Card Art", artRect.x + artRect.w / 2, artRect.y + artRect.h / 2);
  }

  if (editor.showTitleBar) {
    ctx.fillStyle = withAlpha(editor.titleBox, editor.layoutMode === "fullArt" ? Math.max(70, editor.textBoxOpacity) : 100);
    drawRoundedRect(ctx, titleRect.x, titleRect.y, titleRect.w, titleRect.h, Math.min(18, titleRect.h / 2));
    ctx.fill();
  }

  ctx.fillStyle = editor.titleColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(18, Math.min(46, titleRect.h * 0.6))}px Arial`;
  const titleLines = wrapPlainText(ctx, editor.title || "Untitled", titleRect.w - 28).slice(0, 1);
  ctx.fillText(titleLines[0] || "Untitled", titleRect.x + 14, titleRect.y + titleRect.h / 2, titleRect.w - 28);

  const hasCostContent = Boolean(editor.costText.trim() || editor.costLabel.trim());
  if (hasCostContent) {
    const iconSize = Math.max(18, Math.min(72, Math.min(editor.costIconSize, costRect.h)));
    const costRowText = editor.costLabelPlacement === "inline" && editor.costLabel.trim()
      ? `${editor.costText.trim()} ${editor.costLabel.trim()}`.trim()
      : editor.costText.trim();
    const tokens = parseRichText(costRowText || editor.costLabel.trim());
    ctx.font = `bold ${Math.max(18, iconSize * 0.7)}px Arial`;
    drawTokenRow(
      ctx,
      tokens,
      costRect.x,
      costRect.y + Math.max(0, (costRect.h - iconSize) / 2),
      costRect.w,
      iconSize,
      iconImages,
      editor.titleColor,
      editor.costAlign,
      editor.costLabelPlacement === "overlay" ? editor.costLabel : ""
    );
  }

  if (editor.showTypeBar) {
    ctx.fillStyle = withAlpha(editor.typeBox, editor.layoutMode === "fullArt" ? Math.max(62, editor.textBoxOpacity) : 100);
    drawRoundedRect(ctx, typeRect.x, typeRect.y, typeRect.w, typeRect.h, Math.min(14, typeRect.h / 2));
    ctx.fill();
    ctx.fillStyle = editor.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(14, Math.min(28, typeRect.h * 0.56))}px Arial`;
    ctx.fillText(editor.typeLine || "Prototype Card", typeRect.x + 14, typeRect.y + typeRect.h / 2, typeRect.w - 28);
  }

  ctx.save();
  drawRoundedRect(ctx, rulesRect.x, rulesRect.y, rulesRect.w, rulesRect.h, Math.min(20, rulesRect.h / 4));
  ctx.clip();
  if (textBoxImage) {
    const image = await loadImage(textBoxImage.dataUrl);
    const p = fitRect(image.naturalWidth, image.naturalHeight, rulesRect.x, rulesRect.y, rulesRect.w, rulesRect.h, "cover");
    ctx.drawImage(image, p.x, p.y, p.w, p.h);
    ctx.fillStyle = withAlpha(editor.textBox, Math.max(0, editor.textBoxOpacity - 25));
    ctx.fillRect(rulesRect.x, rulesRect.y, rulesRect.w, rulesRect.h);
  } else {
    ctx.fillStyle = withAlpha(editor.textBox, editor.textBoxOpacity);
    ctx.fillRect(rulesRect.x, rulesRect.y, rulesRect.w, rulesRect.h);
  }
  ctx.restore();
  ctx.strokeStyle = withAlpha(editor.innerBorder, 65);
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, rulesRect.x, rulesRect.y, rulesRect.w, rulesRect.h, Math.min(20, rulesRect.h / 4));
  ctx.stroke();

  ctx.fillStyle = editor.textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const rulesFontSize = Math.max(16, Math.min(30, rulesRect.h * 0.13));
  const lineHeight = rulesFontSize * 1.3;
  ctx.font = `${rulesFontSize}px Arial`;
  drawRichText(
    ctx,
    editor.rules || "",
    rulesRect.x + 18,
    rulesRect.y + 18 + rulesFontSize,
    rulesRect.w - 36,
    lineHeight,
    Math.floor((rulesRect.h - 26) / lineHeight),
    iconImages,
    editor.textColor
  );

  if (editor.showStats) {
    const drawStat = (rect: { x: number; y: number; w: number; h: number }, value: string) => {
      ctx.fillStyle = editor.accent;
      drawRoundedRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(20, rect.h / 2));
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.max(18, Math.min(42, rect.h * 0.58))}px Arial`;
      const center = rectCenter(rect);
      ctx.fillText(value || "", center.x, center.y, rect.w - 8);
    };
    drawStat(statLeftRect, editor.statLeft);
    drawStat(statRightRect, editor.statRight);
  }

  ctx.fillStyle = editor.layoutMode === "fullArt" ? "rgba(255,255,255,0.88)" : "#6b7280";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.max(12, Math.min(24, footerRect.h * 0.55))}px Arial`;
  const footerCenter = rectCenter(footerRect);
  ctx.fillText(editor.footer || "Prototype", footerCenter.x, footerCenter.y, footerRect.w);

  if (frameOverlay) {
    const overlay = await loadImage(frameOverlay.dataUrl);
    ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  }

  return {
    id: uid(),
    name: `${safeFileName(editor.title || "custom-card")}.png`,
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height
  };
}

function App() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [status, setStatus] = useState("Ready.");
  const [pagePreset, setPagePreset] = useState("letter");
  const [cardPreset, setCardPreset] = useState("tcg");
  const [customCardWidth, setCustomCardWidth] = useState(63);
  const [customCardHeight, setCustomCardHeight] = useState(88);
  const [margin, setMargin] = useState(10);
  const [gap, setGap] = useState(2);
  const [copies, setCopies] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>("cover");
  const [showCutLines, setShowCutLines] = useState(true);
  const [duplexMirror, setDuplexMirror] = useState(true);
  const [exportSide, setExportSide] = useState<ExportSide>("duplex");
  const [previewSide, setPreviewSide] = useState<PreviewSide>("fronts");
  const [backMode, setBackMode] = useState<BackMode>("generated");
  const [singleBack, setSingleBack] = useState<ImageAsset | undefined>();
  const [backLibrary, setBackLibrary] = useState<ImageAsset[]>([]);
  const [chosenBackId, setChosenBackId] = useState<string>("generated-back");
  const [generatedBackText, setGeneratedBackText] = useState("PROXY");
  const [generatedBackAccent, setGeneratedBackAccent] = useState("#7c3aed");
  const [generatedBackBg, setGeneratedBackBg] = useState("#111827");
  const [editor, setEditor] = useState<CardEditor>(DEFAULT_CARD_EDITOR);
  const [templatePresetId, setTemplatePresetId] = useState("standardAbove");
  const [editorImage, setEditorImage] = useState<ImageAsset | undefined>();
  const [editorFrameOverlay, setEditorFrameOverlay] = useState<ImageAsset | undefined>();
  const [editorTextBoxImage, setEditorTextBoxImage] = useState<ImageAsset | undefined>();
  const [activeTemplateElement, setActiveTemplateElement] = useState<TemplateElementKey>("title");
  const [icons, setIcons] = useState<IconAsset[]>([]);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const singleBackInputRef = useRef<HTMLInputElement>(null);
  const editorImageRef = useRef<HTMLInputElement>(null);
  const editorFrameOverlayRef = useRef<HTMLInputElement>(null);
  const editorTextBoxImageRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [digitalExportTarget, setDigitalExportTarget] = useState<DigitalExportTarget>("unity");
  const [digitalDpi, setDigitalDpi] = useState(300);
  const [digitalPackName, setDigitalPackName] = useState("proxysheet-studio-digital-pack");
  const [digitalIncludeFronts, setDigitalIncludeFronts] = useState(true);
  const [digitalIncludeBacks, setDigitalIncludeBacks] = useState(true);
  const [digitalIncludeMetadata, setDigitalIncludeMetadata] = useState(true);

  const selectedCardPreset = CARD_PRESETS.find((preset) => preset.id === cardPreset) ?? CARD_PRESETS[0];
  const page = PAGE_PRESETS.find((preset) => preset.id === pagePreset) ?? PAGE_PRESETS[0];
  const cardSize = {
    width: cardPreset === "custom" ? customCardWidth : selectedCardPreset.width,
    height: cardPreset === "custom" ? customCardHeight : selectedCardPreset.height
  };

  const repeatedCards = useMemo(() => {
    const result: CardItem[] = [];
    cards.forEach((card) => {
      for (let i = 0; i < copies; i += 1) result.push(card);
    });
    return result;
  }, [cards, copies]);

  const layout = useMemo(() => {
    const columns = Math.max(1, Math.floor((page.width - margin * 2 + gap) / (cardSize.width + gap)));
    const rows = Math.max(1, Math.floor((page.height - margin * 2 + gap) / (cardSize.height + gap)));
    const perPage = columns * rows;
    const pages = Math.max(1, Math.ceil(repeatedCards.length / perPage));
    return { columns, rows, perPage, pages };
  }, [page.width, page.height, margin, gap, cardSize.width, cardSize.height, repeatedCards.length]);

  const selectedCards = useMemo(() => cards.filter((card) => selectedIds.includes(card.id)), [cards, selectedIds]);
  const previewCards = repeatedCards.slice(0, layout.perPage);
  const generatedBack = useMemo(() => makeGeneratedBack(generatedBackText, generatedBackAccent, generatedBackBg), [generatedBackText, generatedBackAccent, generatedBackBg]);
  const backOptions = useMemo(() => {
    const options: ImageAsset[] = [];
    if (singleBack) options.push(singleBack);
    backLibrary.forEach((back) => {
      if (!options.some((existing) => existing.id === back.id)) options.push(back);
    });
    options.push(generatedBack);
    return options;
  }, [singleBack, backLibrary, generatedBack]);
  const chosenBack = backOptions.find((back) => back.id === chosenBackId) ?? singleBack ?? backLibrary[0] ?? generatedBack;
  const digitalPixelWidth = useMemo(() => Math.max(64, Math.round((cardSize.width / 25.4) * digitalDpi)), [cardSize.width, digitalDpi]);
  const digitalPixelHeight = useMemo(() => Math.max(64, Math.round((cardSize.height / 25.4) * digitalDpi)), [cardSize.height, digitalDpi]);

  function findBackForCard(card: CardItem, library = backLibrary) {
    const frontName = cleanBaseName(card.front.name);
    const cardName = cleanBaseName(card.name);
    return library.find((asset) => cleanBaseName(asset.name) === frontName || cleanBaseName(asset.name) === cardName);
  }

  async function addFrontFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    setStatus(`Importing ${files.length} front image(s)...`);
    try {
      const assets = await Promise.all(files.map(fileToPngAsset));
      const newCards: CardItem[] = assets.map((asset) => {
        const card: CardItem = { id: uid(), name: asset.name.replace(/\.[^.]+$/, ""), front: asset };
        const matchedBack = findBackForCard(card);
        return matchedBack ? { ...card, back: matchedBack } : card;
      });
      setCards((current) => [...current, ...newCards]);
      setSelectedIds(newCards.map((card) => card.id));
      setStatus(`Imported ${assets.length} front image(s). Newly imported cards are selected.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    }
  }

  async function addMatchedBackFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    const selectedSnapshot = [...selectedIds];
    setStatus(`Importing ${files.length} back image(s)...`);
    try {
      const assets = await Promise.all(files.map(fileToPngAsset));
      const nextLibrary = [...backLibrary, ...assets];
      const firstBack = assets[0];
      let matched = 0;
      setBackLibrary(nextLibrary);
      setChosenBackId(firstBack.id);
      if (assets.length === 1) setSingleBack(firstBack);

      setCards((current) => {
        const autoApplyIds = assets.length === 1
          ? (selectedSnapshot.length ? selectedSnapshot : current.map((card) => card.id))
          : [];

        return current.map((card) => {
          if (autoApplyIds.includes(card.id)) {
            matched += 1;
            return { ...card, back: firstBack };
          }

          const back = findBackForCard(card, nextLibrary);
          if (back) {
            matched += 1;
            return { ...card, back };
          }

          return card;
        });
      });

      setSelectedIds(selectedSnapshot);
      setBackMode("matched");
      setPreviewSide("backs");
      setStatus(
        assets.length === 1
          ? `Imported 1 back and applied it to ${matched} card(s). Selection was kept.`
          : `Imported ${assets.length} back image(s). Matched ${matched} card(s). Selection was kept.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Back import failed.");
    }
  }

  async function chooseSingleBack(fileList: FileList | null) {
    const file = Array.from(fileList ?? []).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;
    const selectedSnapshot = [...selectedIds];
    setStatus("Importing single back image...");
    try {
      const asset = await fileToPngAsset(file);
      let applied = 0;
      setSingleBack(asset);
      setChosenBackId(asset.id);
      setBackLibrary((current) => current.some((back) => back.id === asset.id) ? current : [asset, ...current]);
      setCards((current) => {
        const targetIds = selectedSnapshot.length ? selectedSnapshot : current.map((card) => card.id);
        applied = targetIds.length;
        return current.map((card) => targetIds.includes(card.id) ? { ...card, back: asset } : card);
      });
      setSelectedIds(selectedSnapshot);
      setBackMode(cards.length ? "matched" : "single");
      setPreviewSide("backs");
      setStatus(applied ? `Back imported and applied to ${applied} card(s). Selection was kept.` : `Back imported: ${asset.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Single back import failed.");
    }
  }

  async function chooseEditorImage(fileList: FileList | null) {
    const file = Array.from(fileList ?? []).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;
    try {
      const asset = await fileToPngAsset(file);
      setEditorImage(asset);
      setStatus(`Card creator art set: ${asset.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Card creator image import failed.");
    }
  }

  async function chooseEditorOverlay(fileList: FileList | null, target: "frame" | "textBox") {
    const file = Array.from(fileList ?? []).find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;
    try {
      const asset = await fileToPngAsset(file);
      if (target === "frame") {
        setEditorFrameOverlay(asset);
        setStatus(`Custom border/frame overlay set: ${asset.name}`);
      } else {
        setEditorTextBoxImage(asset);
        setStatus(`Rules text box background set: ${asset.name}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Overlay import failed.");
    }
  }

  async function addIconFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    setStatus(`Importing ${files.length} icon(s)...`);
    try {
      const assets = await Promise.all(files.map(fileToPngAsset));
      const iconAssets: IconAsset[] = assets.map((asset) => ({
        ...asset,
        token: cleanTokenName(asset.name)
      }));
      setIcons((current) => [...current, ...iconAssets]);
      setStatus(`Imported ${iconAssets.length} icon(s). Use tokens like [icon:${iconAssets[0].token}] in rules or cost.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Icon import failed.");
    }
  }

  function onDropFronts(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void addFrontFiles(event.dataTransfer.files);
  }

  function onDropBacks(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void addMatchedBackFiles(event.dataTransfer.files);
  }

  async function addEditorCard() {
    setStatus("Generating custom card...");
    try {
      const asset = await makeCustomCard(editor, editorImage, icons, editorFrameOverlay, editorTextBoxImage);
      const newCard: CardItem = { id: uid(), name: editor.title || "Custom Card", front: asset };
      setCards((current) => [...current, newCard]);
      setSelectedIds([newCard.id]);
      setPreviewSide("fronts");
      setStatus("Custom card added and selected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate custom card.");
    }
  }

  function removeSelected() {
    if (!selectedIds.length) return;
    setCards((current) => current.filter((card) => !selectedIds.includes(card.id)));
    setSelectedIds([]);
    setStatus("Removed selected card(s).");
  }

  function clearAll() {
    setCards([]);
    setSelectedIds([]);
    setStatus("Cleared project.");
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectAll() {
    setSelectedIds(cards.map((card) => card.id));
    setStatus("Selected all cards.");
  }

  function clearSelection() {
    setSelectedIds([]);
    setStatus("Selection cleared.");
  }

  function applyBackAsset(asset: ImageAsset | undefined, target: "selected" | "all") {
    if (!asset) {
      setStatus("Choose or generate a back first.");
      return;
    }
    const targetIds = target === "selected" ? selectedIds : cards.map((card) => card.id);
    if (!targetIds.length) {
      setStatus(target === "selected" ? "Select card fronts first, or use Apply to all." : "No cards to update.");
      return;
    }
    setCards((current) => current.map((card) => targetIds.includes(card.id) ? { ...card, back: asset } : card));
    setChosenBackId(asset.id);
    setBackMode("matched");
    setPreviewSide("backs");
    setStatus(`Applied ${asset.name} to ${targetIds.length} card(s).`);
  }

  function applyChosenBack(target: "selected" | "all") {
    applyBackAsset(chosenBack, target);
  }

  function clearBacks(target: "selected" | "all") {
    const targetIds = target === "selected" ? selectedIds : cards.map((card) => card.id);
    if (!targetIds.length) {
      setStatus(target === "selected" ? "Select cards first." : "No cards to update.");
      return;
    }
    setCards((current) => current.map((card) => targetIds.includes(card.id) ? { ...card, back: undefined } : card));
    setStatus(`Cleared per-card backs from ${targetIds.length} card(s).`);
  }

  function getBackForCard(card: CardItem): ImageAsset | undefined {
    if (backMode === "none") return undefined;
    if (card.back) return card.back;
    if (backMode === "single") return singleBack;
    if (backMode === "generated") return generatedBack;
    return undefined;
  }

  function addCutLines(pdf: jsPDF, x: number, y: number, w: number, h: number) {
    const tick = 4;
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.12);
    pdf.line(x, y, x + tick, y);
    pdf.line(x, y, x, y + tick);
    pdf.line(x + w, y, x + w - tick, y);
    pdf.line(x + w, y, x + w, y + tick);
    pdf.line(x, y + h, x + tick, y + h);
    pdf.line(x, y + h, x, y + h - tick);
    pdf.line(x + w, y + h, x + w - tick, y + h);
    pdf.line(x + w, y + h, x + w, y + h - tick);
  }

  async function drawCard(pdf: jsPDF, image: ImageAsset, x: number, y: number, fit: FitMode = fitMode) {
    const surface = await imageToCardSurface(image, cardSize.width, cardSize.height, fit);
    pdf.addImage(surface, "PNG", x, y, cardSize.width, cardSize.height, undefined, "FAST");
    if (showCutLines) addCutLines(pdf, x, y, cardSize.width, cardSize.height);
  }

  async function exportPdf() {
    if (!repeatedCards.length) {
      setStatus("Add at least one card before exporting.");
      return;
    }
    setStatus("Rendering PDF...");

    try {
      const pdf = new jsPDF({
        orientation: page.height >= page.width ? "portrait" : "landscape",
        unit: "mm",
        format: [page.width, page.height],
        compress: true
      });

      let started = false;
      const pageCount = Math.ceil(repeatedCards.length / layout.perPage);

      const renderSheet = async (sheetIndex: number, side: "front" | "back") => {
        if (started) pdf.addPage([page.width, page.height], page.height >= page.width ? "portrait" : "landscape");
        started = true;

        const start = sheetIndex * layout.perPage;
        const sheetCards = repeatedCards.slice(start, start + layout.perPage);
        for (let index = 0; index < sheetCards.length; index += 1) {
          const card = sheetCards[index];
          const row = Math.floor(index / layout.columns);
          const logicalCol = index % layout.columns;
          const col = side === "back" && duplexMirror ? layout.columns - 1 - logicalCol : logicalCol;
          const x = margin + col * (cardSize.width + gap);
          const y = margin + row * (cardSize.height + gap);
          const image = side === "front" ? card.front : getBackForCard(card);
          if (image) await drawCard(pdf, image, x, y, fitMode);
          else if (showCutLines) addCutLines(pdf, x, y, cardSize.width, cardSize.height);
        }
      };

      for (let sheetIndex = 0; sheetIndex < pageCount; sheetIndex += 1) {
        if (exportSide === "fronts") await renderSheet(sheetIndex, "front");
        else if (exportSide === "backs") await renderSheet(sheetIndex, "back");
        else {
          await renderSheet(sheetIndex, "front");
          await renderSheet(sheetIndex, "back");
        }
      }

      pdf.save("proxysheet-studio-export.pdf");
      setStatus("PDF exported. Images are clipped to each card slot, so wide banners should no longer spill into neighboring cards.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "PDF export failed.");
    }
  }

  async function exportDigitalPack() {
    if (!cards.length) {
      setStatus("Add at least one card before exporting digital assets.");
      return;
    }
    if (!digitalIncludeFronts && !digitalIncludeBacks && !digitalIncludeMetadata) {
      setStatus("Enable at least one digital export option first.");
      return;
    }

    setStatus("Building digital asset pack...");
    try {
      const zip = new SimpleZip();
      const safePackName = safeFileName(digitalPackName || "proxysheet-studio-digital-pack");
      const folderPreset = (() => {
        if (digitalExportTarget === "unity") return { fronts: "Cards", backs: "Backs", cardData: "Data/Cards", rootData: "Data" };
        if (digitalExportTarget === "godot") return { fronts: "textures/cards", backs: "textures/backs", cardData: "data/cards", rootData: "data" };
        return { fronts: "cards", backs: "backs", cardData: "data/cards", rootData: "data" };
      })();

      const manifestCards: Array<Record<string, unknown>> = [];

      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const baseName = `${String(index + 1).padStart(3, "0")}_${safeFileName(card.name || cleanBaseName(card.front.name) || `card-${index + 1}`)}`;

        let frontFile: string | null = null;
        let backFile: string | null = null;
        const backAsset = getBackForCard(card);

        if (digitalIncludeFronts) {
          const frontSurface = await imageToCardSurface(card.front, cardSize.width, cardSize.height, fitMode, "#ffffff", digitalPixelWidth);
          frontFile = `${folderPreset.fronts}/${baseName}.png`;
          await zip.file(frontFile, dataUrlToBlob(frontSurface));
        }

        if (digitalIncludeBacks && backAsset) {
          const backSurface = await imageToCardSurface(backAsset, cardSize.width, cardSize.height, fitMode, "#ffffff", digitalPixelWidth);
          backFile = `${folderPreset.backs}/${baseName}_back.png`;
          await zip.file(backFile, dataUrlToBlob(backSurface));
        }

        const cardManifest = {
          id: card.id,
          index: index + 1,
          name: card.name,
          slug: baseName,
          exportTarget: digitalExportTarget,
          widthPx: digitalPixelWidth,
          heightPx: digitalPixelHeight,
          widthMm: cardSize.width,
          heightMm: cardSize.height,
          frontFile,
          backFile,
          hasBack: Boolean(backAsset),
          sourceFrontName: card.front.name,
          sourceBackName: backAsset?.name ?? null
        };

        manifestCards.push(cardManifest);

        if (digitalIncludeMetadata) {
          await zip.file(`${folderPreset.cardData}/${baseName}.json`, JSON.stringify(cardManifest, null, 2));
        }
      }

      if (digitalIncludeMetadata) {
        const exportManifest = {
          app: "ProxySheet Studio",
          version: "0.7.0",
          type: "digital-card-pack",
          createdAt: new Date().toISOString(),
          exportTarget: digitalExportTarget,
          packName: safePackName,
          dpi: digitalDpi,
          fitMode,
          includeFronts: digitalIncludeFronts,
          includeBacks: digitalIncludeBacks,
          includeMetadata: digitalIncludeMetadata,
          cardSizeMm: { width: cardSize.width, height: cardSize.height },
          cardSizePx: { width: digitalPixelWidth, height: digitalPixelHeight },
          cards: manifestCards
        };

        await zip.file(`${folderPreset.rootData}/cards.json`, JSON.stringify(manifestCards, null, 2));
        await zip.file(`${folderPreset.rootData}/manifest.json`, JSON.stringify(exportManifest, null, 2));
      }

      const blob = zip.generateBlob();
      triggerDownload(blob, `${safePackName}.zip`);
      setStatus(`Digital asset pack exported: ${cards.length} card(s) at ${digitalPixelWidth} x ${digitalPixelHeight}px with ${digitalExportTarget} folders.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Digital export failed.");
    }
  }

  function saveProject() {
    const project = {
      cards,
      selectedIds,
      pagePreset,
      cardPreset,
      customCardWidth,
      customCardHeight,
      margin,
      gap,
      copies,
      fitMode,
      showCutLines,
      duplexMirror,
      exportSide,
      previewSide,
      backMode,
      singleBack,
      backLibrary,
      chosenBackId,
      generatedBackText,
      generatedBackAccent,
      generatedBackBg,
      editor,
      templatePresetId,
      editorImage,
      editorFrameOverlay,
      editorTextBoxImage,
      activeTemplateElement,
      icons,
      digitalExportTarget,
      digitalDpi,
      digitalPackName,
      digitalIncludeFronts,
      digitalIncludeBacks,
      digitalIncludeMetadata
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "proxysheet-project.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Project saved.");
  }

  async function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      setCards(Array.isArray(data.cards) ? data.cards : []);
      setSelectedIds(Array.isArray(data.selectedIds) ? data.selectedIds : []);
      setPagePreset(data.pagePreset ?? "letter");
      setCardPreset(data.cardPreset ?? "tcg");
      setCustomCardWidth(data.customCardWidth ?? 63);
      setCustomCardHeight(data.customCardHeight ?? 88);
      setMargin(data.margin ?? 10);
      setGap(data.gap ?? 2);
      setCopies(data.copies ?? 1);
      setFitMode(data.fitMode ?? "cover");
      setShowCutLines(data.showCutLines ?? true);
      setDuplexMirror(data.duplexMirror ?? true);
      setExportSide(data.exportSide ?? "duplex");
      setPreviewSide(data.previewSide ?? "fronts");
      setBackMode(data.backMode ?? "generated");
      setSingleBack(data.singleBack);
      setBackLibrary(Array.isArray(data.backLibrary) ? data.backLibrary : []);
      setChosenBackId(data.chosenBackId ?? "generated-back");
      setGeneratedBackText(data.generatedBackText ?? "PROXY");
      setGeneratedBackAccent(data.generatedBackAccent ?? "#7c3aed");
      setGeneratedBackBg(data.generatedBackBg ?? "#111827");
      setEditor({ ...DEFAULT_CARD_EDITOR, ...(data.editor ?? {}), templateLayout: { ...DEFAULT_TEMPLATE_LAYOUT, ...((data.editor ?? {}).templateLayout ?? {}) } });
      setTemplatePresetId(data.templatePresetId ?? "standardAbove");
      setEditorImage(data.editorImage);
      setEditorFrameOverlay(data.editorFrameOverlay);
      setEditorTextBoxImage(data.editorTextBoxImage);
      setActiveTemplateElement(data.activeTemplateElement ?? "title");
      setIcons(Array.isArray(data.icons) ? data.icons : []);
      setDigitalExportTarget(data.digitalExportTarget ?? "unity");
      setDigitalDpi(data.digitalDpi ?? 300);
      setDigitalPackName(data.digitalPackName ?? "proxysheet-studio-digital-pack");
      setDigitalIncludeFronts(data.digitalIncludeFronts ?? true);
      setDigitalIncludeBacks(data.digitalIncludeBacks ?? true);
      setDigitalIncludeMetadata(data.digitalIncludeMetadata ?? true);
      setStatus(`Loaded project: ${file.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load project.");
    } finally {
      event.target.value = "";
    }
  }

  function setEditorField<K extends keyof CardEditor>(key: K, value: CardEditor[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
  }

  function setTemplateLayout(layout: TemplateLayout) {
    setEditor((current) => ({ ...current, templateLayout: cloneTemplateLayout(layout) }));
  }

  function applyTemplatePreset(presetId: string) {
    const preset = CARD_TEMPLATE_PRESETS.find((item) => item.id === presetId) ?? CARD_TEMPLATE_PRESETS[0];
    setTemplatePresetId(preset.id);
    setEditor((current) => ({
      ...current,
      ...preset.editor,
      templateLayout: cloneTemplateLayout(preset.layout)
    }));
    setActiveTemplateElement("title");
    setStatus(`Applied template preset: ${preset.label}. These are editable, unofficial layout approximations with no logos or exact card frames.`);
  }

  function updateTemplateElement(key: TemplateElementKey, patch: Partial<TemplateRect>) {
    setEditor((current) => {
      const currentLayout = current.templateLayout ?? DEFAULT_TEMPLATE_LAYOUT;
      const currentRect = currentLayout[key] ?? DEFAULT_TEMPLATE_LAYOUT[key];
      return {
        ...current,
        templateLayout: {
          ...currentLayout,
          [key]: clampRect({ ...currentRect, ...patch })
        }
      };
    });
  }

  function nudgeTemplateElement(key: TemplateElementKey, dx: number, dy: number) {
    const rect = editor.templateLayout[key];
    updateTemplateElement(key, { x: rect.x + dx, y: rect.y + dy });
  }

  function resizeTemplateElement(key: TemplateElementKey, dw: number, dh: number) {
    const rect = editor.templateLayout[key];
    updateTemplateElement(key, { w: rect.w + dw, h: rect.h + dh });
  }

  function startTemplateDrag(event: ReactPointerEvent<HTMLElement>, key: TemplateElementKey, mode: TemplateDragMode) {
    event.preventDefault();
    event.stopPropagation();
    setActiveTemplateElement(key);
    const board = event.currentTarget.closest(".template-board") as HTMLElement | null;
    if (!board) return;
    const boardRect = board.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = { ...editor.templateLayout[key] };

    const onMove = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / boardRect.width) * 100;
      const dy = ((moveEvent.clientY - startY) / boardRect.height) * 100;
      if (mode === "move") updateTemplateElement(key, { x: startRect.x + dx, y: startRect.y + dy });
      else updateTemplateElement(key, { w: startRect.w + dx, h: startRect.h + dy });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function duplicateCards(target: "selected" | "all" | CardItem) {
    const sourceCards = typeof target === "object"
      ? [target]
      : target === "selected"
        ? cards.filter((card) => selectedIds.includes(card.id))
        : cards;
    if (!sourceCards.length) {
      setStatus(target === "selected" ? "Select cards to duplicate first." : "No cards to duplicate.");
      return;
    }
    const duplicates = sourceCards.map((card) => ({
      ...card,
      id: uid(),
      name: `${card.name} copy`
    }));
    setCards((current) => [...current, ...duplicates]);
    setSelectedIds(duplicates.map((card) => card.id));
    setStatus(`Duplicated ${duplicates.length} card(s). The copies are selected so you can assign different backs.`);
  }

  function insertIconToken(token: string, target: "rules" | "costText") {
    const iconToken = `[icon:${token}]`;
    setEditor((current) => ({
      ...current,
      [target]: `${current[target]}${current[target].endsWith(" ") || !current[target] ? "" : " "}${iconToken}`
    }));
  }

  const pageRatio = page.height / page.width;
  const gridStyle = {
    aspectRatio: `${page.width} / ${page.height}`,
    gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
    gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
    gap: `${Math.max(2, gap * 1.8)}px`
  };

  return (
    <main className="app-shell">
      <header className="hero compact-hero">
        <div>
          <p className="eyebrow">ProxySheet Studio</p>
          <h1>Printable card sheets.</h1>
        </div>
        <div className="hero-actions">
          <span className="top-status">{status}</span>
          <button onClick={saveProject} disabled={!cards.length && !icons.length}>Save</button>
          <button onClick={() => projectInputRef.current?.click()}>Load</button>
          <button onClick={() => void exportDigitalPack()} disabled={!cards.length}>Export assets</button>
          <button className="primary" onClick={() => void exportPdf()}>Export PDF</button>
          <input ref={projectInputRef} className="hidden-input" type="file" accept="application/json" onChange={loadProject} />
        </div>
      </header>

      <section className="dashboard">
        <aside className="panel controls">
          <h2>1. Import fronts</h2>
          <div className="drop-zone" onDrop={onDropFronts} onDragOver={(event) => event.preventDefault()} onClick={() => frontInputRef.current?.click()}>
            <strong>Drop card fronts</strong>
            <span>PNG/JPG/WebP. New imports are selected automatically.</span>
            <input ref={frontInputRef} type="file" accept="image/*" multiple onChange={(event) => void addFrontFiles(event.target.files ?? [])} />
          </div>
          <div className="quick-start">
            <strong>Beginner flow:</strong>
            <span>1) Import fronts. 2) Select cards. 3) Import or choose a back. 4) Apply chosen back to selected or all.</span>
          </div>

          <h2>2. Layout and export</h2>
          <div className="field-grid compact">
            <label>
              Page
              <select value={pagePreset} onChange={(event) => setPagePreset(event.target.value)}>
                {PAGE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>
            <label>
              Card size
              <select value={cardPreset} onChange={(event) => setCardPreset(event.target.value)}>
                {CARD_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>
            {cardPreset === "custom" && (
              <div className="field-grid two compact">
                <label>Width mm <input type="number" min="10" value={customCardWidth} onChange={(event) => setCustomCardWidth(Number(event.target.value) || 63)} /></label>
                <label>Height mm <input type="number" min="10" value={customCardHeight} onChange={(event) => setCustomCardHeight(Number(event.target.value) || 88)} /></label>
              </div>
            )}
            <div className="field-grid two compact">
              <label>Margin mm <input type="number" min="0" value={margin} onChange={(event) => setMargin(Number(event.target.value) || 0)} /></label>
              <label>Gap mm <input type="number" min="0" value={gap} onChange={(event) => setGap(Number(event.target.value) || 0)} /></label>
            </div>
            <div className="field-grid two compact">
              <label>Copies <input type="number" min="1" max="99" value={copies} onChange={(event) => setCopies(Math.max(1, Number(event.target.value) || 1))} /></label>
              <label>
                Image fit
                <select value={fitMode} onChange={(event) => setFitMode(event.target.value as FitMode)}>
                  <option value="cover">Cover / crop to card</option>
                  <option value="contain">Contain / preserve full image</option>
                </select>
              </label>
            </div>
            <label>
              Export
              <select value={exportSide} onChange={(event) => setExportSide(event.target.value as ExportSide)}>
                <option value="duplex">Fronts + backs</option>
                <option value="fronts">Fronts only</option>
                <option value="backs">Backs only</option>
              </select>
            </label>
            <div className="check-row">
              <label><input type="checkbox" checked={showCutLines} onChange={(event) => setShowCutLines(event.target.checked)} /> Cut guides</label>
              <label><input type="checkbox" checked={duplexMirror} onChange={(event) => setDuplexMirror(event.target.checked)} /> Mirror backs for duplex</label>
            </div>
          </div>

          <h2>3. Digital asset export</h2>
          <p className="muted tight">Export game-ready card assets as a zip for generic use, Unity, or Godot. The pack includes consistent PNG sizes plus JSON metadata.</p>
          <div className="field-grid compact">
            <label>
              Pack name
              <input value={digitalPackName} onChange={(event) => setDigitalPackName(event.target.value)} placeholder="my-card-pack" />
            </label>
            <label>
              Target
              <select value={digitalExportTarget} onChange={(event) => setDigitalExportTarget(event.target.value as DigitalExportTarget)}>
                <option value="generic">Generic folders</option>
                <option value="unity">Unity-friendly folders</option>
                <option value="godot">Godot-friendly folders</option>
              </select>
            </label>
            <div className="field-grid two compact">
              <label>DPI / render size <input type="number" min="72" max="1200" value={digitalDpi} onChange={(event) => setDigitalDpi(Math.max(72, Number(event.target.value) || 300))} /></label>
              <label>Output size <input value={`${digitalPixelWidth} x ${digitalPixelHeight}px`} readOnly /></label>
            </div>
            <div className="check-row">
              <label><input type="checkbox" checked={digitalIncludeFronts} onChange={(event) => setDigitalIncludeFronts(event.target.checked)} /> Front PNGs</label>
              <label><input type="checkbox" checked={digitalIncludeBacks} onChange={(event) => setDigitalIncludeBacks(event.target.checked)} /> Back PNGs</label>
              <label><input type="checkbox" checked={digitalIncludeMetadata} onChange={(event) => setDigitalIncludeMetadata(event.target.checked)} /> JSON metadata</label>
            </div>
            <div className="quick-start">
              <strong>Folder preset:</strong>
              <span>{digitalExportTarget === "unity" ? "Cards / Backs / Data" : digitalExportTarget === "godot" ? "textures/cards / textures/backs / data" : "cards / backs / data"}</span>
            </div>
            <button className="primary" disabled={!cards.length} onClick={() => void exportDigitalPack()}>Export digital pack (.zip)</button>
          </div>

          <h2>4. Backs</h2>
          <p className="muted tight">Importing backs now keeps your card selection. A single imported back auto-applies to selected cards; if nothing is selected, it applies to all cards.</p>
          <div className="segmented">
            {(["none", "single", "matched", "generated"] as BackMode[]).map((mode) => {
              const labels: Record<BackMode, string> = { none: "Off", single: "Shared", matched: "Per-card", generated: "Generated" };
              return <button key={mode} className={backMode === mode ? "active" : ""} onClick={() => setBackMode(mode)}>{labels[mode]}</button>;
            })}
          </div>
          <div className="button-row">
            <button onClick={() => singleBackInputRef.current?.click()}>Import one back</button>
            <button onClick={() => backInputRef.current?.click()}>Import named backs</button>
          </div>
          <input ref={singleBackInputRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => void chooseSingleBack(event.target.files)} />
          <input ref={backInputRef} className="hidden-input" type="file" accept="image/*" multiple onChange={(event) => void addMatchedBackFiles(event.target.files ?? [])} />
          <div className="drop-zone small" onDrop={onDropBacks} onDragOver={(event) => event.preventDefault()} onClick={() => backInputRef.current?.click()}>
            <strong>Drop matched backs</strong>
            <span>Back files now stay in a library and can auto-match fronts imported later.</span>
          </div>
          {backMode === "generated" && (
            <div className="field-grid compact">
              <label>Back text <input value={generatedBackText} onChange={(event) => setGeneratedBackText(event.target.value)} /></label>
              <div className="field-grid two compact">
                <label>Accent <input type="color" value={generatedBackAccent} onChange={(event) => setGeneratedBackAccent(event.target.value)} /></label>
                <label>Background <input type="color" value={generatedBackBg} onChange={(event) => setGeneratedBackBg(event.target.value)} /></label>
              </div>
            </div>
          )}
          <div className="chosen-back-bar">
            <span>Chosen back:</span>
            <strong>{chosenBack?.name ?? "None"}</strong>
          </div>
          <div className="button-row compact-buttons">
            <button disabled={!selectedIds.length} onClick={() => applyChosenBack("selected")}>Apply chosen to selected</button>
            <button disabled={!cards.length} onClick={() => applyChosenBack("all")}>Apply chosen to all</button>
            <button disabled={!selectedIds.length} onClick={() => clearBacks("selected")}>Clear selected backs</button>
            <button disabled={!cards.length} onClick={() => clearBacks("all")}>Clear all backs</button>
          </div>
          <div className="back-gallery selectable">
            {backOptions.map((back) => (
              <button className={`back-thumb ${chosenBack?.id === back.id ? "chosen" : ""}`} key={back.id} onClick={() => setChosenBackId(back.id)} title={`Choose ${back.name}`}>
                <img src={back.dataUrl} alt={back.name} />
                <span>{back.name}</span>
                {chosenBack?.id === back.id && <small>chosen</small>}
              </button>
            ))}
          </div>

          <div className="stats-card">
            <span>{cards.length} unique card(s)</span>
            <span>{selectedIds.length} selected</span>
            <span>{repeatedCards.length} total print slot(s)</span>
            <span>{layout.columns} x {layout.rows} per sheet</span>
            <span>{layout.pages} front sheet(s)</span>
          </div>
        </aside>

        <section className="panel preview-panel">
          <div className="panel-header">
            <div>
              <h2>Sheet preview</h2>
              <p>Toggle front/back preview. Click any slot or mini-card to select it.</p>
            </div>
            <span className="status-pill">{selectedIds.length} selected • {cards.length} cards</span>
          </div>

          <div className="preview-toolbar">
            <div className="segmented two-tabs">
              <button className={previewSide === "fronts" ? "active" : ""} onClick={() => setPreviewSide("fronts")}>Fronts</button>
              <button className={previewSide === "backs" ? "active" : ""} onClick={() => setPreviewSide("backs")}>Backs</button>
            </div>
            <div className="button-row">
              <button disabled={!cards.length} onClick={selectAll}>Select all</button>
              <button disabled={!selectedIds.length} onClick={clearSelection}>Clear selection</button>
              <button disabled={!selectedIds.length} onClick={() => duplicateCards("selected")}>Duplicate selected</button>
              <button disabled={!selectedIds.length} onClick={removeSelected}>Remove selected</button>
              <button disabled={!cards.length} onClick={clearAll}>Clear all</button>
            </div>
          </div>

          {selectedCards.length > 0 && (
            <div className="selection-strip">
              <strong>Selected:</strong>
              <span>{selectedCards.slice(0, 5).map((card) => card.name).join(", ")}{selectedCards.length > 5 ? ` +${selectedCards.length - 5} more` : ""}</span>
            </div>
          )}

          <div className="sheet-wrap">
            <div className="sheet" style={{ ...gridStyle, maxHeight: `${Math.min(720, 900 * pageRatio)}px` }}>
              {Array.from({ length: layout.perPage }).map((_, index) => {
                const card = previewCards[index];
                const image = card ? (previewSide === "fronts" ? card.front : getBackForCard(card)) : undefined;
                const selected = Boolean(card && selectedIds.includes(card.id));
                return (
                  <button
                    className={`slot fit-${fitMode} ${selected ? "selected" : ""}`}
                    key={index}
                    onClick={() => card && toggleSelection(card.id)}
                    title={card?.name ?? "Empty slot"}
                  >
                    {image ? <img src={image.dataUrl} alt={card?.name ?? "card"} /> : card ? <span>No back</span> : <span>Empty</span>}
                    {card && <em className="slot-number">{index + 1}</em>}
                    {selected && <strong className="selected-badge">✓</strong>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-list">
            {cards.map((card) => {
              const back = getBackForCard(card);
              const selected = selectedIds.includes(card.id);
              return (
                <div key={card.id} role="button" tabIndex={0} className={`mini-card ${selected ? "selected" : ""}`} onClick={() => toggleSelection(card.id)} onKeyDown={(event) => event.key === "Enter" && toggleSelection(card.id)}>
                  <div className="mini-pair">
                    <img src={card.front.dataUrl} alt={card.name} />
                    {back ? <img src={back.dataUrl} alt={`${card.name} back`} /> : <span>No back</span>}
                  </div>
                  <span>{card.name}</span>
                  <em>{card.back ? "per-card back" : back ? backMode : "front only"}</em>
                  <small className="mini-actions" onClick={(event) => event.stopPropagation()}>
                    <button onClick={() => duplicateCards(card)}>Duplicate</button>
                  </small>
                  {selected && <b>selected</b>}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="panel creator">
          <h2>4. Template card builder</h2>
          <p className="muted">Simple by default: title starts at the top, art goes in the middle, rules go near the bottom. Switch to placement mode when you want to move or resize those areas.</p>

          <div className="field-grid compact">
            <details open>
              <summary>Template presets</summary>
              <p className="muted tight">Popular TCG-inspired presets are layout approximations only. They do not include official logos, exact frames, or copyrighted card art.</p>
              <div className="template-pack-grid">
                {CARD_TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`template-pack-card ${templatePresetId === preset.id ? "active" : ""}`}
                    onClick={() => applyTemplatePreset(preset.id)}
                    title={preset.description}
                  >
                    <span className="template-mini-preview" aria-hidden="true">
                      {TEMPLATE_ELEMENTS.map((element) => {
                        const rect = preset.layout[element.key];
                        return <i key={element.key} className={`mini-${element.key}`} style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }} />;
                      })}
                    </span>
                    <strong>{preset.label}</strong>
                    <em>{preset.family}</em>
                    <small>{preset.description}</small>
                  </button>
                ))}
              </div>
            </details>

            <div className="field-grid two compact">
              <label>
                Layout
                <select value={editor.layoutMode} onChange={(event) => setEditorField("layoutMode", event.target.value as CardLayoutMode)}>
                  <option value="standard">Standard art box</option>
                  <option value="fullArt">Full art</option>
                </select>
              </label>
              <label>
                Art fit
                <select value={editor.artFit} onChange={(event) => setEditorField("artFit", event.target.value as FitMode)}>
                  <option value="cover">Cover / crop</option>
                  <option value="contain">Contain</option>
                </select>
              </label>
            </div>

            <label>Title <input value={editor.title} onChange={(event) => setEditorField("title", event.target.value)} /></label>
            <label>Type line <input value={editor.typeLine} onChange={(event) => setEditorField("typeLine", event.target.value)} /></label>
            <label>Cost icons/images <input value={editor.costText} placeholder="Example: [icon:mana] [icon:fire]" onChange={(event) => setEditorField("costText", event.target.value)} /></label>
            <div className="field-grid two compact">
              <label>Cost label/text <input value={editor.costLabel} placeholder="Example: 2, X, Tap" onChange={(event) => setEditorField("costLabel", event.target.value)} /></label>
              <label>
                Label placement
                <select value={editor.costLabelPlacement} onChange={(event) => setEditorField("costLabelPlacement", event.target.value as CostLabelPlacement)}>
                  <option value="inline">Next to icon row</option>
                  <option value="overlay">On top of first icon</option>
                </select>
              </label>
            </div>
            <div className="field-grid two compact">
              <label>
                Cost/icon alignment
                <select value={editor.costAlign} onChange={(event) => setEditorField("costAlign", event.target.value as CostAlign)}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>Icon size <input type="number" min="18" max="72" value={editor.costIconSize} onChange={(event) => setEditorField("costIconSize", Number(event.target.value) || 36)} /></label>
            </div>
            <label>Rules text <textarea rows={6} value={editor.rules} onChange={(event) => setEditorField("rules", event.target.value)} /></label>
            <div className="field-grid two compact">
              <label>Left stat <input value={editor.statLeft} onChange={(event) => setEditorField("statLeft", event.target.value)} /></label>
              <label>Right stat <input value={editor.statRight} onChange={(event) => setEditorField("statRight", event.target.value)} /></label>
            </div>
            <label>Footer <input value={editor.footer} onChange={(event) => setEditorField("footer", event.target.value)} /></label>

            <div className="check-row horizontal">
              <label><input type="checkbox" checked={editor.showTitleBar} onChange={(event) => setEditorField("showTitleBar", event.target.checked)} /> Title bar</label>
              <label><input type="checkbox" checked={editor.showTypeBar} onChange={(event) => setEditorField("showTypeBar", event.target.checked)} /> Type bar</label>
              <label><input type="checkbox" checked={editor.showStats} onChange={(event) => setEditorField("showStats", event.target.checked)} /> Stats</label>
            </div>

            <details open>
              <summary>Placement mode: move and resize card areas</summary>
              <div className="template-help">Click a box, drag it to move, or drag the corner handle to resize. Presets above reset the layout.</div>
              <div className="template-builder">
                <div className="template-board" aria-label="Card template placement board">
                  {editorImage ? <img className="template-art" src={editorImage.dataUrl} alt="Template art preview" /> : <div className="template-art empty">Card preview</div>}
                  {TEMPLATE_ELEMENTS.map((element) => {
                    const rect = editor.templateLayout[element.key];
                    return (
                      <button
                        key={element.key}
                        className={`template-box ${activeTemplateElement === element.key ? "active" : ""}`}
                        style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
                        onPointerDown={(event) => startTemplateDrag(event, element.key, "move")}
                        onClick={() => setActiveTemplateElement(element.key)}
                        title={`${element.label}: drag to move`}
                      >
                        <span>{element.label}</span>
                        <i onPointerDown={(event) => startTemplateDrag(event, element.key, "resize")} title="Drag to resize" />
                      </button>
                    );
                  })}
                </div>
                <div className="template-inspector">
                  <label>
                    Selected area
                    <select value={activeTemplateElement} onChange={(event) => setActiveTemplateElement(event.target.value as TemplateElementKey)}>
                      {TEMPLATE_ELEMENTS.map((element) => <option key={element.key} value={element.key}>{element.label}</option>)}
                    </select>
                  </label>
                  <p>{TEMPLATE_ELEMENTS.find((element) => element.key === activeTemplateElement)?.hint}</p>
                  <div className="field-grid two compact">
                    <label>X % <input type="number" value={Math.round(editor.templateLayout[activeTemplateElement].x)} onChange={(event) => updateTemplateElement(activeTemplateElement, { x: Number(event.target.value) || 0 })} /></label>
                    <label>Y % <input type="number" value={Math.round(editor.templateLayout[activeTemplateElement].y)} onChange={(event) => updateTemplateElement(activeTemplateElement, { y: Number(event.target.value) || 0 })} /></label>
                    <label>W % <input type="number" value={Math.round(editor.templateLayout[activeTemplateElement].w)} onChange={(event) => updateTemplateElement(activeTemplateElement, { w: Number(event.target.value) || 3 })} /></label>
                    <label>H % <input type="number" value={Math.round(editor.templateLayout[activeTemplateElement].h)} onChange={(event) => updateTemplateElement(activeTemplateElement, { h: Number(event.target.value) || 2 })} /></label>
                  </div>
                  <div className="nudge-grid">
                    <button onClick={() => nudgeTemplateElement(activeTemplateElement, 0, -1)}>↑</button>
                    <button onClick={() => nudgeTemplateElement(activeTemplateElement, -1, 0)}>←</button>
                    <button onClick={() => nudgeTemplateElement(activeTemplateElement, 1, 0)}>→</button>
                    <button onClick={() => nudgeTemplateElement(activeTemplateElement, 0, 1)}>↓</button>
                    <button onClick={() => resizeTemplateElement(activeTemplateElement, -1, 0)}>Narrow</button>
                    <button onClick={() => resizeTemplateElement(activeTemplateElement, 1, 0)}>Wider</button>
                    <button onClick={() => resizeTemplateElement(activeTemplateElement, 0, -1)}>Shorter</button>
                    <button onClick={() => resizeTemplateElement(activeTemplateElement, 0, 1)}>Taller</button>
                  </div>
                </div>
              </div>
            </details>

            <details>
              <summary>Frame, border, and text box controls</summary>
              <div className="field-grid compact after-summary">
                <div className="field-grid three compact">
                  <label>Frame <input type="color" value={editor.frame} onChange={(event) => setEditorField("frame", event.target.value)} /></label>
                  <label>Body <input type="color" value={editor.body} onChange={(event) => setEditorField("body", event.target.value)} /></label>
                  <label>Accent <input type="color" value={editor.accent} onChange={(event) => setEditorField("accent", event.target.value)} /></label>
                </div>
                <div className="field-grid three compact">
                  <label>Outer border <input type="color" value={editor.border} onChange={(event) => setEditorField("border", event.target.value)} /></label>
                  <label>Inner border <input type="color" value={editor.innerBorder} onChange={(event) => setEditorField("innerBorder", event.target.value)} /></label>
                  <label>Title text <input type="color" value={editor.titleColor} onChange={(event) => setEditorField("titleColor", event.target.value)} /></label>
                </div>
                <div className="field-grid three compact">
                  <label>Rules text <input type="color" value={editor.textColor} onChange={(event) => setEditorField("textColor", event.target.value)} /></label>
                  <label>Title box <input type="color" value={editor.titleBox} onChange={(event) => setEditorField("titleBox", event.target.value)} /></label>
                  <label>Rules box <input type="color" value={editor.textBox} onChange={(event) => setEditorField("textBox", event.target.value)} /></label>
                </div>
                <div className="field-grid three compact">
                  <label>Text box opacity <input type="number" min="0" max="100" value={editor.textBoxOpacity} onChange={(event) => setEditorField("textBoxOpacity", Number(event.target.value) || 0)} /></label>
                  <label>Border width <input type="number" min="0" max="70" value={editor.borderWidth} onChange={(event) => setEditorField("borderWidth", Number(event.target.value) || 0)} /></label>
                  <label>Corner radius <input type="number" min="0" max="80" value={editor.cornerRadius} onChange={(event) => setEditorField("cornerRadius", Number(event.target.value) || 0)} /></label>
                </div>
                <div className="asset-pill-row">
                  <button onClick={() => editorFrameOverlayRef.current?.click()}>Import custom border overlay</button>
                  <button onClick={() => editorTextBoxImageRef.current?.click()}>Import rules box background</button>
                  <button disabled={!editorFrameOverlay} onClick={() => setEditorFrameOverlay(undefined)}>Clear border overlay</button>
                  <button disabled={!editorTextBoxImage} onClick={() => setEditorTextBoxImage(undefined)}>Clear rules image</button>
                </div>
                <p className="muted tight">Border overlays are stretched over the full card, so transparent PNG frames work best.</p>
              </div>
            </details>

            <div className="button-row">
              <button onClick={() => editorImageRef.current?.click()}>Choose art</button>
              <button onClick={() => iconInputRef.current?.click()}>Import icons</button>
              <button className="primary" onClick={() => void addEditorCard()}>Add card</button>
            </div>
            <input ref={editorImageRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => void chooseEditorImage(event.target.files)} />
            <input ref={editorFrameOverlayRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => void chooseEditorOverlay(event.target.files, "frame")} />
            <input ref={editorTextBoxImageRef} className="hidden-input" type="file" accept="image/*" onChange={(event) => void chooseEditorOverlay(event.target.files, "textBox")} />
            <input ref={iconInputRef} className="hidden-input" type="file" accept="image/*" multiple onChange={(event) => void addIconFiles(event.target.files)} />
          </div>

          <div className="icon-palette">
            {icons.map((icon) => (
              <div className="icon-chip" key={icon.id} title={`[icon:${icon.token}]`}>
                <img src={icon.dataUrl} alt={icon.name} />
                <span>{icon.token}</span>
                <button onClick={() => insertIconToken(icon.token, "costText")}>cost</button>
                <button onClick={() => insertIconToken(icon.token, "rules")}>text</button>
              </div>
            ))}
            {!icons.length && <p className="muted">Import small mana/cost icons, then insert them into the cost row or rules text.</p>}
          </div>

          <div className="asset-summary">
            <span>Art: <strong>{editorImage?.name ?? "none"}</strong></span>
            <span>Border overlay: <strong>{editorFrameOverlay?.name ?? "none"}</strong></span>
            <span>Rules image: <strong>{editorTextBoxImage?.name ?? "none"}</strong></span>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default App;
