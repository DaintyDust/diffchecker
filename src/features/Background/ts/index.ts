import _ from "underscore";

type Coord = [number, number];
type CanvasPaintFn = (ctx: CanvasRenderingContext2D, layer: FullscreenCanvas) => void;

const STEP_LENGTH = 1;
const CELL_SIZE = 8; //10;
const BORDER_WIDTH = 2;
const isLowPower = typeof navigator !== "undefined" && Boolean(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const MAX_ELECTRONS = isLowPower ? 400 : 750;
const CELL_DISTANCE = CELL_SIZE + BORDER_WIDTH;
const CELL_REPAINT_INTERVAL: readonly [number, number] = [150, 350];
const RANDOM_SPAWN_INTERVAL: readonly [number, number] = [300, 600];
let BG_COLOR = "#1d2227";
let BORDER_COLOR = "#0d1a2e";
let CELL_HIGHLIGHT = "#00b4d8";
let ELECTRON_COLOR = "#0096c7";

const ACTIVE_ELECTRONS: Electron[] = [];
const PINNED_CELLS: Cell[] = [];

const MOVE_TRAILS: Coord[] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
].map(([x, y]) => [x * CELL_DISTANCE, y * CELL_DISTANCE]);

const END_POINTS_OFFSET: Coord[] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
].map(([x, y]) => [x * CELL_DISTANCE - BORDER_WIDTH / 2, y * CELL_DISTANCE - BORDER_WIDTH / 2]);

class FullscreenCanvas {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  disableScale: boolean;
  width = 0;
  height = 0;
  realWidth = 0;
  realHeight = 0;
  container?: HTMLElement;
  private resizeHandlers: CanvasPaintFn[] = [];

  constructor(disableScale = false) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("2D canvas context is not available");
    }

    this.canvas = canvas;
    this.context = context;
    this.disableScale = disableScale;
    // this.handleResize = _.debounce(() => this.handleResize(), 100);
    this.handleResize = _.debounce(this.handleResize.bind(this), 100);

    this.adjust();

    window.addEventListener("resize", this.handleResize);
  }

  adjust() {
    const { canvas, context, disableScale } = this;
    const { innerWidth, innerHeight } = window;
    const rawDPR = window.devicePixelRatio || 1;
    const DPR = Math.min(rawDPR, 2);

    this.width = innerWidth;
    this.height = innerHeight;

    const scale = disableScale ? 1 : DPR;

    this.realWidth = canvas.width = innerWidth * scale;
    this.realHeight = canvas.height = innerHeight * scale;

    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.scale(scale, scale);
  }

  clear() {
    this.context.clearRect(0, 0, this.width, this.height);
  }

  private makeCallback(fn: CanvasPaintFn) {
    fn(this.context, this);
  }

  blendBackground(background: CanvasImageSource) {
    return this.paint((ctx, { realWidth, realHeight, width, height }) => {
      ctx.globalCompositeOperation = "source-over";
      // ctx.globalAlpha = opacity;
      ctx.fillStyle = `rgba(0,0,0,0.05)`; //`rgba(0,0,0,${opacity})`; //`rgba(29, 34, 39, 0.05)`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "lighten";
      ctx.drawImage(background, 0, 0, realWidth, realHeight, 0, 0, width, height);
    });
  }

  paint(fn?: CanvasPaintFn) {
    if (!fn) return;

    this.context.save();
    this.makeCallback(fn);
    this.context.restore();

    return this;
  }

  repaint(fn?: CanvasPaintFn) {
    if (!fn) return;

    this.clear();
    return this.paint(fn);
  }

  onResize(fn?: CanvasPaintFn) {
    if (!fn) return;

    this.resizeHandlers.push(fn);
  }

  private handleResize() {
    if (!this.resizeHandlers.length) return;

    this.adjust();
    // this.resizeHandlers.forEach((handler) => this.makeCallback(handler));
    this.resizeHandlers.forEach(this.makeCallback.bind(this));
  }

  renderIntoView(target: HTMLElement = document.body) {
    this.container = target;

    this.canvas.id = "background";
    this.canvas.style.position = "absolute";
    this.canvas.style.left = "0px";
    this.canvas.style.top = "0px";

    target.appendChild(this.canvas);
  }

  remove() {
    if (!this.container) return;

    try {
      window.removeEventListener("resize", this.handleResize);
      this.container.removeChild(this.canvas);
    } catch {
      return;
    }
  }
}

type ElectronOptions = {
  lifeTime?: number;
  speed?: number;
  color?: string;
};

