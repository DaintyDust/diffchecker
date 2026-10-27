import { createTwoFilesPatch, diffArrays, diffChars, diffWordsWithSpace } from "diff";

export type Precision = "smart" | "word" | "char";

export type DiffOptions = {
  ignoreWhitespace: boolean;
  ignoreCase: boolean;
  precision: Precision;
  /** Text matching these patterns is left out of the comparison. */
  ignorePatterns?: RegExp[];
};

export type Segment = {
  text: string;
  changed: boolean;
};

export type Line = {
  no: number;
  text: string;
  segments?: Segment[];
};

export type Row = { type: "equal"; left: Line; right: Line } | { type: "change"; left: Line | null; right: Line | null; hunk: number };

/** 0-based line ranges a change covers on each side; a count of 0 marks an insertion point. */
export type HunkRange = {
  leftStart: number;
  leftCount: number;
  rightStart: number;
  rightCount: number;
};

export type DiffResult = {
  rows: Row[];
  hunks: number;
  hunkRanges: HunkRange[];
  removals: number;
  additions: number;
  leftLines: number;
  rightLines: number;
  identical: boolean;
};

// Intra-line highlighting is skipped for very long lines to keep the diff snappy.
const MAX_INLINE_LENGTH = 4000;

export function splitLines(text: string) {
  if (text === "") return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  // A trailing newline ends the last line rather than starting an empty one.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function normalize(line: string, { ignoreWhitespace, ignoreCase, ignorePatterns = [] }: DiffOptions) {
  let key = line;
  for (const pattern of ignorePatterns) key = key.replace(pattern, "");
  if (ignoreWhitespace) key = key.replace(/\s+/g, " ").trim();
  if (ignoreCase) key = key.toLowerCase();
  return key;
}

type Part = { value: string; added?: boolean; removed?: boolean };

function commonRatio(parts: Part[], a: string, b: string) {
  const common = parts.reduce((sum, part) => (part.added || part.removed ? sum : sum + part.value.length), 0);
  return common / Math.max(a.length, b.length, 1);
}

/**
 * Word-level diff where a replaced word that closely resembles its replacement
 * is refined to character level, e.g. `color` → `colour` only marks the `u`.
 */
function smartDiff(a: string, b: string): Part[] {
  const words = diffWordsWithSpace(a, b);
  const result: Part[] = [];

  for (let i = 0; i < words.length; i++) {
    const part = words[i];
    const next = words[i + 1];

    if (part.removed && next?.added) {
      const chars = diffChars(part.value, next.value);
      if (commonRatio(chars, part.value, next.value) >= 0.5) result.push(...chars);
      else result.push(part, next);
      i++;
    } else {
      result.push(part);
    }
  }

  return result;
}

