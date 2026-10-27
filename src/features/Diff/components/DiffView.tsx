import { Fragment, type ReactNode } from "react";
import type { Line, MergeDirection, Row, Segment, ViewItem } from "../engine";
import type { SyntaxLines, SyntaxResult, SyntaxToken } from "../syntax";

export type ViewMode = "split" | "unified";

export type MergeControls = {
  /** Whether the merge bars are shown around the active change. */
  open: boolean;
  total: number;
  /** False while the inputs differ from the compared snapshot. */
  enabled: boolean;
  onSelect: (hunk: number) => void;
  onNavigate: (delta: number) => void;
  onMerge: (direction: MergeDirection) => void;
  onClose: () => void;
};

type DiffViewProps = {
  items: ViewItem[];
  mode: ViewMode;
  wrap: boolean;
  syntax: SyntaxResult | null;
  activeHunk: number;
  merge: MergeControls;
  onExpand: (start: number) => void;
};

type Side = "left" | "right";
type ViewProps = Omit<DiffViewProps, "mode">;

/** Cuts syntax tokens and diff segments at each other's boundaries so both can be shown at once. */
function mergePieces(tokens: SyntaxToken[], segments: Segment[]) {
  const pieces: { text: string; className: string; changed: boolean }[] = [];
  let ti = 0;
  let si = 0;
  let tOffset = 0;
  let sOffset = 0;

  while (ti < tokens.length && si < segments.length) {
    const token = tokens[ti];
    const segment = segments[si];
    const length = Math.min(token.text.length - tOffset, segment.text.length - sOffset);

    pieces.push({ text: token.text.slice(tOffset, tOffset + length), className: token.className, changed: segment.changed });

    tOffset += length;
    sOffset += length;
    if (tOffset === token.text.length) [ti, tOffset] = [ti + 1, 0];
    if (sOffset === segment.text.length) [si, sOffset] = [si + 1, 0];
  }

  return pieces;
}

function renderText(line: Line, syntax?: SyntaxLines): ReactNode {
  if (line.text === "") return "​";

  const tokens = syntax?.[line.no - 1];
  const hasSyntax = tokens && tokens.map((token) => token.text).join("") === line.text;

  if (!hasSyntax) {
    if (!line.segments) return line.text;
    return line.segments.map((segment, i) =>
      segment.changed ? (
        <mark key={i} className="dv-hl">
          {segment.text}
        </mark>
      ) : (
        <Fragment key={i}>{segment.text}</Fragment>
      ),
    );
  }

  return mergePieces(tokens, line.segments ?? [{ text: line.text, changed: false }]).map((piece, i) => {
    const content = piece.className ? <span className={piece.className}>{piece.text}</span> : piece.text;
    return piece.changed ? (
      <mark key={i} className="dv-hl">
        {content}
      </mark>
    ) : (
      <Fragment key={i}>{content}</Fragment>
    );
  });
}

function hunkAttrs(row: Row, items: ViewItem[], position: number, activeHunk: number, withId = true) {
  if (row.type !== "change") return {};

  const previous = items[position - 1];
  const isFirst = !(previous?.kind === "row" && previous.row.type === "change" && previous.row.hunk === row.hunk);

  return {
    id: withId && isFirst ? `hunk-${row.hunk}` : undefined,
    "data-active": row.hunk === activeHunk || undefined,
  };
}

function cellType(row: Row, side: Side) {
  if (row.type === "equal") return "eq";
  if (!row[side]) return "empty";
  return side === "left" ? "del" : "add";
}

function hunkAt(items: ViewItem[], position: number) {
  const item = items[position];
  return item?.kind === "row" && item.row.type === "change" ? item.row.hunk : null;
}

/** Where the merge bars go: before the first and after the last visible row of the active change. */
function barPlacement(items: ViewItem[], position: number, activeHunk: number, open: boolean) {
  const hunk = hunkAt(items, position);
  if (!open || hunk !== activeHunk) return { top: false, bottom: false };
  return { top: hunkAt(items, position - 1) !== hunk, bottom: hunkAt(items, position + 1) !== hunk };
}