class Electron {
  lifeTime: number;
  expireAt: number;
  speed: number;
  color: string;
  radius: number;
  current: Coord;
  destination: Coord;
  visited: Record<string, boolean> = {};

  constructor(x = 0, y = 0, { lifeTime = 3000, speed = STEP_LENGTH, color = ELECTRON_COLOR }: ElectronOptions = {}) {
    this.lifeTime = lifeTime;
    this.expireAt = Date.now() + lifeTime;

    this.speed = speed;
    this.color = color;

    this.radius = BORDER_WIDTH / 2;
    this.current = [x, y];
    this.destination = this.randomPath();
    this.setDest(this.destination);
  }

  randomPath(): Coord {
    const [x, y] = this.current;
    const [deltaX, deltaY] = MOVE_TRAILS[Math.floor(Math.random() * MOVE_TRAILS.length)];
    return [x + deltaX, y + deltaY];
  }

  static composeCoord(coord: Coord) {
    return coord.join(",");
  }

  hasVisited(dest: Coord) {
    return this.visited[Electron.composeCoord(dest)];
  }

  setDest(dest: Coord) {
    this.destination = dest;
    this.visited[Electron.composeCoord(dest)] = true;
  }

  next(): Coord {
    const { speed, current } = this;
    let { destination } = this;

    if (Math.abs(current[0] - destination[0]) <= speed / 2 && Math.abs(current[1] - destination[1]) <= speed / 2) {
      destination = this.randomPath();

      let tryCount = 1;
      const maxAttempt = 4;

      while (this.hasVisited(destination) && tryCount <= maxAttempt) {
        tryCount += 1;
        destination = this.randomPath();
      }

      this.setDest(destination);
    }

    const deltaX = destination[0] - current[0];
    const deltaY = destination[1] - current[1];

    if (deltaX) {
      current[0] += (deltaX / Math.abs(deltaX)) * speed;
    }

    if (deltaY) {
      current[1] += (deltaY / Math.abs(deltaY)) * speed;
    }

    return [...this.current];
  }
}

type GlowSprite = {
  canvas: HTMLCanvasElement;
  offset: number;
};

const GLOW_SPRITES = new Map<string, GlowSprite>();

function getGlowSprite(color: string, radius: number): GlowSprite {
  const key = `${color}_${radius}`;
  const cached = GLOW_SPRITES.get(key);

  if (cached) return cached;

  const blur = radius * 5;
  const size = Math.ceil((radius + blur * 2) * 2);
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;

  const offscreenContext = offscreen.getContext("2d");

  if (!offscreenContext) throw new Error("2D canvas context is not available");

  offscreenContext.fillStyle = color;
  offscreenContext.shadowColor = color;
  offscreenContext.shadowBlur = blur;
  offscreenContext.beginPath();
  offscreenContext.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  offscreenContext.closePath();
  offscreenContext.fill();

  const sprite = { canvas: offscreen, offset: size / 2 };
  GLOW_SPRITES.set(key, sprite);

  return sprite;
}

function drawElectronsBatch(layer: FullscreenCanvas) {
  const now = Date.now();
  let writeIndex = 0;

  layer.paint((ctx) => {
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < ACTIVE_ELECTRONS.length; i++) {
      const electron = ACTIVE_ELECTRONS[i];

      if (now >= electron.expireAt) continue;

      const [x, y] = electron.next();
      const alpha = Math.max(0, electron.expireAt - now) / electron.lifeTime;
      const { canvas: sprite, offset } = getGlowSprite(electron.color, electron.radius);

      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - offset, y - offset);

      ACTIVE_ELECTRONS[writeIndex] = electron;
      writeIndex++;
    }
  });

  ACTIVE_ELECTRONS.length = writeIndex;
}

type CellOptions = {
  electronCount?: number;
  background?: string;
  forceElectrons?: boolean;
  electronOptions?: ElectronOptions;
};

class Cell {
  background: string;
  electronOptions: ElectronOptions;
  forceElectrons: boolean;
  electronCount: number;
  startY: number;
  startX: number;
  expireAt = Number.MAX_SAFE_INTEGER;
  nextUpdate?: number;

  constructor(row = 0, col = 0, { electronCount = 1 + Math.floor(Math.random() * 4), background = ELECTRON_COLOR, forceElectrons = false, electronOptions = {} }: CellOptions = {}) {
    this.background = background;
    this.electronOptions = electronOptions;
    this.forceElectrons = forceElectrons;
    this.electronCount = Math.min(electronCount, 4);

    this.startY = row * CELL_DISTANCE;
    this.startX = col * CELL_DISTANCE;
  }