function ignoredRanges(text: string, patterns: RegExp[]) {
  const ranges: [number, number][] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

/** Splits segments at ignored ranges and marks those pieces as unchanged. */
function maskIgnored(segments: Segment[], ranges: [number, number][]): Segment[] {
  if (!ranges.length) return segments;

  const ignored = (offset: number) => ranges.some(([from, to]) => offset >= from && offset < to);
  const result: Segment[] = [];
  let offset = 0;

  for (const segment of segments) {
    for (const char of segment.text) {
      const changed = segment.changed && !ignored(offset);
      const last = result[result.length - 1];
      if (last && last.changed === changed) last.text += char;
      else result.push({ text: char, changed });
      offset += char.length;
    }
  }

  return result;
}

function inlineSegments(a: string, b: string, options: DiffOptions): [Segment[], Segment[]] | undefined {
  if (a.length + b.length > MAX_INLINE_LENGTH) return undefined;

  // Diff on lowercased copies (when lengths allow) and slice the originals by offset,
  // so common parts always show each side's own text.
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  const foldCase = options.ignoreCase && lowerA.length === a.length && lowerB.length === b.length;
  const sourceA = foldCase ? lowerA : a;
  const sourceB = foldCase ? lowerB : b;

  const parts: Part[] = options.precision === "char" ? diffChars(sourceA, sourceB) : options.precision === "word" ? diffWordsWithSpace(sourceA, sourceB) : smartDiff(sourceA, sourceB);

  const left: Segment[] = [];
  const right: Segment[] = [];
  let ai = 0;
  let bi = 0;

  const push = (list: Segment[], text: string, changed: boolean) => {
    if (!text) return;
    const isChanged = changed && !(options.ignoreWhitespace && text.trim() === "");
    const last = list[list.length - 1];
    if (last && last.changed === isChanged) last.text += text;
    else list.push({ text, changed: isChanged });
  };

  for (const part of parts) {
    const length = part.value.length;

    if (part.removed) {
      push(left, a.slice(ai, ai + length), true);
      ai += length;
    } else if (part.added) {
      push(right, b.slice(bi, bi + length), true);
      bi += length;
    } else {
      push(left, a.slice(ai, ai + length), false);
      push(right, b.slice(bi, bi + length), false);
      ai += length;
      bi += length;
    }
  }

  const patterns = options.ignorePatterns ?? [];
  if (!patterns.length) return [left, right];
  return [maskIgnored(left, ignoredRanges(a, patterns)), maskIgnored(right, ignoredRanges(b, patterns))];
}

export function computeDiff(leftText: string, rightText: string, options: DiffOptions): DiffResult {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const leftKeys = leftLines.map((line) => normalize(line, options));
  const rightKeys = rightLines.map((line) => normalize(line, options));

  const rows: Row[] = [];
  const hunkRanges: HunkRange[] = [];
  let li = 0;
  let ri = 0;
  let hunks = 0;
  let removals = 0;
  let additions = 0;
  let pendingRemoved = 0;
  let pendingAdded = 0;

  const flush = () => {
    if (!pendingRemoved && !pendingAdded) return;

    const hunk = hunks++;
    hunkRanges.push({ leftStart: li, leftCount: pendingRemoved, rightStart: ri, rightCount: pendingAdded });
    const count = Math.max(pendingRemoved, pendingAdded);

    for (let i = 0; i < count; i++) {
      const left: Line | null = i < pendingRemoved ? { no: li + i + 1, text: leftLines[li + i] } : null;
      const right: Line | null = i < pendingAdded ? { no: ri + i + 1, text: rightLines[ri + i] } : null;

      if (left && right) {
        const segments = inlineSegments(left.text, right.text, options);
        if (segments) [left.segments, right.segments] = segments;
      }

      rows.push({ type: "change", left, right, hunk });
    }

    removals += pendingRemoved;
    additions += pendingAdded;
    li += pendingRemoved;
    ri += pendingAdded;
    pendingRemoved = 0;
    pendingAdded = 0;
  };

  for (const change of diffArrays(leftKeys, rightKeys)) {
    const count = change.count ?? change.value.length;

    if (change.removed) {
      pendingRemoved += count;
    } else if (change.added) {
      pendingAdded += count;
    } else {
      flush();
      for (let i = 0; i < count; i++) {
        rows.push({
          type: "equal",
          left: { no: li + 1, text: leftLines[li] },
          right: { no: ri + 1, text: rightLines[ri] },
        });
        li++;
        ri++;
      }
    }
  }

  flush();

  return {
    rows,
    hunks,
    hunkRanges,
    removals,
    additions,
    leftLines: leftLines.length,
    rightLines: rightLines.length,
    identical: hunks === 0,
  };
}

export type ViewItem = { kind: "row"; row: Row; index: number } | { kind: "fold"; start: number; end: number };

/** Hides long runs of unchanged rows, keeping `context` rows around every change. */
export function buildViewItems(rows: Row[], collapse: boolean, context: number, expanded: ReadonlySet<number>): ViewItem[] {
  if (!collapse) return rows.map((row, index) => ({ kind: "row", row, index }));

  const visible = new Array<boolean>(rows.length).fill(false);

  rows.forEach((row, index) => {
    if (row.type !== "change") return;
    const from = Math.max(0, index - context);
    const to = Math.min(rows.length - 1, index + context);
    for (let i = from; i <= to; i++) visible[i] = true;
  });

  const items: ViewItem[] = [];
  let index = 0;

  while (index < rows.length) {
    if (visible[index]) {
      items.push({ kind: "row", row: rows[index], index });
      index++;
      continue;
    }

    const start = index;
    while (index < rows.length && !visible[index]) index++;

    // Folding a couple of lines saves nothing, and expanded folds stay open.
    if (index - start <= 2 || expanded.has(start)) {
      for (let i = start; i < index; i++) items.push({ kind: "row", row: rows[i], index: i });
    } else {
      items.push({ kind: "fold", start, end: index });
    }
  }

  return items;
}

export type MergeDirection = "toRight" | "toLeft";

function replaceLines(target: string, start: number, count: number, replacement: string[], source: string) {
  const lines = splitLines(target);
  const reference = target || source;
  const eol = reference.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$|\r$/.test(reference);

  lines.splice(start, count, ...replacement);
  if (!lines.length) return "";
  return lines.join(eol) + (trailingNewline ? eol : "");
}

/** Copies one change from one side to the other, keeping each text's own line endings. */
export function applyMerge(left: string, right: string, range: HunkRange, direction: MergeDirection) {
  if (direction === "toRight") {
    const lines = splitLines(left).slice(range.leftStart, range.leftStart + range.leftCount);
    return { left, right: replaceLines(right, range.rightStart, range.rightCount, lines, left) };
  }

  const lines = splitLines(right).slice(range.rightStart, range.rightStart + range.rightCount);
  return { left: replaceLines(left, range.leftStart, range.leftCount, lines, right), right };
}

export function createPatch(leftName: string, rightName: string, leftText: string, rightText: string) {
  return createTwoFilesPatch(leftName || "original", rightName || "changed", leftText, rightText);
}
