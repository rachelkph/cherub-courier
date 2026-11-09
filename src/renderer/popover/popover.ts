// The popover: masthead, topic chips, headlines by topic, footer. Text is set
// with textContent only. Reports its natural height so main can anchor it.

import { pixelIcon } from "./icons.ts";

type ViewItem = { key: string; headline: string; source: string; paywall: boolean; note: string | null; opened: boolean };
type View = {
  masthead: string;
  dateLabel: string;
  countLabel: string;
  chips: { id: string; label: string }[];
  filter: string;
  sections: { topic: string; label: string; items: ViewItem[] }[];
  fetchedLabel: string | null;
  empty: null | { title: string; body: string; action: "setup" | "refresh" | null };
  refreshing: boolean;
};

declare global {
  interface Window {
    popover: {
      view(): Promise<View>;
      open(key: string): void;
      filter(id: string): void;
      refresh(): void;
      settings(): void;
      close(): void;
      height(h: number): void;
      onShow(cb: (v: View) => void): void;
      onUpdate(cb: (v: View) => void): void;
      onLayout(cb: (l: { tailX: number; height: number }) => void): void;
    };
  }
}

const LIST_MAX = 430;
const card = document.getElementById("card") as HTMLElement;
const frame = document.getElementById("frame") as HTMLElement;
const root = document.documentElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null) e.append(k);
  return e;
}

function button(cls: string, label: string, onClick: () => void, ...kids: (Node | string)[]): HTMLButtonElement {
  const b = el("button", cls, ...kids);
  b.type = "button";
  if (label) b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

function render(v: View): void {
  const header = el(
    "header",
    undefined,
    el("h1", "masthead", v.masthead),
    el("div", "dateline", `${v.dateLabel} · ${v.countLabel}`),
    el("div", "rules", el("div"), el("div")),
  );
  (header.firstChild as HTMLElement).id = "masthead";
  (header.firstChild as HTMLElement).tabIndex = -1;

  if (!v.empty) {
    const chips = el("div", "chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Show topic");
    for (const c of v.chips) {
      const b = button("chip", "", () => window.popover.filter(c.id), ...(c.id === "all" ? [] : [pixelIcon(c.id)]), c.label);
      b.setAttribute("aria-pressed", String(v.filter === c.id));
      chips.append(b);
    }
    header.append(chips);
  }

  const list = el("div", "list");
  if (v.empty) {
    const box = el("div", "empty", el("div", "title", v.empty.title), el("div", "body", v.empty.body));
    if (v.empty.action === "setup") box.append(button("btn", "", () => window.popover.settings(), "Choose sources"));
    list.append(box);
  } else if (v.sections.length === 0) {
    const label = v.chips.find((c) => c.id === v.filter)?.label ?? "this topic";
    list.append(el("div", "empty", el("div", "body", `Nothing in ${label} right now.`)));
  } else {
    v.sections.forEach((s, i) => {
      const head = el("h2", `section-head${i === 0 ? " first" : ""}`, pixelIcon(s.topic), s.label, el("span", "count", `· ${s.items.length}`));
      list.append(head);
      for (const it of s.items) {
        const meta = el("span", "meta", it.note ? `${it.source} · ${it.note}` : it.source, it.paywall ? el("span", "paywall", "paywall") : null);
        const row = button(`row${it.opened ? " opened" : ""}`, "", () => window.popover.open(it.key), el("span", "headline", it.headline), meta);
        row.title = it.headline;
        list.append(row);
      }
    });
  }

  const refresh = button("btn", "", () => window.popover.refresh(), pixelIcon("refresh"), v.refreshing ? "Refreshing…" : "Refresh");
  refresh.disabled = v.refreshing;
  const footer = el("footer", undefined, el("span", "fetched", v.fetchedLabel ?? ""), refresh, button("btn", "", () => window.popover.settings(), pixelIcon("settings"), "Settings"));

  const scroll = card.querySelector(".list")?.scrollTop ?? 0;
  card.replaceChildren(header, list, footer);
  list.scrollTop = scroll;
  root.style.setProperty("--list-max", `${LIST_MAX}px`);
  reportHeight();
}

// Measured synchronously (reading the size forces layout): a hidden page gets no
// animation frames, so a requestAnimationFrame here would never reopen the popover.
function reportHeight(): void {
  window.popover.height(frame.getBoundingClientRect().height);
}
void document.fonts.ready.then(reportHeight);

window.popover.onShow((v) => {
  render(v);
  (card.querySelector(".list") as HTMLElement | null)?.scrollTo(0, 0);
});
// Keyboard and screen-reader users start at the masthead once the window is shown and focused.
window.addEventListener("focus", () => {
  if (document.activeElement === document.body || document.activeElement === null) (document.getElementById("masthead") as HTMLElement | null)?.focus();
});
window.popover.onUpdate((v) => render(v));
window.popover.onLayout(({ tailX, height }) => {
  root.style.setProperty("--tail-x", `${tailX}px`);
  // If the screen is too short, shrink the list so the whole popover fits.
  const natural = frame.getBoundingClientRect().height;
  if (height < natural) {
    const list = card.querySelector(".list") as HTMLElement | null;
    if (list) root.style.setProperty("--list-max", `${Math.max(80, list.getBoundingClientRect().height - (natural - height))}px`);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.popover.close();
});

// Initial content so the first show is instant.
render(await window.popover.view());