  delay(ms = 0) {
    this.pin(ms * 1.5);
    this.nextUpdate = Date.now() + ms;
  }

  pin(lifeTime = Number.MAX_SAFE_INTEGER) {
    this.expireAt = Date.now() + lifeTime;
    PINNED_CELLS.push(this);
  }

  scheduleUpdate(t1 = CELL_REPAINT_INTERVAL[0], t2 = CELL_REPAINT_INTERVAL[1]) {
    this.nextUpdate = Date.now() + t1 + Math.floor(Math.random() * (t2 - t1 + 1));
  }

  paintNextTo(layer = new FullscreenCanvas()) {
    const { startX, startY, background, nextUpdate } = this;

    if (nextUpdate && Date.now() < nextUpdate) return;

    this.scheduleUpdate();
    this.createElectrons();

    layer.paint((ctx) => {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = background;
      ctx.fillRect(startX, startY, CELL_SIZE, CELL_SIZE);
    });
  }

  static popRandom<T>(array: T[]): T {
    const randomIndex = Math.floor(Math.random() * array.length);
    return array.splice(randomIndex, 1)[0];
  }

  createElectrons() {
    if (!this.electronCount) return;

    const endpoints: Coord[] = [...END_POINTS_OFFSET];
    const max = this.forceElectrons ? this.electronCount : Math.min(this.electronCount, MAX_ELECTRONS - ACTIVE_ELECTRONS.length);

    for (let i = 0; i < max; i++) {
      const [offsetX, offsetY] = Cell.popRandom(endpoints);
      ACTIVE_ELECTRONS.push(new Electron(this.startX + offsetX, this.startY + offsetY, this.electronOptions));
    }
  }
}

const bgLayer = new FullscreenCanvas();
const mainLayer = new FullscreenCanvas();

type ThemeColorOptions = {
  bgColor?: string;
  borderColor?: string;
  cellHighlight?: string;
  electronColor?: string;
};

let themeRepaintFrameId: number | undefined;
let themeNeedsGridRefresh = false;

function createRandomCell(options: CellOptions = {}) {
  if (ACTIVE_ELECTRONS.length >= MAX_ELECTRONS) return;

  const { width, height } = mainLayer;

  const cell = new Cell(Math.floor(Math.random() * (height / CELL_DISTANCE + 1)), Math.floor(Math.random() * (width / CELL_DISTANCE + 1)), options);

  cell.paintNextTo(mainLayer);
}

function compactAndPaint(list: Cell[]) {
  const now = Date.now();
  let writeIndex = 0;
  const toDraw: Cell[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];

    if (now >= item.expireAt) continue;

    if (!item.nextUpdate || now >= item.nextUpdate) {
      item.scheduleUpdate();
      item.createElectrons();
      toDraw.push(item);
    }

    list[writeIndex] = item;
    writeIndex++;
  }

  list.length = writeIndex;

  if (toDraw.length > 0) {
    mainLayer.paint((ctx) => {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < toDraw.length; i++) {
        const item = toDraw[i];
        ctx.fillStyle = item.background;
        ctx.fillRect(item.startX, item.startY, CELL_SIZE, CELL_SIZE);
      }
    });
  }
}

let nextRandomAt = 0;
let renderFrameId: number | undefined;
let unbindPointer: (() => void) | undefined;
let isInitialized = false;

function activateRandom() {
  const now = Date.now();

  if (now < nextRandomAt) {
    return;
  }

  const [min, max] = RANDOM_SPAWN_INTERVAL;
  nextRandomAt = now + min + Math.floor(Math.random() * (max - min + 1));
  createRandomCell();
}

function drawItems() {
  compactAndPaint(PINNED_CELLS);
  drawElectronsBatch(mainLayer);
}

function drawGrid() {
  bgLayer.paint((ctx, { width, height }) => {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = BORDER_COLOR;

    for (let h = CELL_SIZE; h < height; h += CELL_DISTANCE) {
      ctx.fillRect(0, h, width, BORDER_WIDTH);
    }

    for (let w = CELL_SIZE; w < width; w += CELL_DISTANCE) {
      ctx.fillRect(w, 0, BORDER_WIDTH, height);
    }
  });
}

