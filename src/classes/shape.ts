export interface Shape {
  id: string;
  type: string;
  name?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  level: number;
  zIndex: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shapes?: Shape[];
  groupId?: string | null;
  /** User-visible name shared by every member of a logical group. */
  groupName?: string;
  /** Rotation of the logical group frame shared by every member. */
  groupRotation?: number;
  /** Frame parent. Coordinates remain in board/world space when reparenting. */
  parentId?: string | null;
  /** Frames can hide child content outside their bounds. */
  clipContent?: boolean;
  /** Responsive positioning inside the direct parent frame. */
  constraintHorizontal?: "left" | "right" | "left-right" | "center" | "scale";
  constraintVertical?: "top" | "bottom" | "top-bottom" | "center" | "scale";
  /** Container layout. Only frames use a non-none mode. */
  layoutMode?: "none" | "horizontal" | "vertical" | "grid";
  layoutWrap?: boolean;
  layoutGap?: number;
  layoutCounterGap?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAlign?: "start" | "center" | "end" | "space-between";
  counterAlign?: "start" | "center" | "end" | "stretch";
  horizontalSizing?: "fixed" | "hug" | "fill";
  verticalSizing?: "fixed" | "hug" | "fill";
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  /** Per-child auto-layout behavior. */
  layoutPositioning?: "auto" | "absolute";
  layoutGrow?: number;
  layoutAlign?: "inherit" | "start" | "center" | "end" | "stretch";
  locked?: boolean;
  hidden?: boolean;
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;
  borderColor?: string;
  backgroundColor?: string;
  /** Ordered paint stacks. Legacy single-value fields remain the compatibility fallback. */
  fills?: Array<{
    id: string;
    type: "solid" | "linear-gradient" | "radial-gradient" | "image";
    color?: string;
    opacity: number;
    visible: boolean;
    blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "difference";
    gradientAngle?: number;
    gradientStops?: Array<{ id: string; position: number; color: string; opacity: number }>;
    imageUrl?: string;
  }>;
  strokes?: Array<{
    id: string;
    color: string;
    width: number;
    opacity: number;
    visible: boolean;
    style: "solid" | "dashed" | "dotted";
    align: "inside" | "center" | "outside";
  }>;
  cornerRadii?: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
  cornerSmoothing?: number;
  backgroundImage?: string;
  assetId?: string;
  color?: string;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAutoResize?: "auto-width" | "auto-height" | "fixed";
  /** Character-level typography. Runs use UTF-16 offsets so they map to textarea selections. */
  textRuns?: Array<{
    id: string;
    start: number;
    end: number;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    textDecoration?: string;
    link?: string;
  }>;
  fontAxes?: Record<string, number>;
  openTypeFeatures?: Record<string, boolean>;
  paragraphSpacing?: number;
  textIndent?: number;
  textCase?: "original" | "upper" | "lower" | "title";
  listStyle?: "none" | "bulleted" | "numbered";
  /** Persistent ruler guide; guides are non-exporting canvas helpers. */
  guideAxis?: "horizontal" | "vertical";
  /** Reusable design-system metadata. Resource nodes are hidden document records. */
  componentDefinition?: boolean;
  componentName?: string;
  componentSetId?: string;
  variantProperties?: Record<string, string>;
  componentProperties?: Record<string, {
    type: "text" | "boolean" | "instance-swap" | "variant" | "slot";
    label: string;
    defaultValue: string | boolean;
    targetNodeId?: string;
    targetField?: string;
    preferredValues?: string[];
  }>;
  instanceProperties?: Record<string, string | boolean>;
  instanceOf?: string;
  instanceRootId?: string;
  componentNodeId?: string;
  overriddenFields?: string[];
  fillStyleId?: string;
  textStyleId?: string;
  effectStyleId?: string;
  variableBindings?: Record<string, string>;
  resourceKind?: "fill-style" | "text-style" | "effect-style" | "color-variable" | "number-variable" | "string-variable" | "boolean-variable" | "timing-variable" | "easing-variable" | "variable-collection" | "prototype-flow" | "workshop-state" | "font-face";
  resourceName?: string;
  resourceValue?: Record<string, string | number | boolean>;
  variableCollectionId?: string;
  variableGroup?: string;
  variableAliasId?: string;
  variableModeValues?: Record<string, string | number | boolean>;
  activeVariableModes?: Record<string, string>;
  /** Published-library origin used to review and safely update imported assets. */
  libraryId?: string;
  libraryVersion?: number;
  librarySourceId?: string;
  prototypeStart?: boolean;
  /** A frame may be the starting point of more than one named flow. */
  prototypeFlowIds?: string[];
  /** Product-completeness metadata. Only frames participate as journey states. */
  productState?: {
    screenKey: string;
    state: "default" | "loading" | "empty" | "error" | "success" | "offline" | "unauthorized" | "not-found" | "confirmation" | "custom";
    customState?: string;
    flowIds: string[];
    roles: string[];
    viewport: "mobile" | "tablet" | "desktop" | "responsive";
    criticality: "critical" | "required" | "optional";
    requirementRefs: string[];
  };
  prototypeOverflow?: "clip" | "scroll";
  prototypeOverflowAxis?: "none" | "horizontal" | "vertical" | "both";
  prototypePosition?: "scroll" | "fixed" | "sticky";
  prototypeStickyOffset?: number;
  prototypeOverlaySettings?: {
    closeOnOutside: boolean;
    background: string;
    position: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
  prototypeInteractions?: Array<{
    id: string;
    trigger: "click" | "hover" | "drag" | "after-delay" | "mouse-enter" | "mouse-leave" | "key-down";
    action: "navigate" | "back" | "open-board" | "open-url" | "change-to" | "open-overlay" | "close-overlay" | "scroll-to" | "set-variable";
    destinationId?: string;
    boardId?: string;
    url?: string;
    delay?: number;
    key?: string;
    transition?: "instant" | "dissolve" | "slide-left" | "slide-right" | "smart-animate";
    duration?: number;
    preserveScroll?: boolean;
    variableId?: string;
    variableValue?: string | number | boolean;
    condition?: {
      variableId: string;
      operator: "equals" | "not-equals" | "greater" | "less" | "truthy";
      value?: string | number | boolean;
    };
    /** Explicit catch-all for sibling conditional transitions with the same trigger. */
    fallback?: boolean;
    /** Optional target frame when opening a linked board. */
    destinationFrameId?: string;
  }>;
  /** Vector and compositing data. Vector points are stored in board/world coordinates. */
  vectorPoints?: Array<{
    id: string;
    x: number;
    y: number;
    handleIn?: { x: number; y: number };
    handleOut?: { x: number; y: number };
  }>;
  vectorClosed?: boolean;
  drawingKind?: "pen" | "marker" | "highlighter";
  /** A vector network can contain multiple branching paths over shared points. */
  vectorPaths?: Array<{ id: string; pointIds: string[]; closed: boolean }>;
  strokeCap?: "none" | "round" | "square" | "arrow";
  strokeJoin?: "miter" | "round" | "bevel";
  strokeAlign?: "inside" | "center" | "outside";
  strokeDash?: number[];
  booleanOperation?: "union" | "subtract" | "intersect" | "exclude";
  booleanChildren?: Shape[];
  maskId?: string;
  isMask?: boolean;
  fillType?: "solid" | "linear-gradient" | "radial-gradient";
  gradientAngle?: number;
  gradientStops?: Array<{ id: string; position: number; color: string; opacity: number }>;
  effects?: Array<{
    id: string;
    type: "drop-shadow" | "inner-shadow" | "layer-blur" | "background-blur";
    color: string;
    x: number;
    y: number;
    blur: number;
    spread: number;
    visible: boolean;
  }>;
  blendMode?: "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "difference";
  imageFit?: "fill" | "fit" | "crop" | "tile";
  imageCrop?: { x: number; y: number; width: number; height: number };
  imageFilters?: { brightness: number; contrast: number; saturation: number; blur: number };
  mediaType?: "image" | "gif" | "video";
  mediaAutoplay?: boolean;
  mediaLoop?: boolean;
  mediaMuted?: boolean;
  altText?: string;
  semanticRole?: "none" | "button" | "heading" | "image" | "link" | "input" | "navigation";
  focusOrder?: number;
  devStatus?: "designing" | "ready" | "completed";
  devAnnotation?: string;
  codeComponentUrl?: string;
  /** Document organization. Page and collection records are hidden workspace nodes. */
  pageId?: string | null;
  pageName?: string;
  pageOrder?: number;
  sectionId?: string | null;
  collectionId?: string | null;
  collectionName?: string;
  rows?: number;
  columns?: number;
  tableCells?: string[][];
  codeLanguage?: string;
  embedUrl?: string;
  embedTitle?: string;
  embedDescription?: string;
  embedImageUrl?: string;
  connectorStart?: {
    shapeId?: string;
    anchor: "auto" | "top" | "right" | "bottom" | "left" | "center";
    x: number;
    y: number;
  };
  connectorEnd?: {
    shapeId?: string;
    anchor: "auto" | "top" | "right" | "bottom" | "left" | "center";
    x: number;
    y: number;
  };
  connectorRouting?: "straight" | "curved" | "orthogonal";
  connectorLabel?: string;
  connectorStartCap?: "none" | "arrow" | "circle" | "diamond";
  connectorEndCap?: "none" | "arrow" | "circle" | "diamond";
  connectorAvoidObstacles?: boolean;
  portalVersionId?: string | null;
  portalPinnedAt?: string | null;
  boardId?: string | null;
  title?: string | null;
  uid?: string | null;
}

export const createShapeId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const largestZIndex = (shapes: Shape[]): number =>
  shapes.reduce(
    (largest, shape) => Math.max(largest, shape.zIndex, largestZIndex(shape.shapes ?? [])),
    0
  );

export const ShapeFunctions = {
  createShape(type: string, x: number, y: number, shapes: Shape[]): Shape {
    const isMedia = type === "calendar" || type === "image";
    return {
      id: createShapeId(),
      type,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      width: 0,
      height: 0,
      level: 0,
      zIndex: largestZIndex(shapes) + 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      groupId: null,
      parentId: null,
      clipContent: type === "frame",
      constraintHorizontal: "left",
      constraintVertical: "top",
      layoutMode: "none",
      layoutWrap: false,
      layoutGap: 12,
      layoutCounterGap: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      primaryAlign: "start",
      counterAlign: "start",
      horizontalSizing: "fixed",
      verticalSizing: "fixed",
      layoutPositioning: "auto",
      layoutGrow: 0,
      layoutAlign: "inherit",
      locked: false,
      hidden: false,
      borderRadius: type === "ellipse" ? 1000 : 0,
      borderWidth: 0,
      borderStyle: "solid",
      borderColor: "#000000",
      backgroundColor: type === "text" || isMedia ? "transparent" : "#ffffff",
      backgroundImage: "",
      color: "#ffffff",
      opacity: 1,
      text: "",
      fontSize: 12,
      fontFamily: "Arial",
      fontWeight: "normal",
      textAlign: "left",
      alignItems: "flex-start",
      textDecoration: "none",
      lineHeight: 1.2,
      letterSpacing: 0,
      textAutoResize: "fixed",
      paragraphSpacing: 0,
      textIndent: 0,
      textCase: "original",
      listStyle: "none",
      fillType: "solid",
      gradientAngle: 90,
      gradientStops: [
        { id: createShapeId(), position: 0, color: "#ffffff", opacity: 1 },
        { id: createShapeId(), position: 1, color: "#000000", opacity: 1 },
      ],
      effects: [],
      blendMode: "normal",
      rows: 1,
    };
  },
};