function selectOnClick(row: Row, merge: MergeControls) {
  if (row.type !== "change") return undefined;
  return () => {
    // Selecting text should not open the merge bars.
    if (window.getSelection()?.toString()) return;
    merge.onSelect(row.hunk);
  };
}

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={up ? "M8 13V3M3.5 7.5 8 3l4.5 4.5" : "M8 3v10M3.5 8.5 8 13l4.5-4.5"} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function HunkBar({ active, merge, spacer = false }: { active: number; merge: MergeControls; spacer?: boolean }) {
  if (spacer) return <div className="hunk-bar" aria-hidden="true" />;

  return (
    <div className="hunk-bar">
      <div className="hunk-bar-inner">
        <span className="hunk-bar-label">
          Change <strong>{active + 1}</strong> of {merge.total}
        </span>
        <button type="button" className="hunk-bar-btn" onClick={() => merge.onNavigate(-1)}>
          <ArrowIcon up /> Previous change
        </button>
        <button type="button" className="hunk-bar-btn" onClick={() => merge.onNavigate(1)}>
          <ArrowIcon up={false} /> Next change
        </button>
      </div>
    </div>
  );
}

function MergeButton({ direction, merge }: { direction: MergeDirection; merge: MergeControls }) {
  const toRight = direction === "toRight";
  const title = !merge.enabled
    ? "Inputs changed since this diff: refresh it first"
    : toRight
      ? "Copy this change from the original into the changed text"
      : "Copy this change from the changed text into the original";

  return (
    <button type="button" className={`merge-btn merge-btn-${toRight ? "left" : "right"}`} disabled={!merge.enabled} onClick={() => merge.onMerge(direction)} title={title}>
      {!toRight && <span className="merge-arrow">‹</span>}
      Merge change
      {toRight && <span className="merge-arrow">›</span>}
    </button>
  );
}

function CloseButton({ merge }: { merge: MergeControls }) {
  return (
    <button type="button" className="merge-close" onClick={merge.onClose} aria-label="Close merge controls">
      ×
    </button>
  );
}

/** Without `half` the bar spans both sides; the no-wrap split view renders one half per column. */
function MergeBar({ merge, half }: { merge: MergeControls; half?: Side }) {
  return (
    <div className="merge-bar">
      <div className={`merge-bar-inner${half ? ` merge-bar-${half}` : " merge-bar-full"}`}>
        {half !== "right" && <MergeButton direction="toRight" merge={merge} />}
        {half !== "left" && <CloseButton merge={merge} />}
        {half !== "left" && <MergeButton direction="toLeft" merge={merge} />}
      </div>
    </div>
  );
}

function Fold({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" className="dv-fold" onClick={onClick}>
      <span className="dv-fold-icon">⋯</span>
      Show {count} unchanged {count === 1 ? "line" : "lines"}
    </button>
  );
}

function SplitView({ items, wrap, syntax, activeHunk, merge, onExpand }: ViewProps) {
  if (!wrap) {
    // Without wrapping every row is exactly one line high, so two independently
    // scrolling columns stay aligned.
    const column = (side: Side) => (
      <div className={`dv-col dv-col-${side}`}>
        <div className="dv-col-inner">
          {items.map((item, position) => {
            if (item.kind === "fold") return <Fold key={`fold-${item.start}`} count={item.end - item.start} onClick={() => onExpand(item.start)} />;

            const line = item.row[side];
            const type = cellType(item.row, side);
            const bars = barPlacement(items, position, activeHunk, merge.open);

            return (
              <Fragment key={item.index}>
                {bars.top && <HunkBar active={activeHunk} merge={merge} spacer={side === "right"} />}
                <div className="dv-row" {...hunkAttrs(item.row, items, position, activeHunk, side === "left")} onClick={selectOnClick(item.row, merge)}>
                  <span className={`dv-num dv-${type}`}>{line?.no}</span>
                  <span className={`dv-code dv-${type}`}>{line && renderText(line, syntax?.[side])}</span>
                </div>
                {bars.bottom && <MergeBar merge={merge} half={side} />}
              </Fragment>
            );
          })}
        </div>
      </div>
    );

    return (
      <div className="dv dv-split dv-nowrap">
        {column("left")}
        {column("right")}
      </div>
    );
  }

  return (
    <div className="dv dv-split">
      {items.map((item, position) => {
        if (item.kind === "fold") {
          return <Fold key={`fold-${item.start}`} count={item.end - item.start} onClick={() => onExpand(item.start)} />;
        }

        const { row } = item;
        const leftType = cellType(row, "left");
        const rightType = cellType(row, "right");
        const bars = barPlacement(items, position, activeHunk, merge.open);

        return (
          <Fragment key={item.index}>
            {bars.top && <HunkBar active={activeHunk} merge={merge} />}
            <div className="dv-row" {...hunkAttrs(row, items, position, activeHunk)} onClick={selectOnClick(row, merge)}>
              <span className={`dv-num dv-${leftType}`}>{row.left?.no}</span>
              <span className={`dv-code dv-${leftType}`}>{row.left && renderText(row.left, syntax?.left)}</span>
              <span className={`dv-num dv-${rightType}`}>{row.right?.no}</span>
              <span className={`dv-code dv-${rightType}`}>{row.right && renderText(row.right, syntax?.right)}</span>
            </div>
            {bars.bottom && <MergeBar merge={merge} />}
          </Fragment>
        );
      })}
    </div>
  );
}

