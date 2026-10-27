import "./styles/Widget.css";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

type Position = { x: number; y: number };
export type DockSide = "left" | "right";

type WidgetProps = {
  title: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** The side the widget is snapped to, or null while it floats freely. */
  dock: DockSide | null;
  onDockChange: (dock: DockSide | null) => void;
  className?: string;
  children?: ReactNode;
};

const OFFSET = 10;
// Dropping the widget with the pointer this close to a screen edge snaps it there.
const SNAP_DISTANCE = 80;
// Pointer travel needed before a press on the header counts as a drag.
const DRAG_THRESHOLD = 4;

function clamp(position: Position, element: HTMLElement): Position {
  const { width, height } = element.getBoundingClientRect();
  return {
    x: Math.min(Math.max(OFFSET, position.x), Math.max(OFFSET, window.innerWidth - width - OFFSET)),
    y: Math.min(Math.max(OFFSET, position.y), Math.max(OFFSET, window.innerHeight - height - OFFSET)),
  };
}

function snapSide(clientX: number): DockSide | null {
  if (clientX <= SNAP_DISTANCE) return "left";
  if (clientX >= window.innerWidth - SNAP_DISTANCE) return "right";
  return null;
}

function Widget({ title, collapsed, onCollapsedChange, dock, onDockChange, className, children }: WidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const [snapPreview, setSnapPreview] = useState<DockSide | null>(null);

  const floating = dragging || dock === null;

  useEffect(() => {
    if (dock !== null) return;
    const onResize = () => setPosition((current) => (current && ref.current ? clamp(current, ref.current) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dock]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".widget-toggle") || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || !ref.current) return;

    if (!state.moved) {
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD) return;
      state.moved = true;
      setDragging(true);
    }

    setPosition(clamp({ x: event.clientX - state.dx, y: event.clientY - state.dy }, ref.current));
    setSnapPreview(snapSide(event.clientX));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.moved) return;

    setDragging(false);
    setSnapPreview(null);
    onDockChange(snapSide(event.clientX));
  };

  // Double-click docks to whichever side the widget is closest to.
  const handleDoubleClick = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onDockChange(rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right");
  };

  const classes = ["widget", collapsed && "collapsed", floating ? "floating" : `dock-${dock}`, dragging && "dragging", className].filter(Boolean).join(" ");

  return (
    <>
      {dragging && (
        <>
          <div className={`snap-zone snap-zone-left${snapPreview === "left" ? " active" : ""}`} aria-hidden="true" />
          <div className={`snap-zone snap-zone-right${snapPreview === "right" ? " active" : ""}`} aria-hidden="true" />
        </>
      )}
      <aside ref={ref} className={classes} style={floating && position ? { left: position.x, top: position.y } : undefined}>
        <div
          className="widget-header"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          title="Drag to an edge to snap · double-click to snap to the nearest side"
        >
          <h3>{title}</h3>
          <button type="button" className="widget-toggle" onClick={() => onCollapsedChange(!collapsed)} aria-label={collapsed ? "Expand widget" : "Collapse widget"} aria-expanded={!collapsed}>
            {collapsed ? "+" : "−"}
          </button>
        </div>
        <div className="widget-content">{children}</div>
      </aside>
    </>
  );
}

export default Widget;
