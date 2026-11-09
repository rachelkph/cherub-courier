// First-run setup: welcome, topics, sources (approve), schedule, meet the cat.
// All text from sources and feeds is set with textContent, never as HTML.

type SourceView = {
  id: string;
  name: string;
  description: string;
  topics: string[];
  paywall: "yes" | "no" | "unknown";
  unofficial: boolean;
  recommended: boolean;
  ratings: { rater: string; label: string; asOf: string; evidenceUrl: string }[];
};
type Model = {
  topics: { id: string; label: string; recommendedCount: number }[];
  defaultTopics: string[];
  sources: SourceView[];
  settings: {
    topics: string[];
    customTopics: { id: string; label: string }[];
    keywords: string[];
    approvedSourceIds: string[];
    editionTimes: { morning: string; evening: string };
    launchAtLogin: boolean;
    customSources: { feedUrl: string; name: string; topic: string }[];
  };
};
type LinkCheck =
  | { kind: "feed"; feedUrl: string; title: string; latestHeadline: string | null; discovered: boolean }
  | { kind: "none"; message: string }
  | { kind: "invalid"; message: string };

declare global {
  interface Window {
    setup: {
      model(): Promise<Model>;
      checkLink(input: string): Promise<LinkCheck>;
      finish(payload: unknown): Promise<{ fetching: boolean }>;
      skip(): Promise<void>;
      openRater(url: string): Promise<void>;
      close(): Promise<void>;
    };
  }
}

const app = document.getElementById("app") as HTMLElement;
const model = await window.setup.model();

const state = {
  step: 1,
  topics: new Set(model.settings.topics.length ? model.settings.topics : model.defaultTopics),
  // Topics the user typed. `key` stands for the topic in this page; main assigns the real id.
  customTopics: model.settings.customTopics.map((t) => ({ key: t.id, label: t.label })),
  newTopic: { value: "", error: "" },
  keywords: model.settings.keywords.join(", "),
  mode: "recommended" as "recommended" | "custom",
  checked: new Set<string>(model.settings.approvedSourceIds),
  custom: model.settings.customSources.map((c) => ({ ...c })),
  times: { ...model.settings.editionTimes },
  launchAtLogin: model.settings.launchAtLogin,
  fetching: false,
  pasted: { value: "", busy: false, result: null as LinkCheck | null, topic: "" },
};
const freshInstall = model.settings.approvedSourceIds.length === 0 && model.settings.customSources.length === 0;
if (freshInstall) for (const s of model.sources) if (s.recommended) state.checked.add(s.id);
// Re-running setup with hand-picked sources: show the full list, not just recommended.
if (model.settings.approvedSourceIds.some((id) => !model.sources.find((s) => s.id === id)?.recommended)) state.mode = "custom";

// --- tiny DOM helper ---------------------------------------------------------

type Attrs = Record<string, string | boolean | ((e: Event) => void)>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
    else if (typeof v === "boolean") {
      if (v) el.setAttribute(k, "");
    } else el.setAttribute(k, v);
  }
  for (const kid of kids) if (kid !== null && kid !== false) el.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
  return el;
}

// "18:00" -> the Mac's own style, e.g. "6:00 PM".
function clock(hhmm: string): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, hh, mm).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const MAX_TOPIC_LABEL = 24;
const allTopics = () => [...model.topics.map((t) => ({ key: t.id, label: t.label, own: false })), ...state.customTopics.map((t) => ({ ...t, own: true }))];
const label = (key: string) => allTopics().find((t) => t.key === key)?.label ?? key;
const isOwn = (key: string) => state.customTopics.some((t) => t.key === key);
const pickedTopics = () => allTopics().filter((t) => state.topics.has(t.key)).map((t) => t.key);
const TOTAL = 5;

function frame(title: string, body: Node[], foot: Node[]): HTMLElement {
  return h(
    "section",
    { class: "screen", "aria-labelledby": "screen-title" },
    h("header", { class: "head" }, h("h1", { class: "masthead", id: "screen-title", tabindex: "-1" }, title), h("div", { class: "step" }, `Step ${state.step} of ${TOTAL}`), h("div", { class: "rule" })),
    h("div", { class: "body" }, ...body),
    h("footer", { class: "foot" }, ...foot),
  );
}

function go(step: number): void {
  state.step = step;
  render();
  (app.querySelector("h1") as HTMLElement | null)?.focus?.();
}

// --- walking cat on the welcome screen ----------------------------------------