function UnifiedView({ items, wrap, syntax, activeHunk, merge, onExpand }: ViewProps) {
  const output: ReactNode[] = [];
  let position = 0;

  while (position < items.length) {
    const item = items[position];

    if (item.kind === "fold") {
      output.push(<Fold key={`fold-${item.start}`} count={item.end - item.start} onClick={() => onExpand(item.start)} />);
      position++;
      continue;
    }

    const { row } = item;

    if (row.type === "equal") {
      output.push(
        <div key={item.index} className="dv-row">
          <span className="dv-num dv-eq">{row.left.no}</span>
          <span className="dv-num dv-eq">{row.right.no}</span>
          <span className="dv-sign dv-eq" />
          <span className="dv-code dv-eq">{renderText(row.right, syntax?.right)}</span>
        </div>,
      );
      position++;
      continue;
    }

    // Gather the whole change block, then print every removal before every addition.
    const block: Row[] = [];
    const startIndex = item.index;
    while (position < items.length) {
      const next = items[position];
      if (next.kind !== "row" || next.row.type !== "change" || next.row.hunk !== row.hunk) break;
      block.push(next.row);
      position++;
    }

    const attrs = { id: `hunk-${row.hunk}`, "data-active": row.hunk === activeHunk || undefined };
    const showBars = merge.open && row.hunk === activeHunk;
    const lines = [
      ...block.flatMap((r) => (r.left ? [{ line: r.left, type: "del" as const }] : [])),
      ...block.flatMap((r) => (r.right ? [{ line: r.right, type: "add" as const }] : [])),
    ];

    if (showBars) output.push(<HunkBar key={`bar-${startIndex}`} active={activeHunk} merge={merge} />);

    output.push(
      <div key={`hunk-${startIndex}`} className="dv-block" {...attrs} onClick={selectOnClick(row, merge)}>
        {lines.map(({ line, type }) => (
          <div key={`${type}-${line.no}`} className="dv-row">
            <span className={`dv-num dv-${type}`}>{type === "del" ? line.no : ""}</span>
            <span className={`dv-num dv-${type}`}>{type === "add" ? line.no : ""}</span>
            <span className={`dv-sign dv-${type}`}>{type === "del" ? "-" : "+"}</span>
            <span className={`dv-code dv-${type}`}>{renderText(line, type === "del" ? syntax?.left : syntax?.right)}</span>
          </div>
        ))}
      </div>,
    );

    if (showBars) output.push(<MergeBar key={`merge-${startIndex}`} merge={merge} />);
  }

  return (
    <div className={`dv dv-unified${wrap ? "" : " dv-nowrap"}`}>
      <div className="dv-inner">{output}</div>
    </div>
  );
}

function DiffView({ mode, ...props }: DiffViewProps) {
  return mode === "split" ? <SplitView {...props} /> : <UnifiedView {...props} />;
}

export default DiffView;