function handlePointer() {
  let lastCell: Coord | null = null;
  let touchRecords: Record<number, { clientX: number; clientY: number }> = {};

  function isSameCell(i: number, j: number) {
    const isSame = Boolean(lastCell && i === lastCell[0] && j === lastCell[1]);
    lastCell = [i, j];
    return isSame;
  }

  function print(isMove: boolean, point: { clientX: number; clientY: number }) {
    const i = Math.floor(point.clientY / CELL_DISTANCE);
    const j = Math.floor(point.clientX / CELL_DISTANCE);

    if (isMove && isSameCell(i, j)) {
      return;
    }

    const cell = new Cell(i, j, {
      background: CELL_HIGHLIGHT,
      forceElectrons: true,
      electronCount: isMove ? 2 : 4,
      electronOptions: {
        speed: 3,
        lifeTime: isMove ? 500 : 1000,
        color: CELL_HIGHLIGHT,
      },
    });

    cell.paintNextTo(mainLayer);
  }

  const handlers: Record<string, EventListener> = {
    touchend: (event: Event) => {
      if (!(event instanceof TouchEvent)) {
        touchRecords = {};
        return;
      }

      Array.from(event.changedTouches).forEach(({ identifier }) => {
        delete touchRecords[identifier];
      });
    },
  };

  function filterTouches(touchList: TouchList) {
    return Array.from(touchList).filter(({ identifier, clientX, clientY }) => {
      const record = touchRecords[identifier];
      touchRecords[identifier] = { clientX, clientY };

      return !record || clientX !== record.clientX || clientY !== record.clientY;
    });
  }

  ["mousedown", "touchstart", "mousemove", "touchmove"].forEach((name) => {
    const isMove = /move/.test(name);
    const isTouch = /touch/.test(name);

    handlers[name] = (event: Event) => {
      if (isTouch) {
        if (!(event instanceof TouchEvent)) return;

        filterTouches(event.touches).forEach((touch) => print(isMove, touch));
        return;
      }

      if (!(event instanceof MouseEvent)) return;

      print(isMove, event);
    };
  });

  const events = Object.keys(handlers);

  events.forEach((name) => {
    document.addEventListener(name, handlers[name]);
  });

  return function unbind() {
    events.forEach((name) => {
      document.removeEventListener(name, handlers[name]);
    });
  };
}

function prepaint() {
  drawGrid();

  mainLayer.paint((ctx, { width, height }) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  });

  mainLayer.blendBackground(bgLayer.canvas);
}

function render() {
  if (typeof document !== "undefined" && document.hidden) {
    renderFrameId = requestAnimationFrame(render);
    return;
  }

  mainLayer.blendBackground(bgLayer.canvas);

  drawItems();
  activateRandom();
  renderFrameId = requestAnimationFrame(render);
}

export function setThemeColors({ bgColor, borderColor, cellHighlight, electronColor }: ThemeColorOptions) {
  if (bgColor && bgColor !== BG_COLOR) {
    BG_COLOR = bgColor;
    themeNeedsGridRefresh = true;
  }

  if (borderColor && borderColor !== BORDER_COLOR) {
    BORDER_COLOR = borderColor;
    themeNeedsGridRefresh = true;
  }

  if (cellHighlight && cellHighlight !== CELL_HIGHLIGHT) {
    CELL_HIGHLIGHT = cellHighlight;
  }

  if (electronColor && electronColor !== ELECTRON_COLOR) {
    ELECTRON_COLOR = electronColor;
  }

  if (!mainLayer.container) return;
  if (themeRepaintFrameId !== undefined) return;

  themeRepaintFrameId = requestAnimationFrame(() => {
    themeRepaintFrameId = undefined;

    if (!mainLayer.container) return;

    if (themeNeedsGridRefresh) {
      drawGrid();
      themeNeedsGridRefresh = false;
    }
  });
}

export async function init() {
  if (isInitialized) {
    return;
  }

  bgLayer.onResize(drawGrid);
  mainLayer.onResize(prepaint);

  mainLayer.renderIntoView();

  prepaint();
  render();

  unbindPointer = handlePointer();
  isInitialized = true;
}

export function destroy() {
  if (!isInitialized) {
    return;
  }

  if (renderFrameId !== undefined) {
    cancelAnimationFrame(renderFrameId);
    renderFrameId = undefined;
  }

  unbindPointer?.();
  unbindPointer = undefined;

  bgLayer.remove();
  mainLayer.remove();

  ACTIVE_ELECTRONS.length = 0;
  PINNED_CELLS.length = 0;
  themeNeedsGridRefresh = false;

  isInitialized = false;
}