let catTimer: number | undefined;
function walkingCat(): HTMLImageElement {
  const img = h("img", { class: "cat", alt: "The news cat, walking", src: "app://newscat/assets/walk/walk_0.png" });
  let f = 0;
  window.clearInterval(catTimer);
  catTimer = window.setInterval(() => {
    f = (f + 1) % 4;
    img.src = `app://newscat/assets/walk/walk_${f}.png`;
  }, 140);
  return img;
}

// --- screens -------------------------------------------------------------------

function welcome(): HTMLElement {
  return frame(
    "Hello from the news cat",
    [
      walkingCat(),
      h("p", { class: "lead" }, "Twice a day I bring you a few headlines from sources you pick. If you leave them, I curl up on the pile."),
      h("p", { class: "note" }, "Everything stays on this Mac: no account, no tracking, no AI. The only things I download are the news feeds you choose."),
    ],
    [h("button", { class: "link", type: "button", onclick: () => void skip() }, "Skip setup"), h("span", { class: "spacer" }), h("button", { class: "primary", type: "button", onclick: () => go(2) }, "Get started")],
  );
}

function addTopic(): void {
  const text = state.newTopic.value.replace(/\s+/g, " ").trim();
  if (!text) return;
  const existing = allTopics().find((t) => t.label.toLowerCase() === text.toLowerCase());
  if (existing) {
    state.topics.add(existing.key); // typing a topic that exists just picks it
    state.newTopic = { value: "", error: "" };
  } else if (text.length > MAX_TOPIC_LABEL) state.newTopic.error = `Keep it to ${MAX_TOPIC_LABEL} characters or fewer.`;
  else {
    const key = `new:${text.toLowerCase()}`;
    state.customTopics.push({ key, label: text });
    state.topics.add(key);
    state.newTopic = { value: "", error: "" };
  }
  render();
  (document.getElementById("new-topic") as HTMLInputElement | null)?.focus({ preventScroll: true });
}

function topics(): HTMLElement {
  const chips = allTopics().map((t) =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        "aria-pressed": String(state.topics.has(t.key)),
        onclick: () => {
          if (state.topics.has(t.key)) state.topics.delete(t.key);
          else state.topics.add(t.key);
          render();
        },
      },
      t.label,
    ),
  );
  const own = h("input", { type: "text", id: "new-topic", value: state.newTopic.value, maxlength: String(MAX_TOPIC_LABEL + 10), placeholder: "e.g. Formula 1", "aria-describedby": "new-topic-help" });
  own.addEventListener("input", () => {
    state.newTopic.value = own.value;
  });
  own.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTopic();
  });
  const kw = h("input", { type: "text", id: "keywords", value: state.keywords, placeholder: "e.g. synthesizers, open source", "aria-describedby": "kw-help" });
  kw.addEventListener("input", () => {
    state.keywords = kw.value;
  });
  return frame(
    "Pick your topics",
    [
      h("p", {}, "Choose what you want to hear about. You can change this later."),
      h("div", { class: "chips", role: "group", "aria-label": "Topics" }, ...chips),
      h("label", { class: "field", for: "new-topic" }, "Add your own topic (optional)"),
      h("div", { class: "paste" }, own, h("button", { type: "button", onclick: () => addTopic() }, "Add")),
      state.newTopic.error
        ? h("p", { class: "result", id: "new-topic-help", role: "alert" }, state.newTopic.error)
        : h("p", { class: "note", id: "new-topic-help" }, "On the next screen, paste a site or feed link for it."),
      h("label", { class: "field", for: "keywords" }, "Add keywords (optional)"),
      kw,
      h("p", { class: "note", id: "kw-help" }, "Keywords move matching stories to the top within their topic, from the sources you pick. They never hide other stories and don't find new sources. Separate them with commas."),
    ],
    [
      h("button", { type: "button", onclick: () => go(1) }, "Back"),
      h("span", { class: "spacer" }),
      h("button", { class: "primary", type: "button", disabled: state.topics.size === 0, onclick: () => go(3) }, "Next"),
    ],
  );
}

function sourceRow(s: SourceView): HTMLElement {
  const id = `src-${s.id}`;
  const box = h("input", { type: "checkbox", id, checked: state.checked.has(s.id) });
  box.addEventListener("change", () => {
    if (box.checked) state.checked.add(s.id);
    else state.checked.delete(s.id);
  });
  const ratings = s.ratings.map((r) =>
    h(
      "div",
      { class: "rating" },
      `Rated by ${r.rater}: ${r.label}, ${r.asOf} · `,
      h("button", { class: "link", type: "button", onclick: () => void window.setup.openRater(r.evidenceUrl) }, `see ${r.rater}`),
    ),
  );
  return h(
    "div",
    { class: "row" },
    box,
    h(
      "label",
      { for: id },
      h("span", { class: "name" }, s.name),
      s.paywall === "yes" ? h("span", { class: "tag" }, "paywall") : null,
      s.unofficial ? h("span", { class: "tag plain" }, "unofficial feed") : null,
      h("div", { class: "desc" }, s.description),
      ...ratings,
    ),
  );
}

