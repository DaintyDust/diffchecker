import type { ViewMode } from "@/features/Diff/components/DiffView";
import type { Precision } from "@/features/Diff/engine";

export type Settings = {
  mode: ViewMode;
  precision: Precision;
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  ignoreRules: string;
  collapse: boolean;
  wrap: boolean;
  /** "none", "auto" or a highlight.js language id. */
  syntax: string;
  realtime: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  mode: "split",
  precision: "smart",
  ignoreWhitespace: false,
  ignoreCase: false,
  ignoreRules: "",
  collapse: true,
  wrap: true,
  syntax: "auto",
  realtime: false,
};

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "auto", label: "Auto-detect" },
  { value: "bash", label: "Bash / Shell" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "go", label: "Go" },
  { value: "graphql", label: "GraphQL" },
  { value: "xml", label: "HTML / XML" },
  { value: "ini", label: "INI / TOML" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "less", label: "Less" },
  { value: "lua", label: "Lua / Luau" },
  { value: "makefile", label: "Makefile" },
  { value: "markdown", label: "Markdown" },
  { value: "objectivec", label: "Objective-C" },
  { value: "perl", label: "Perl" },
  { value: "php", label: "PHP" },
  { value: "powershell", label: "PowerShell" },
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "scss", label: "SCSS" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "typescript", label: "TypeScript" },
  { value: "vbnet", label: "VB.NET" },
  { value: "yaml", label: "YAML" },
];

export type IgnoreRules = { patterns: RegExp[]; errors: string[] };

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One rule per line: `/regex/flags` or plain text. */
export function parseIgnoreRules(source: string): IgnoreRules {
  const patterns: RegExp[] = [];
  const errors: string[] = [];

  for (const raw of source.split("\n")) {
    const rule = raw.trim();
    if (!rule) continue;

    const literal = /^\/(.+)\/([a-z]*)$/i.exec(rule);

    try {
      if (literal) {
        const flags = literal[2].includes("g") ? literal[2] : `${literal[2]}g`;
        const pattern = new RegExp(literal[1], flags);
        // A rule that matches the empty string would hide nothing and loop forever.
        if (pattern.test("")) throw new Error("matches empty text");
        patterns.push(pattern);
      } else {
        patterns.push(new RegExp(escapeRegExp(rule), "g"));
      }
    } catch (error) {
      errors.push(`${rule}: ${error instanceof Error ? error.message : "invalid"}`);
    }
  }

  return { patterns, errors };
}
