"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

const GRID_COLUMNS = 12;
const MIN_COLS = 3;
const MIN_ROWS = 1;
const MAX_ROWS = 8;
const ROW_HEIGHT_PX = 84;

type WidgetCanvasProps = {
  children: ReactNode;
  storageKey: string;
};

type WidgetState = {
  order?: string[];
  collapsed?: Record<string, boolean>;
  sizes?: Record<string, { cols: number; rows: number }>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseNumberAttribute(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readState(storageKey: string): WidgetState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as WidgetState;
  } catch {
    return {};
  }
}

function writeState(storageKey: string, state: WidgetState): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore persistence failures.
  }
}

export function WidgetCanvas({ children, storageKey }: WidgetCanvasProps) {
  useEffect(() => {
    const foundZone = document.querySelector<HTMLElement>("[data-widget-zone]");
    if (!foundZone) {
      return;
    }
    const widgetZone: HTMLElement = foundZone;

    const state = readState(storageKey);
    const widgets = Array.from(widgetZone.querySelectorAll<HTMLElement>(":scope > [data-widget-id]"));

    if (widgets.length === 0) {
      return;
    }

    const byId = new Map(widgets.map((widget) => [widget.dataset.widgetId || "", widget]));

    if (state.order && state.order.length > 0) {
      for (const id of state.order) {
        const widget = byId.get(id);
        if (widget) {
          widgetZone.appendChild(widget);
        }
      }
    }

    const dragState: { draggingId: string | null } = { draggingId: null };

    function defaultSize(widget: HTMLElement) {
      return {
        cols: clamp(parseNumberAttribute(widget.dataset.widgetCols, GRID_COLUMNS), MIN_COLS, GRID_COLUMNS),
        rows: clamp(parseNumberAttribute(widget.dataset.widgetRows, 2), MIN_ROWS, MAX_ROWS),
      };
    }

    function applyWidgetSize(widget: HTMLElement, cols: number, rows: number) {
      const snappedCols = clamp(cols, MIN_COLS, GRID_COLUMNS);
      const snappedRows = clamp(rows, MIN_ROWS, MAX_ROWS);
      widget.style.gridColumn = `span ${snappedCols} / span ${snappedCols}`;
      widget.style.gridRow = `span ${snappedRows} / span ${snappedRows}`;
      widget.style.minHeight = `${snappedRows * ROW_HEIGHT_PX}px`;
      widget.dataset.widgetColsCurrent = String(snappedCols);
      widget.dataset.widgetRowsCurrent = String(snappedRows);
    }

    function currentSize(widget: HTMLElement) {
      return {
        cols: parseNumberAttribute(widget.dataset.widgetColsCurrent, defaultSize(widget).cols),
        rows: parseNumberAttribute(widget.dataset.widgetRowsCurrent, defaultSize(widget).rows),
      };
    }

    function saveOrder() {
      const order = Array.from(widgetZone.querySelectorAll<HTMLElement>(":scope > [data-widget-id]"))
        .map((widget) => widget.dataset.widgetId)
        .filter((id): id is string => Boolean(id));
      state.order = order;
      writeState(storageKey, state);
    }

    function saveSize(id: string, cols: number, rows: number) {
      if (!state.sizes) {
        state.sizes = {};
      }
      state.sizes[id] = {
        cols: clamp(cols, MIN_COLS, GRID_COLUMNS),
        rows: clamp(rows, MIN_ROWS, MAX_ROWS),
      };
      writeState(storageKey, state);
    }

    function saveCollapsed(id: string, collapsed: boolean) {
      if (!state.collapsed) {
        state.collapsed = {};
      }
      state.collapsed[id] = collapsed;
      writeState(storageKey, state);
    }

    for (const widget of Array.from(widgetZone.querySelectorAll<HTMLElement>(":scope > [data-widget-id]"))) {
      const id = widget.dataset.widgetId;
      if (!id || widget.dataset.widgetEnhanced === "true") {
        continue;
      }
      const widgetId = id;

      widget.dataset.widgetEnhanced = "true";
      widget.classList.add("relative", "min-w-0", "overflow-hidden");

      const savedSize = state.sizes?.[widgetId];
      const initialSize = {
        cols: savedSize?.cols ?? defaultSize(widget).cols,
        rows: savedSize?.rows ?? defaultSize(widget).rows,
      };
      applyWidgetSize(widget, initialSize.cols, initialSize.rows);

      const currentChildren = Array.from(widget.childNodes);
      const body = document.createElement("div");
      body.dataset.widgetBody = "true";
      body.className = "min-h-0";

      const title = widget.dataset.widgetTitle || id;
      const handle = document.createElement("div");
      handle.className = "mb-2 flex cursor-move items-center justify-between rounded-lg border border-stone-300/80 bg-stone-50/90 px-2.5 py-1.5";
      handle.draggable = true;
      handle.innerHTML = `<span class=\"text-xs font-semibold uppercase tracking-[0.16em] text-stone-600\">${title}</span>`;

      const controls = document.createElement("div");
      controls.className = "flex items-center gap-2";

      const widthDownButton = document.createElement("button");
      widthDownButton.type = "button";
      widthDownButton.className = "rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-500 hover:bg-white";
      widthDownButton.textContent = "W-";

      const widthUpButton = document.createElement("button");
      widthUpButton.type = "button";
      widthUpButton.className = "rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-500 hover:bg-white";
      widthUpButton.textContent = "W+";

      const heightDownButton = document.createElement("button");
      heightDownButton.type = "button";
      heightDownButton.className = "rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-500 hover:bg-white";
      heightDownButton.textContent = "H-";

      const heightUpButton = document.createElement("button");
      heightUpButton.type = "button";
      heightUpButton.className = "rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-500 hover:bg-white";
      heightUpButton.textContent = "H+";

      const sizeLabel = document.createElement("span");
      sizeLabel.className = "rounded-full border border-stone-300 bg-white px-2 py-1 font-mono text-[11px] text-stone-700";
      sizeLabel.textContent = `${initialSize.cols}x${initialSize.rows}`;

      const collapseButton = document.createElement("button");
      collapseButton.type = "button";
      collapseButton.className = "rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-500 hover:bg-white";
      collapseButton.textContent = "Collapse";

      controls.appendChild(widthDownButton);
      controls.appendChild(widthUpButton);
      controls.appendChild(heightDownButton);
      controls.appendChild(heightUpButton);
      controls.appendChild(sizeLabel);
      controls.appendChild(collapseButton);
      handle.appendChild(controls);

      for (const node of currentChildren) {
        body.appendChild(node);
      }

      widget.appendChild(handle);
      widget.appendChild(body);

      const hasSavedCollapsed = typeof state.collapsed?.[id] === "boolean";
      const restoreCollapsed = hasSavedCollapsed ? Boolean(state.collapsed?.[id]) : widget.dataset.widgetCollapsedDefault === "true";
      if (restoreCollapsed) {
        body.style.display = "none";
        collapseButton.textContent = "Expand";
        widget.style.minHeight = "auto";
        widget.style.gridRow = "span 1 / span 1";
      }

      function updateSizeLabel() {
        const size = currentSize(widget);
        sizeLabel.textContent = `${size.cols}x${size.rows}`;
      }

      function resizeWidget(nextCols: number, nextRows: number) {
        applyWidgetSize(widget, nextCols, nextRows);
        saveSize(widgetId, nextCols, nextRows);
        updateSizeLabel();
      }

      widthDownButton.addEventListener("click", () => {
        const size = currentSize(widget);
        resizeWidget(size.cols - 1, size.rows);
      });

      widthUpButton.addEventListener("click", () => {
        const size = currentSize(widget);
        resizeWidget(size.cols + 1, size.rows);
      });

      heightDownButton.addEventListener("click", () => {
        const size = currentSize(widget);
        resizeWidget(size.cols, size.rows - 1);
      });

      heightUpButton.addEventListener("click", () => {
        const size = currentSize(widget);
        resizeWidget(size.cols, size.rows + 1);
      });

      collapseButton.addEventListener("click", () => {
        const collapsed = body.style.display !== "none";
        body.style.display = collapsed ? "none" : "";
        collapseButton.textContent = collapsed ? "Expand" : "Collapse";
        if (collapsed) {
          widget.style.minHeight = "auto";
          widget.style.gridRow = "span 1 / span 1";
        } else {
          const size = state.sizes?.[widgetId] || defaultSize(widget);
          applyWidgetSize(widget, size.cols, size.rows);
          updateSizeLabel();
        }
        saveCollapsed(widgetId, collapsed);
      });

      handle.addEventListener("dragstart", () => {
        dragState.draggingId = id;
        widget.classList.add("opacity-70");
      });

      handle.addEventListener("dragend", () => {
        dragState.draggingId = null;
        widget.classList.remove("opacity-70");
      });

      widget.addEventListener("dragover", (event) => {
        event.preventDefault();
      });

      widget.addEventListener("drop", (event) => {
        event.preventDefault();
        const draggingId = dragState.draggingId;
        if (!draggingId || draggingId === id) {
          return;
        }

        const draggingWidget = widgetZone.querySelector<HTMLElement>(`:scope > [data-widget-id=\"${draggingId}\"]`);
        if (!draggingWidget) {
          return;
        }

        const targetRect = widget.getBoundingClientRect();
        const before = event.clientY < targetRect.top + targetRect.height / 2;
        if (before) {
          widgetZone.insertBefore(draggingWidget, widget);
        } else {
          widgetZone.insertBefore(draggingWidget, widget.nextElementSibling);
        }
        saveOrder();
      });
    }
  }, [storageKey]);

  return (
    <div data-widget-zone className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {children}
    </div>
  );
}