function pasteBox(): HTMLElement {
  const input = h("input", { type: "url", id: "paste", value: state.pasted.value, placeholder: "Paste an RSS link or a website", "aria-describedby": "paste-result" });
  input.addEventListener("input", () => {
    state.pasted.value = input.value;
  });
  const check = async () => {
    if (!state.pasted.value.trim() || state.pasted.busy) return;
    state.pasted.busy = true;
    state.pasted.result = null;
    render();
    state.pasted.result = await window.setup.checkLink(state.pasted.value);
    state.pasted.topic = "";
    state.pasted.busy = false;
    render();
    (document.getElementById("paste") as HTMLInputElement | null)?.focus({ preventScroll: true });
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void check();
  });

  const r = state.pasted.result;
  let result: HTMLElement | null = null;
  if (state.pasted.busy) result = h("div", { class: "result", id: "paste-result" }, "Checking…");
  else if (r?.kind === "feed") {
    const already = state.custom.some((c) => c.feedUrl === r.feedUrl);
    const select = h(
      "select",
      { "aria-label": "Topic for this feed" },
      h("option", { value: "", disabled: true, selected: state.pasted.topic === "" }, "Choose a topic…"),
      ...pickedTopics().map((t) => h("option", { value: t, selected: t === state.pasted.topic }, label(t))),
    );
    select.addEventListener("change", () => {
      state.pasted.topic = select.value;
      render();
      (document.querySelector("#paste-result .add button") as HTMLButtonElement | null)?.focus({ preventScroll: true });
    });
    result = h(
      "div",
      { class: "result ok", id: "paste-result" },
      h("div", {}, r.discovered ? "Found this site's feed: " : "Feed works: ", h("strong", {}, r.title)),
      r.latestHeadline ? h("div", {}, "Latest: ", h("span", { class: "headline" }, `“${r.latestHeadline}”`)) : h("div", {}, "It has no recent headlines right now."),
      h(
        "div",
        { class: "add" },
        select,
        h(
          "button",
          {
            type: "button",
            disabled: already || state.pasted.topic === "",
            onclick: () => {
              state.custom.push({ feedUrl: r.feedUrl, name: r.title, topic: state.pasted.topic });
              state.pasted = { value: "", busy: false, result: null, topic: "" };
              render();
              [...document.querySelectorAll(".row.own")].at(-1)?.scrollIntoView({ block: "nearest" });
              (document.getElementById("paste") as HTMLInputElement | null)?.focus({ preventScroll: true });
            },
          },
          already ? "Added" : "Add feed",
        ),
      ),
    );
  } else if (r) result = h("div", { class: "result", id: "paste-result", role: "alert" }, r.message);

  return h(
    "div",
    {},
    h("label", { class: "field", for: "paste" }, "Add your own: paste an RSS link or a website"),
    h("div", { class: "paste" }, input, h("button", { type: "button", disabled: state.pasted.busy, onclick: () => void check() }, "Check")),
    result,
    ...state.custom.map((c, i) =>
      h(
        "div",
        { class: "row own" },
        h("span", { class: "name" }, c.name),
        h("span", { class: "desc" }, ` · ${label(c.topic)}`),
        h("span", { class: "spacer" }),
        h(
          "button",
          {
            class: "link",
            type: "button",
            onclick: () => {
              state.custom.splice(i, 1);
              render();
            },
          },
          "Remove",
        ),
      ),
    ),
  );
}

