import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

type EditorProps = {
  side: "left" | "right";
  title: string;
  value: string;
  name: string;
  onChange: (value: string) => void;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
};

function readFile(file: File, onLoad: (text: string, name: string) => void) {
  file.text().then((text) => onLoad(text, file.name));
}

function Editor({ side, title, value, name, onChange, onNameChange, onSubmit }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLPreElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const lineCount = useMemo(() => (value === "" ? 1 : value.split(/\r\n?|\n/).length), [value]);
  const gutter = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"), [lineCount]);

  const loadFile = (text: string, fileName: string) => {
    onChange(text);
    onNameChange(fileName);
  };

  const handleScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.style.transform = `translateY(${-textareaRef.current.scrollTop}px)`;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmit();
      return;
    }

    // Tab inserts a real tab instead of leaving the field; execCommand keeps native undo working.
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      if (!document.execCommand("insertText", false, "\t")) {
        event.currentTarget.setRangeText("\t", event.currentTarget.selectionStart, event.currentTarget.selectionEnd, "end");
        onChange(event.currentTarget.value);
      }
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) readFile(file, loadFile);
  };

  return (
    <div
      className={`editor editor-${side}${dragging ? " dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="editor-header">
        <span className={`editor-marker marker-${side}`} />
        <input className="editor-name" value={name} placeholder={title} spellCheck={false} onChange={(event) => onNameChange(event.target.value)} aria-label={`${title} name`} />
        <span className="badge">{lineCount} lines</span>
        <button type="button" className="icon-btn" title="Open file" onClick={() => fileRef.current?.click()}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h4l1.5 1.5H14V13H2z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Clear"
          disabled={!value && !name}
          onClick={() => {
            onChange("");
            onNameChange("");
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file, loadFile);
            event.target.value = "";
          }}
        />
      </div>

      <div className="editor-body">
        <div className="editor-gutter" aria-hidden="true">
          <pre ref={gutterRef}>{gutter}</pre>
        </div>
        <textarea ref={textareaRef} className="editor-input" value={value} wrap="off" spellCheck={false} autoCapitalize="off" autoComplete="off" placeholder={`Paste ${side === "left" ? "the original" : "the changed"} text here, or drop a file…`} onChange={(event) => onChange(event.target.value)} onScroll={handleScroll} onKeyDown={handleKeyDown} />
        {dragging && <div className="editor-drop">Drop file</div>}
      </div>
    </div>
  );
}

export default Editor;
