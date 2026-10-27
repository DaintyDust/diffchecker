import type { HLJSApi } from "highlight.js";

export type SyntaxToken = { text: string; className: string };
export type SyntaxLines = SyntaxToken[][];

export type SyntaxResult = {
  language: string;
  left: SyntaxLines;
  right: SyntaxLines;
};

// Below this relevance an auto-detected language is most likely prose.
const MIN_AUTO_RELEVANCE = 5;
const MAX_HIGHLIGHT_LENGTH = 500_000;

let hljsPromise: Promise<HLJSApi> | undefined;

function loadHighlighter() {
  hljsPromise ??= Promise.all([import("highlight.js/lib/common"), import("highlight.js/lib/languages/powershell"), import("highlight.js/lib/languages/dockerfile")]).then(([common, powershell, dockerfile]) => {
    const hljs = common.default;
    hljs.registerLanguage("powershell", powershell.default);
    hljs.registerLanguage("dockerfile", dockerfile.default);
    return hljs;
  });
  return hljsPromise;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

function unescape(html: string) {
  return html.replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]);
}

/** Turns highlight.js HTML into per-line token lists, carrying open scopes across line breaks. */
function toLines(html: string): SyntaxLines {
  const lines: SyntaxLines = [[]];
  const stack: string[] = [];
  const tag = /<span class="([^"]*)">|<\/span>|([^<]+)/g;

  for (const match of html.matchAll(tag)) {
    if (match[1] !== undefined) {
      stack.push(match[1]);
    } else if (match[2] !== undefined) {
      const className = stack.join(" ");
      unescape(match[2])
        .split("\n")
        .forEach((text, i) => {
          if (i > 0) lines.push([]);
          if (text) lines[lines.length - 1].push({ text, className });
        });
    } else {
      stack.pop();
    }
  }

  return lines;
}

function languageFromName(hljs: HLJSApi, name: string) {
  const extension = /\.([a-z0-9+#-]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (!extension) return undefined;
  const language = hljs.getLanguage(extension);
  return language ? hljs.listLanguages().find((id) => hljs.getLanguage(id) === language) : undefined;
}

export async function highlightTexts(left: string, right: string, language: string, names: [string, string]): Promise<SyntaxResult | null> {
  if (language === "none" || left.length + right.length > MAX_HIGHLIGHT_LENGTH) return null;

  const hljs = await loadHighlighter();
  const leftText = left.replace(/\r\n?/g, "\n");
  const rightText = right.replace(/\r\n?/g, "\n");

  let resolved = language;
  if (language === "auto") {
    resolved = languageFromName(hljs, names[1]) ?? languageFromName(hljs, names[0]) ?? "";
    if (!resolved) {
      const detected = hljs.highlightAuto(`${leftText}\n${rightText}`.slice(0, 20_000));
      if (!detected.language || detected.relevance < MIN_AUTO_RELEVANCE) return null;
      resolved = detected.language;
    }
  }

  if (!hljs.getLanguage(resolved)) return null;

  const highlight = (text: string) => toLines(hljs.highlight(text, { language: resolved, ignoreIllegals: true }).value);

  return { language: resolved, left: highlight(leftText), right: highlight(rightText) };
}

export function languageLabel(id: string, labels: { value: string; label: string }[]) {
  return labels.find((language) => language.value === id)?.label ?? id;
}
