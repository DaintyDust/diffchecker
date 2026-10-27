import "./TextCompare.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@/features/Diff/components/Editor";
import DiffView, { type MergeControls } from "@/features/Diff/components/DiffView";
import { applyMerge, buildViewItems, computeDiff, type MergeDirection } from "@/features/Diff/engine";
import { highlightTexts, type SyntaxResult } from "@/features/Diff/syntax";
import SettingsWidget from "@/features/Settings/SettingsWidget";
import { DEFAULT_SETTINGS, parseIgnoreRules, type Settings } from "@/features/Settings/settings";
import { useLocalStorage } from "@/shared/hooks/useLocalStorage";
import type { DockSide } from "@/components/Widget";
import CopyButton from "@/components/CopyButton";

const CONTEXT_LINES = 3;
const REALTIME_DELAY = 250;
// Below this width the docked settings widget would cover the content, so it starts collapsed.
const WIDE_SCREEN = 1200;

type Snapshot = { left: string; right: string };

function TextCompare() {
  const [left, setLeft] = useLocalStorage("dc:left", "");
  const [right, setRight] = useLocalStorage("dc:right", "");
  const [leftName, setLeftName] = useLocalStorage("dc:leftName", "");
  const [rightName, setRightName] = useLocalStorage("dc:rightName", "");
  const [storedSettings, setSettings] = useLocalStorage<Settings>("dc:settings", DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...storedSettings };

  const [settingsCollapsed, setSettingsCollapsed] = useState(() => window.innerWidth < WIDE_SCREEN);
  const [savedDock, setSavedDock] = useLocalStorage<DockSide>("dc:dock", "left");
  const [dock, setDock] = useState<DockSide | null>(savedDock === "right" ? "right" : "left");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [syntax, setSyntax] = useState<SyntaxResult | null>(null);
  const [inputOpen, setInputOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [activeHunk, setActiveHunk] = useState(0);
  const [mergeOpen, setMergeOpen] = useState(false);
  // Change index to keep active after a merge or undo recomputes the diff.
  const [pendingHunk, setPendingHunk] = useState<number | null>(null);
  const [mergeHistory, setMergeHistory] = useState<Snapshot[]>([]);
  const resultRef = useRef<HTMLElement>(null);
  const scrollToActive = useRef(false);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...DEFAULT_SETTINGS, ...current, [key]: value }));

  const { ignoreWhitespace, ignoreCase, precision, ignoreRules } = settings;
  const rules = useMemo(() => parseIgnoreRules(ignoreRules), [ignoreRules]);
  const result = useMemo(() => (snapshot ? computeDiff(snapshot.left, snapshot.right, { ignoreWhitespace, ignoreCase, precision, ignorePatterns: rules.patterns }) : null), [snapshot, ignoreWhitespace, ignoreCase, precision, rules]);

  // A new diff starts with every fold closed and the navigator on the first change,
  // unless a merge asked to stay where it was.
  const [previousResult, setPreviousResult] = useState(result);
  if (previousResult !== result) {
    const hunks = result?.hunks ?? 0;
    setPreviousResult(result);
    setExpanded(new Set());
    setActiveHunk(pendingHunk === null ? 0 : Math.min(pendingHunk, Math.max(0, hunks - 1)));
    if (pendingHunk === null || hunks === 0) setMergeOpen(false);
    setPendingHunk(null);
  }

  const items = useMemo(() => (result ? buildViewItems(result.rows, settings.collapse, CONTEXT_LINES, expanded) : []), [result, settings.collapse, expanded]);

  useEffect(() => {
    let cancelled = false;
    const texts = snapshot ?? { left: "", right: "" };
    highlightTexts(texts.left, texts.right, settings.syntax, [leftName, rightName])
      .catch(() => null)
      .then((highlighted) => {
        if (!cancelled) setSyntax(highlighted);
      });
    return () => {
      cancelled = true;
    };
  }, [snapshot, settings.syntax, leftName, rightName]);

  useEffect(() => {
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    document.getElementById(`hunk-${activeHunk}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [items, activeHunk]);

  const compare = useCallback(() => {
    setSnapshot({ left, right });
    setMergeHistory([]);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [left, right]);

  useEffect(() => {
    if (!settings.realtime) return;
    // Skip no-op updates so a merge (which already updated the snapshot) keeps its position.
    const timer = setTimeout(() => setSnapshot((current) => (current && current.left === left && current.right === right ? current : { left, right })), REALTIME_DELAY);
    return () => clearTimeout(timer);
  }, [settings.realtime, left, right]);

  const goToHunk = useCallback(
    (index: number) => {
      if (!result || result.hunks === 0) return;
      const next = (index + result.hunks) % result.hunks;
      setActiveHunk(next);
      document.getElementById(`hunk-${next}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    },
    [result],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mergeOpen) {
        setMergeOpen(false);
        return;
      }
      if (!event.altKey || !result) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToHunk(activeHunk + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        goToHunk(activeHunk - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToHunk, activeHunk, result, mergeOpen]);

  const swap = () => {
    setLeft(right);
    setRight(left);
    setLeftName(rightName);
    setRightName(leftName);
    if (snapshot) setSnapshot({ left: snapshot.right, right: snapshot.left });
    setMergeHistory([]);
  };

  const applySnapshot = (next: Snapshot) => {
    setLeft(next.left);
    setRight(next.right);
    setSnapshot(next);
    setPendingHunk(activeHunk);
    scrollToActive.current = true;
  };

  const merge = (direction: MergeDirection) => {
    const range = result?.hunkRanges[activeHunk];
    if (!snapshot || !range) return;
    setMergeHistory((history) => [...history, snapshot]);
    applySnapshot(applyMerge(snapshot.left, snapshot.right, range, direction));
  };

  const undoMerge = () => {
    const previous = mergeHistory[mergeHistory.length - 1];
    if (!previous) return;
    setMergeHistory((history) => history.slice(0, -1));
    applySnapshot(previous);
    setMergeOpen(true);
  };

  const clearAll = () => {
    setLeft("");
    setRight("");
    setLeftName("");
    setRightName("");
    setSnapshot(null);
    setMergeHistory([]);
  };

  const outdated = snapshot !== null && !settings.realtime && (snapshot.left !== left || snapshot.right !== right);
  const ignoring = ignoreCase || ignoreWhitespace || rules.patterns.length > 0;
  const mergeControls: MergeControls = {
    open: mergeOpen,
    total: result?.hunks ?? 0,
    enabled: !outdated,
    onSelect: (hunk) => {
      setActiveHunk(hunk);
      setMergeOpen(true);
    },
    onNavigate: (delta) => goToHunk(activeHunk + delta),
    onMerge: merge,
    onClose: () => setMergeOpen(false),
  };

  const changeDock = (side: DockSide | null) => {
    setDock(side);
    if (side) setSavedDock(side);
  };

  return (
    <>
      <div className={`page-scroll${dock && !settingsCollapsed ? ` with-sidebar-${dock}` : ""}`}>
        <header className="page-header">
          <h1 className="page-title">
            DIFF<span className="title-accent">//</span>CHECKER
          </h1>
          <p className="page-subtitle">Compare text and code, find every difference.</p>
          <span className="badge badge-accent">TEXT COMPARE</span>
        </header>

        <main className="page-main">
          {result && (
            <section ref={resultRef} className="panel result-panel">
              <div className="panel-header">
                <div className="panel-header-left">
                  <h2 className="panel-title">Result</h2>
                  {result.identical ? (
                    <span className="badge badge-accent">IDENTICAL</span>
                  ) : (
                    <>
                      <span className="badge badge-del">
                        −{result.removals} {result.removals === 1 ? "removal" : "removals"}
                      </span>
                      <span className="badge badge-add">
                        +{result.additions} {result.additions === 1 ? "addition" : "additions"}
                      </span>
                    </>
                  )}
                  {!result.identical && !mergeOpen && <span className="muted small">Click a change to merge it</span>}
                  {outdated && (
                    <button type="button" className="badge badge-warn" onClick={compare} title="Inputs changed since this diff">
                      OUTDATED · REFRESH
                    </button>
                  )}
                </div>

                <div className="panel-header-right">
                  {!result.identical && (
                    <div className="hunk-nav" title="Alt + ↑ / ↓">
                      <button type="button" className="icon-btn" onClick={() => goToHunk(activeHunk - 1)} aria-label="Previous change">
                        ▲
                      </button>
                      <span className="hunk-count">
                        {activeHunk + 1}/{result.hunks}
                      </span>
                      <button type="button" className="icon-btn" onClick={() => goToHunk(activeHunk + 1)} aria-label="Next change">
                        ▼
                      </button>
                    </div>
                  )}
                  {mergeHistory.length > 0 && (
                    <button type="button" className="btn btn-small" onClick={undoMerge} title="Undo the last merge">
                      Undo merge
                    </button>
                  )}
                </div>
              </div>

              <div className="result-subheader">
                <div className="file-label">
                  <span className="editor-marker marker-left" />
                  <span className="file-name">{leftName || "Original"}</span>
                  <span className="file-meta">{result.leftLines} lines</span>
                  <CopyButton text={snapshot?.left ?? ""} label="Copy original text" />
                </div>
                <div className="file-label">
                  <span className="editor-marker marker-right" />
                  <span className="file-name">{rightName || "Changed"}</span>
                  <span className="file-meta">{result.rightLines} lines</span>
                  <CopyButton text={snapshot?.right ?? ""} label="Copy changed text" />
                </div>
              </div>

              {result.identical ? (
                <div className="result-empty">
                  <div className="result-empty-icon">=</div>
                  <p>
                    The two texts are identical
                    {ignoring && <span className="muted"> (with the ignore options applied)</span>}.
                  </p>
                </div>
              ) : (
                <DiffView items={items} mode={settings.mode} wrap={settings.wrap} syntax={syntax} activeHunk={activeHunk} merge={mergeControls} onExpand={(start) => setExpanded((current) => new Set(current).add(start))} />
              )}
            </section>
          )}

          <section className={`panel input-panel${inputOpen ? "" : " collapsed"}`}>
            <div className="panel-header clickable" onClick={() => setInputOpen((open) => !open)}>
              <div className="panel-header-left">
                <h2 className="panel-title">Input</h2>
                <span className="muted small">Paste, type or drop files</span>
              </div>
              <button
                type="button"
                className="widget-toggle"
                aria-label={inputOpen ? "Collapse input" : "Expand input"}
                onClick={(event) => {
                  event.stopPropagation();
                  setInputOpen((open) => !open);
                }}
              >
                {inputOpen ? "−" : "+"}
              </button>
            </div>

            {inputOpen && (
              <div className="panel-content">
                <div className="editors">
                  <Editor side="left" title="Original text" value={left} name={leftName} onChange={setLeft} onNameChange={setLeftName} onSubmit={compare} />
                  <button type="button" className="swap-btn" onClick={swap} title="Swap sides" aria-label="Swap sides">
                    ⇄
                  </button>
                  <Editor side="right" title="Changed text" value={right} name={rightName} onChange={setRight} onNameChange={setRightName} onSubmit={compare} />
                </div>

                <div className="input-footer">
                  <span className="muted small">{settings.realtime ? "Real-time editor is on — the diff updates while you type." : "Tip: drag the settings widget to either edge to snap it there."}</span>
                  <div className="actions">
                    <button type="button" className="btn" onClick={clearAll} disabled={!left && !right}>
                      Clear
                    </button>
                    <button type="button" className="btn btn-primary" onClick={compare} disabled={!left && !right}>
                      Find difference
                      <kbd>Ctrl ↵</kbd>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>

        <footer className="page-footer">
          <a href="https://daintydust.dev" target="_blank" rel="noreferrer">
            daintydust.dev
          </a>
          <span className="muted">·</span>
          <span className="muted">Everything runs in your browser — nothing is uploaded.</span>
        </footer>
      </div>

      <SettingsWidget settings={settings} onChange={update} onReset={() => setSettings(DEFAULT_SETTINGS)} detectedLanguage={syntax?.language ?? null} ruleErrors={rules.errors} collapsed={settingsCollapsed} onCollapsedChange={setSettingsCollapsed} dock={dock} onDockChange={changeDock} />
    </>
  );
}

export default TextCompare;
