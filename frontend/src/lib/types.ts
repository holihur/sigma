export type NodeType = "frame" | "group" | "rect" | "ellipse" | "text" | "image" | "line";

export type Paint =
  | { type: "solid"; color: string; opacity?: number }
  | { type: "linear"; angle: number; stops: { color: string; position: number }[] };

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

export type LinkAction = "none" | "navigate" | "back" | "url";
export type Transition = "instant" | "dissolve" | "slide-left" | "slide-up";

export interface PrototypeLink {
  action: LinkAction;
  targetPageId?: string;
  targetFrameId?: string;
  url?: string;
  transition: Transition;
}

export interface SceneNode {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;

  fill: Paint | null;
  stroke: Paint | null;
  strokeWidth: number;
  radius: number;
  shadow: Shadow | null;
  blur: number;

  children: string[];
  parentId: string | null;
  clip: boolean;

  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;

  src: string;
  objectFit: "cover" | "contain" | "fill";

  link: PrototypeLink | null;
  ts: number;
}

export interface Page {
  id: string;
  name: string;
  nodes: Record<string, SceneNode>;
  rootIds: string[];
  ts: number;
}

export interface SigmaDoc {
  pages: Page[];
  tombstones?: Record<string, number>;
  deletedPages?: Record<string, number>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
  createdAt?: string;
}

export interface FileMeta {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  version: number;
  thumbnail: string;
  template: string;
  starred: boolean;
  role: "owner" | "edit" | "view";
  updatedAt: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  fileId: string;
  pageId: string;
  nodeId?: string;
  x: number;
  y: number;
  text: string;
  authorId: string;
  author: string;
  color: string;
  resolved: boolean;
  createdAt: string;
}

export interface VersionMeta {
  id: string;
  fileId: string;
  name: string;
  version: number;
  authorId: string;
  author: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: "edit" | "view";
  createdAt: string;
}

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  accent: string;
  icon: string;
}

export interface PresenceUser {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  role: string;
  cursor?: { x: number; y: number };
  selection?: string[];
}

export type Tool =
  | "select"
  | "hand"
  | "frame"
  | "rect"
  | "ellipse"
  | "line"
  | "text"
  | "image"
  | "comment";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Guide {
  orientation: "v" | "h";
  position: number;
  from: number;
  to: number;
}


export interface Notification {
  id: string;
  type: string;
  fileId: string;
  fileName: string;
  commentId: string;
  actorId: string;
  actor: string;
  color: string;
  text: string;
  read: boolean;
  createdAt: string;
}


export interface AISettings {
  configured: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  keyHint: string;
  updatedAt?: string;
}

export interface AIAction {
  tool: string;
  summary: string;
  nodeId?: string;
  ok?: boolean;
  count?: number;
}

export interface AIChatResponse {
  reply: string;
  sessionId: string;
  actions: AIAction[];
  doc: SigmaDoc;
  version: number;
}