function sources(): HTMLElement {
  const setMode = (m: "recommended" | "custom") => {
    if (m === state.mode) return;
    state.mode = m;
    state.checked = new Set(m === "recommended" ? model.sources.filter((s) => s.recommended).map((s) => s.id) : []);
    render();
  };
  const sections = pickedTopics().map((t) => {
    const list = model.sources.filter((s) => s.topics.includes(t) && (state.mode === "custom" || s.recommended));
    return h(
      "div",
      {},
      h("h2", { class: "topic" }, label(t)),
      ...(list.length
        ? list.map(sourceRow)
        : [
            h(
              "div",
              { class: "empty" },
              isOwn(t)
                ? `Paste a site or feed link below to get ${label(t)} headlines.`
                : `No ${state.mode === "recommended" ? "recommended " : ""}sources for ${label(t)} yet. Paste a feed link below to add one.`,
            ),
          ]),
    );
  });
  const approveLabel = state.mode === "recommended" ? "Approve these sources" : "Use these sources";
  return frame(
    "Choose your sources",
    [
      h(
        "div",
        { class: "tabs", role: "group", "aria-label": "How to choose sources" },
        h("button", { type: "button", "aria-pressed": String(state.mode === "recommended"), onclick: () => setMode("recommended") }, "Recommended"),
        h("button", { type: "button", "aria-pressed": String(state.mode === "custom"), onclick: () => setMode("custom") }, "Customize"),
      ),
      h("p", { class: "callout" }, "No news source is unbiased. These are well-regarded and mixed on purpose. Independent raters sometimes disagree."),
      state.mode === "recommended" ? h("p", { class: "note" }, "Uncheck anything you don't want. Nothing is downloaded until you approve.") : h("p", { class: "note" }, "Check the sources you want, or add your own."),
      ...sections,
      pasteBox(),
    ],
    [
      h("button", { type: "button", onclick: () => go(2) }, "Back"),
      h("span", { class: "spacer" }),
      h("button", { class: "primary", type: "button", onclick: () => go(4) }, approveLabel),
    ],
  );
}

function schedule(): HTMLElement {
  const time = (key: "morning" | "evening", text: string) => {
    const input = h("input", { type: "time", id: `t-${key}`, value: state.times[key], required: true });
    input.addEventListener("change", () => {
      if (/^\d{2}:\d{2}$/.test(input.value)) state.times[key] = input.value;
    });
    return h("div", {}, h("label", { class: "field", for: `t-${key}` }, text), input);
  };
  const login = h("input", { type: "checkbox", id: "login", checked: state.launchAtLogin });
  login.addEventListener("change", () => {
    state.launchAtLogin = login.checked;
  });
  return frame(
    "When should I deliver?",
    [
      h("p", {}, "Two editions a day, in your Mac's time zone. If your Mac is asleep, I'll deliver when it wakes up."),
      h("div", { class: "times" }, time("morning", "Morning edition"), time("evening", "Evening edition")),
      h("label", { class: "check", for: "login" }, login, "Start the cat when my Mac turns on"),
    ],
    [
      h("button", { type: "button", onclick: () => go(3) }, "Back"),
      h("span", { class: "spacer" }),
      h("button", { class: "primary", type: "button", onclick: () => void finish() }, "Finish setup"),
    ],
  );
}

function meet(): HTMLElement {
  const hasSources = state.checked.size > 0 || state.custom.length > 0;
  return frame(
    "Meet the cat",
    [
      h("img", { class: "cat", alt: "The news cat", src: "app://newscat/assets/walk/walk_0.png" }),
      hasSources
        ? h("p", { class: "lead" }, state.fetching ? "Your first edition is on its way. Watch the bottom of your screen." : "All set.")
        : h("p", { class: "lead" }, "No sources picked yet, so I have nothing to deliver. You can choose some anytime."),
      h("p", {}, `I deliver at ${clock(state.times.morning)} and ${clock(state.times.evening)}. Click me to read the headlines.`),
      h("p", { class: "note" }, "To hide me, snooze me, or change these settings, use the cat icon in the menu bar at the top right of your screen."),
    ],
    [h("span", { class: "spacer" }), h("button", { class: "primary", type: "button", onclick: () => void window.setup.close() }, "Done")],
  );
}

async function finish(): Promise<void> {
  const out = await window.setup.finish({
    topics: pickedTopics(),
    customTopics: state.customTopics.filter((t) => state.topics.has(t.key)),
    keywords: state.keywords,
    approvedSourceIds: [...state.checked],
    customSources: state.custom.map(({ feedUrl, topic }) => ({ feedUrl, topic })),
    editionTimes: state.times,
    launchAtLogin: state.launchAtLogin,
  });
  state.fetching = out.fetching;
  go(5);
}

async function skip(): Promise<void> {
  await window.setup.skip();
  await window.setup.close();
}

// Re-rendering the same screen keeps its scroll position (e.g. while adding a
// feed at the bottom of the sources list); moving to another screen starts at the top.
let renderedStep = 0;
function render(): void {
  if (state.step !== 1) window.clearInterval(catTimer);
  const screens = [welcome, topics, sources, schedule, meet];
  const scroll = state.step === renderedStep ? (app.querySelector(".body")?.scrollTop ?? 0) : 0;
  app.replaceChildren(screens[state.step - 1]());
  renderedStep = state.step;
  const body = app.querySelector(".body");
  if (body) body.scrollTop = scroll;
}

render();

export {};
