"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

type WidgetCanvasProps = {
  children: ReactNode;
  storageKey: string;
};

type WidgetState = {
  order?: string[];
  collapsed?: Record<string, boolean>;
  sizes?: Record<string, { width: number; height: number }>;
};

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
    const zone = document.querySelector("[data-widget-zone]");
    if (!zone) {
      return;
    }
    const widgetZone = zone as HTMLElement;

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

    function saveOrder() {
      const order = Array.from(widgetZone.querySelectorAll<HTMLElement>(":scope > [data-widget-id]"))
        .map((widget) => widget.dataset.widgetId)
        .filter((id): id is string => Boolean(id));
      state.order = order;
      writeState(storageKey, state);
    }

    function saveSize(widget: HTMLElement) {
      const id = widget.dataset.widgetId;
      if (!id) {
        return;
      }

      if (!state.sizes) {
        state.sizes = {};
      }

      state.sizes[id] = {
        width: Math.round(widget.offsetWidth),
        height: Math.round(widget.offsetHeight),
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

    const observers: ResizeObserver[] = [];

    for (const widget of Array.from(widgetZone.querySelectorAll<HTMLElement>(":scope > [data-widget-id]"))) {
      const id = widget.dataset.widgetId;
      if (!id || widget.dataset.widgetEnhanced === "true") {
        continue;
      }

      widget.dataset.widgetEnhanced = "true";
      widget.classList.add("relative", "overflow-auto");
      widget.style.resize = "both";
      widget.style.minHeight = "160px";

      const currentChildren = Array.from(widget.childNodes);
      const body = document.createElement("div");
      body.dataset.widgetBody = "true";
      body.className = "space-y-0";

      const title = widget.dataset.widgetTitle || id;
      const handle = document.createElement("div");
      handle.className = "mb-3 flex cursor-move items-center justify-between rounded-xl border border-stone-300/80 bg-stone-50/90 px-3 py-2";
      handle.draggable = true;
      handle.innerHTML = `<span class=\"text-xs font-semibold uppercase tracking-[0.16em] text-stone-600\">${title}</span>`;

      const controls = document.createElement("div");
      controls.className = "flex items-center gap-2";

      const collapseButton = document.createElement("button");
      collapseButton.type = "button";
      collapseButton.className = "rounded-full border border-stone-300 px-2 py-1 text-[11px] text-stone-700 transition hover:border-stone-500 hover:bg-white";
      collapseButton.textContent = "Collapse";

      controls.appendChild(collapseButton);
      handle.appendChild(controls);

      for (const node of currentChildren) {
        body.appendChild(node);
      }

      widget.appendChild(handle);
      widget.appendChild(body);

      const restoreCollapsed = Boolean(state.collapsed?.[id]);
      if (restoreCollapsed) {
        body.style.display = "none";
        collapseButton.textContent = "Expand";
      }

      collapseButton.addEventListener("click", () => {
        const collapsed = body.style.display !== "none";
        body.style.display = collapsed ? "none" : "";
        collapseButton.textContent = collapsed ? "Expand" : "Collapse";
        saveCollapsed(id, collapsed);
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

      const savedSize = state.sizes?.[id];
      if (savedSize?.width && savedSize?.height) {
        widget.style.width = `${savedSize.width}px`;
        widget.style.height = `${savedSize.height}px`;
      }

      const observer = new ResizeObserver(() => saveSize(widget));
      observer.observe(widget);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [storageKey]);

  return (
    <div data-widget-zone className="grid gap-6">
      {children}
    </div>
  );
}
