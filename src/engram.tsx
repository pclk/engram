"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { authClient } from "@/lib/auth";
import { authFetch } from "@/lib/api-client";
import {
  deleteContentResponseSchema,
  listContentResponseSchema,
  contentNodeSchema,
  contentUpsertRequestSchema,
  upsertContentResponseSchema,
  toTopicDocument,
} from "@/lib/schemas/content";
import {
  getAncestorIds,
  getAvailableSiblingName,
  getNodePath,
  getParentPath,
  getSubtreeNodeIds,
  listChildNodes,
  sanitizeNodeName,
  sortNodesForDisplay,
  splitLegacyFolderPath,
} from "@/lib/filesystem";
import type { ContentNode } from "@/lib/schemas/filesystem";
import type {
  Concept,
  Derivative,
  DerivativeType,
  TopicContent as Topic,
} from "@/lib/schemas/topic";
import {
  DEFAULT_WALLPAPER_OPACITY,
  normalizeWallpaperOpacity,
  type WallpaperOption,
} from "@/src/lib/wallpapers";
import { Account, type AccountPayload } from "@/src/views/account";

// --- Configuration & Types ---

type Mode = "BLOCK" | "NORMAL" | "INSERT";
type YankedItem =
  | { kind: "concept"; concept: Concept }
  | { kind: "derivative"; derivative: Derivative };
type FileNode = Extract<ContentNode, { type: "file" }>;
type FolderNode = Extract<ContentNode, { type: "folder" }>;
type FileSystemState = {
  rootId: string;
  nodesById: Record<string, ContentNode>;
};
type TopicMenuSnapshot = {
  fileSystem: FileSystemState;
  activeTopicId: string;
  nodeDrafts: Record<string, string>;
  currentFolderId: string;
  selectedNodeId: string | null;
  topicMenuIndex: number;
};
type LegendEntry = {
  keys: string;
  description: string;
};
type SettingsTab = "account" | "display";
type InsertSelection = {
  cursorIdx: number;
  derivIdx: number;
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};
type LiveKeyIndicator = {
  id: number;
  label: string;
  title: string;
  description: string;
  hints?: LegendEntry[];
  tone?: "blue" | "emerald" | "amber" | "rose";
  sticky?: boolean;
};
type PressedModifiers = {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
};

const NORMAL_FAST_RENDER_LIMIT = 2000;

// History State
interface HistoryState {
  topic: Topic;
  cursorIdx: number;
  derivIdx: number;
}

const isE2E = process.env.NEXT_PUBLIC_E2E === "true";
const LOCAL_FILESYSTEM_KEY = "engram.filesystem.v1";
const LOCAL_TOPICS_KEY = "engram.topics.v1";
const LOCAL_ACTIVE_TOPIC_KEY = "engram.activeTopicId.v1";
const WALLPAPER_FILENAME_KEY = "engram.wallpaper.filename.v1";
const WALLPAPER_OPACITY_KEY = "engram.wallpaper.opacity.v1";
const SHOW_KEY_BUFFER_KEY = "engram.showKeyBuffer";
const EDITOR_FONT_SCALE_KEY = "engram.editor.fontScale.v1";
const EDITOR_BLOCK_WIDTH_KEY = "engram.editor.blockWidth.v1";
const DEFAULT_EDITOR_FONT_SCALE = 1;
const MIN_EDITOR_FONT_SCALE = 0.5;
const MAX_EDITOR_FONT_SCALE = 3;
const EDITOR_FONT_SCALE_STEP = 0.05;
const DEFAULT_EDITOR_BLOCK_WIDTH = 768;
const MIN_EDITOR_BLOCK_WIDTH = 576;
const MAX_EDITOR_BLOCK_WIDTH = 3840;
const EDITOR_BLOCK_WIDTH_STEP = 1;
const CONCEPT_FONT_BASE_REM = 1.125;
const DERIVATIVE_FONT_BASE_REM = 0.875;
const EMPTY_MODIFIERS: PressedModifiers = {
  alt: false,
  ctrl: false,
  shift: false,
  meta: false,
};

const formatKeyboardKey = (key: string) => {
  if (key === " ") return "Space";
  if (key === "Escape") return "Esc";
  if (key === "Control") return "Ctrl";
  if (key === "Alt") return "Alt";
  if (key === "Shift") return "Shift";
  if (key === "Meta") return "Meta";
  return key;
};

const normalizeEditorFontScale = (
  value: string | number | null | undefined,
) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_EDITOR_FONT_SCALE;
  const snapped =
    Math.round(parsed / EDITOR_FONT_SCALE_STEP) * EDITOR_FONT_SCALE_STEP;
  return Number(
    Math.min(
      MAX_EDITOR_FONT_SCALE,
      Math.max(MIN_EDITOR_FONT_SCALE, snapped),
    ).toFixed(2),
  );
};

const normalizeEditorBlockWidth = (
  value: string | number | null | undefined,
) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_EDITOR_BLOCK_WIDTH;
  const rounded = Math.round(parsed);
  return Math.min(
    MAX_EDITOR_BLOCK_WIDTH,
    Math.max(MIN_EDITOR_BLOCK_WIDTH, rounded),
  );
};

const getToneClasses = (
  tone: LiveKeyIndicator["tone"] = "blue",
): {
  badge: string;
  title: string;
  border: string;
} => {
  switch (tone) {
    case "emerald":
      return {
        badge: "border-[#4fd6a2]/50 bg-[#10251d] text-[#73daca]",
        title: "text-[#73daca]",
        border: "border-[#214638]",
      };
    case "amber":
      return {
        badge: "border-[#ffb86c]/50 bg-[#2b1c12] text-[#ffb86c]",
        title: "text-[#ffb86c]",
        border: "border-[#4d3320]",
      };
    case "rose":
      return {
        badge: "border-[#f7768e]/50 bg-[#2d1620] text-[#f7768e]",
        title: "text-[#f7768e]",
        border: "border-[#4b2431]",
      };
    default:
      return {
        badge: "border-[#7aa2f7]/50 bg-[#172032] text-[#7aa2f7]",
        title: "text-[#7aa2f7]",
        border: "border-[#25314b]",
      };
  }
};

const getInteractionDecor = (
  tone: LiveKeyIndicator["tone"] | null,
): {
  context: string;
  focus: string;
  text: string;
  cursor: string;
  chip: string;
  index: string;
} | null => {
  switch (tone) {
    case "rose":
      return {
        context:
          "border-[#f7768e]/45 shadow-[0_0_26px_rgba(247,118,142,0.16)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(circle_at_top_right,rgba(247,118,142,0.14),transparent_62%)] before:pointer-events-none",
        focus:
          "border-[#f7768e]/55 shadow-[0_0_32px_rgba(247,118,142,0.22)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(247,118,142,0.14),transparent_58%)] before:pointer-events-none",
        text: "rounded-md bg-[linear-gradient(90deg,rgba(247,118,142,0.12),transparent_74%)] px-2 py-1 -mx-2",
        cursor:
          "bg-[#f7768e] text-[#1a1b26] shadow-[0_0_18px_rgba(247,118,142,0.35)] rounded-sm",
        chip: "border-[#f7768e]/60 bg-[#301923]/90 text-[#f7768e]",
        index: "text-[#f7768e] drop-shadow-[0_0_10px_rgba(247,118,142,0.35)]",
      };
    case "amber":
      return {
        context:
          "border-[#ffb86c]/45 shadow-[0_0_26px_rgba(255,184,108,0.16)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(circle_at_top_right,rgba(255,184,108,0.16),transparent_62%)] before:pointer-events-none",
        focus:
          "border-[#ffb86c]/55 shadow-[0_0_32px_rgba(255,184,108,0.22)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(255,184,108,0.16),transparent_58%)] before:pointer-events-none",
        text: "rounded-md bg-[linear-gradient(90deg,rgba(255,184,108,0.14),transparent_74%)] px-2 py-1 -mx-2",
        cursor:
          "bg-[#ffb86c] text-[#1a1b26] shadow-[0_0_18px_rgba(255,184,108,0.34)] rounded-sm",
        chip: "border-[#ffb86c]/60 bg-[#2f2115]/90 text-[#ffb86c]",
        index: "text-[#ffb86c] drop-shadow-[0_0_10px_rgba(255,184,108,0.32)]",
      };
    case "emerald":
      return {
        context:
          "border-[#73daca]/45 shadow-[0_0_26px_rgba(115,218,202,0.16)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(circle_at_top_right,rgba(115,218,202,0.14),transparent_62%)] before:pointer-events-none",
        focus:
          "border-[#73daca]/55 shadow-[0_0_32px_rgba(115,218,202,0.22)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(115,218,202,0.14),transparent_58%)] before:pointer-events-none",
        text: "rounded-md bg-[linear-gradient(90deg,rgba(115,218,202,0.12),transparent_74%)] px-2 py-1 -mx-2",
        cursor:
          "bg-[#73daca] text-[#0f1720] shadow-[0_0_18px_rgba(115,218,202,0.34)] rounded-sm",
        chip: "border-[#73daca]/60 bg-[#132821]/90 text-[#73daca]",
        index: "text-[#73daca] drop-shadow-[0_0_10px_rgba(115,218,202,0.32)]",
      };
    case "blue":
      return {
        context:
          "border-[#7aa2f7]/45 shadow-[0_0_26px_rgba(122,162,247,0.16)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[radial-gradient(circle_at_top_right,rgba(122,162,247,0.14),transparent_62%)] before:pointer-events-none",
        focus:
          "border-[#7aa2f7]/55 shadow-[0_0_32px_rgba(122,162,247,0.22)] before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(135deg,rgba(122,162,247,0.14),transparent_58%)] before:pointer-events-none",
        text: "rounded-md bg-[linear-gradient(90deg,rgba(122,162,247,0.12),transparent_74%)] px-2 py-1 -mx-2",
        cursor:
          "bg-[#7aa2f7] text-[#1a1b26] shadow-[0_0_18px_rgba(122,162,247,0.34)] rounded-sm",
        chip: "border-[#7aa2f7]/60 bg-[#182235]/90 text-[#7aa2f7]",
        index: "text-[#7aa2f7] drop-shadow-[0_0_10px_rgba(122,162,247,0.32)]",
      };
    default:
      return null;
  }
};

const generateId = () => {
  const webCrypto =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i += 1)
      bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const createTimestamp = () => new Date().toISOString();

const createEmptyTopic = (
  title = "Untitled Topic",
  parentId: string | null = null,
  path = "/",
): Topic => ({
  id: generateId(),
  title,
  parentId,
  path,
  concepts: [{ id: generateId(), text: "", derivatives: [] }],
});

const createRootFolder = (): FolderNode => {
  const timestamp = createTimestamp();
  return {
    id: generateId(),
    type: "folder",
    name: "Root",
    parentId: null,
    isRoot: true,
    topic: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const createFileNode = (
  parentId: string,
  name = "Untitled Topic",
): FileNode => {
  const timestamp = createTimestamp();
  return {
    id: generateId(),
    type: "file",
    name,
    parentId,
    isRoot: false,
    topic: toTopicDocument({
      concepts: [{ id: generateId(), text: "", derivatives: [] }],
    }),
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const createFolderNode = (
  parentId: string,
  name = "Untitled Folder",
): FolderNode => {
  const timestamp = createTimestamp();
  return {
    id: generateId(),
    type: "folder",
    name,
    parentId,
    isRoot: false,
    topic: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
};

const createInitialFileSystem = () => {
  const root = createRootFolder();
  const initialFile = createFileNode(root.id, "Untitled Topic");
  return {
    rootId: root.id,
    nodesById: {
      [root.id]: root,
      [initialFile.id]: initialFile,
    },
  };
};

const INITIAL_FILESYSTEM = createInitialFileSystem();
const INITIAL_TOPIC = createEmptyTopic(
  INITIAL_FILESYSTEM.nodesById[
    Object.keys(INITIAL_FILESYSTEM.nodesById).find(
      (id) => id !== INITIAL_FILESYSTEM.rootId,
    )!
  ].name,
  INITIAL_FILESYSTEM.rootId,
  "/",
);

const normalizeTopic = (topic: Topic): Topic => {
  if (!Array.isArray(topic.concepts) || topic.concepts.length === 0) {
    return {
      ...topic,
      concepts: [{ id: generateId(), text: "", derivatives: [] }],
    };
  }
  return {
    ...topic,
    title:
      typeof topic.title === "string" && topic.title.trim()
        ? topic.title
        : "Untitled Topic",
    parentId:
      typeof topic.parentId === "string" || topic.parentId === null
        ? topic.parentId
        : null,
    path:
      typeof topic.path === "string" && topic.path.trim() ? topic.path : "/",
    concepts: topic.concepts.map((concept) => {
      const derivatives = Array.isArray(concept.derivatives)
        ? concept.derivatives.map((derivative) => {
            const type: DerivativeType =
              derivative?.type === "CLOZE" ||
              derivative?.type === "ELABORATION" ||
              derivative?.type === "PROBING"
                ? derivative.type
                : "PROBING";
            return {
              id: derivative?.id ?? generateId(),
              type,
              text: typeof derivative?.text === "string" ? derivative.text : "",
            };
          })
        : [];
      return {
        id: concept?.id ?? generateId(),
        text: typeof concept?.text === "string" ? concept.text : "",
        derivatives,
      };
    }),
  };
};

const stableStringify = (value: unknown): string => {
  const sortValue = (input: any): any => {
    if (Array.isArray(input)) return input.map(sortValue);
    if (input && typeof input === "object") {
      return Object.keys(input)
        .sort()
        .reduce((acc: Record<string, any>, key) => {
          acc[key] = sortValue(input[key]);
          return acc;
        }, {});
    }
    return input;
  };
  return JSON.stringify(sortValue(value));
};

const getComparableFileNodeState = (node: FileNode) => ({
  name: node.name,
  parentId: node.parentId,
  topic: node.topic,
});

const getTopicPreview = (topic: FileNode["topic"]) => {
  const preview = topic.concepts
    .flatMap((concept) => [
      concept.text,
      ...concept.derivatives.map((derivative) => derivative.text),
    ])
    .map((text) => text.trim())
    .find(Boolean);
  return preview || "Empty note";
};

const ExplorerNodeIcon = ({ type }: { type: ContentNode["type"] }) => (
  <span
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
      type === "folder"
        ? "border-[#7aa2f7]/35 bg-[#16233a] text-[#7aa2f7]"
        : "border-[#9ece6a]/35 bg-[#17261d] text-[#9ece6a]"
    }`}
    aria-hidden
  >
    {type === "folder" ? (
      <svg
        viewBox="0 0 20 20"
        className="h-4 w-4 fill-none stroke-current"
        strokeWidth="1.6"
      >
        <path d="M2.5 6.5h5l1.4 1.7h8.6v6.8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15z" />
        <path d="M2.5 6.5V5A1.5 1.5 0 0 1 4 3.5h3.4l1.4 1.7H16A1.5 1.5 0 0 1 17.5 6.7v1.5" />
      </svg>
    ) : (
      <svg
        viewBox="0 0 20 20"
        className="h-4 w-4 fill-none stroke-current"
        strokeWidth="1.6"
      >
        <path d="M5.5 2.5h6.2l3.8 3.8V16A1.5 1.5 0 0 1 14 17.5H5.5A1.5 1.5 0 0 1 4 16V4A1.5 1.5 0 0 1 5.5 2.5z" />
        <path d="M11.7 2.5v3.8h3.8" />
        <path d="M7 10h6M7 13h4.5" />
      </svg>
    )}
  </span>
);

const fileSystemToNodes = (fileSystem: FileSystemState) =>
  Object.values(fileSystem.nodesById).sort(sortNodesForDisplay);

const getFileNode = (fileSystem: FileSystemState, id: string) => {
  const node = fileSystem.nodesById[id];
  return node?.type === "file" ? node : null;
};

const toTopicFromNode = (
  fileSystem: FileSystemState,
  fileNode: FileNode,
): Topic =>
  normalizeTopic({
    id: fileNode.id,
    title: fileNode.name,
    parentId: fileNode.parentId,
    path: getParentPath(fileNode.id, fileSystem.nodesById),
    concepts: fileNode.topic.concepts,
  });

const getVisibleExplorerNodes = (
  fileSystem: FileSystemState,
  parentId: string,
  expandedFolderIds: Record<string, boolean>,
  depth = 0,
): Array<{ node: ContentNode; depth: number }> => {
  const children = listChildNodes(fileSystem.nodesById, parentId);
  return children.flatMap((node) => {
    if (node.type === "folder" && (expandedFolderIds[node.id] ?? false)) {
      return [
        { node, depth },
        ...getVisibleExplorerNodes(
          fileSystem,
          node.id,
          expandedFolderIds,
          depth + 1,
        ),
      ];
    }
    return [{ node, depth }];
  });
};

const cloneFileSystem = (fileSystem: FileSystemState): FileSystemState => ({
  rootId: fileSystem.rootId,
  nodesById: Object.values(fileSystem.nodesById).reduce<
    Record<string, ContentNode>
  >((acc, node) => {
    acc[node.id] =
      node.type === "file"
        ? {
            ...node,
            topic: {
              concepts: node.topic.concepts.map((concept) => ({
                ...concept,
                derivatives: concept.derivatives.map((derivative) => ({
                  ...derivative,
                })),
              })),
            },
          }
        : { ...node };
    return acc;
  }, {}),
});

const migrateLegacyTopicsToFileSystem = (
  legacyTopics: Array<{
    id?: string;
    title?: string;
    folder?: string;
    concepts?: Concept[];
  }>,
) => {
  const root = createRootFolder();
  const nodesById: Record<string, ContentNode> = { [root.id]: root };
  const folderCache = new Map<string, string>([["/", root.id]]);

  for (const rawTopic of legacyTopics) {
    const legacyTopic = normalizeTopic({
      id: rawTopic.id ?? generateId(),
      title: rawTopic.title ?? "Untitled Topic",
      parentId: root.id,
      path: "/",
      concepts: Array.isArray(rawTopic.concepts)
        ? rawTopic.concepts
        : [{ id: generateId(), text: "", derivatives: [] }],
    });
    const segments = splitLegacyFolderPath(rawTopic.folder ?? "");
    let parentId = root.id;
    let currentPath = "/";

    for (const segment of segments) {
      const folderName = sanitizeNodeName(segment, "Untitled Folder");
      currentPath =
        currentPath === "/" ? `/${folderName}` : `${currentPath}/${folderName}`;
      const cachedFolderId = folderCache.get(currentPath);
      if (cachedFolderId) {
        parentId = cachedFolderId;
        continue;
      }
      const folder = createFolderNode(parentId, folderName);
      nodesById[folder.id] = folder;
      folderCache.set(currentPath, folder.id);
      parentId = folder.id;
    }

    const fileNode: FileNode = {
      ...createFileNode(
        parentId,
        sanitizeNodeName(legacyTopic.title, "Untitled Topic"),
      ),
      id: legacyTopic.id,
      topic: toTopicDocument({
        concepts: legacyTopic.concepts,
      }),
    };
    nodesById[fileNode.id] = fileNode;
  }

  return {
    rootId: root.id,
    nodesById,
  };
};

const loadLocalFileSystem = () => {
  try {
    const raw = localStorage.getItem(LOCAL_FILESYSTEM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as FileSystemState;
      if (
        parsed?.rootId &&
        parsed?.nodesById &&
        typeof parsed.nodesById === "object"
      ) {
        const nodes = Object.values(parsed.nodesById).map((node) =>
          contentNodeSchema.parse(node),
        );
        return {
          rootId: parsed.rootId,
          nodesById: nodes.reduce<Record<string, ContentNode>>((acc, node) => {
            acc[node.id] = node;
            return acc;
          }, {}),
        };
      }
    }

    const legacyRaw = localStorage.getItem(LOCAL_TOPICS_KEY);
    if (!legacyRaw) return null;
    const parsedLegacy = JSON.parse(legacyRaw);
    if (!Array.isArray(parsedLegacy)) return null;
    return migrateLegacyTopicsToFileSystem(parsedLegacy as Topic[]);
  } catch {
    return null;
  }
};

const saveLocalFileSystem = (
  fileSystem: FileSystemState,
  activeTopicId: string,
) => {
  try {
    localStorage.setItem(LOCAL_FILESYSTEM_KEY, JSON.stringify(fileSystem));
    localStorage.setItem(LOCAL_ACTIVE_TOPIC_KEY, activeTopicId);
  } catch {
    // ignore storage errors
  }
};

function sortDerivatives(derivatives: Derivative[]): Derivative[] {
  const order: Record<DerivativeType, number> = {
    PROBING: 0,
    CLOZE: 1,
    ELABORATION: 2,
  };
  return [...derivatives].sort((a, b) => {
    if (a.type === b.type) return 0;
    return order[a.type] - order[b.type];
  });
}

const isWordChar = (char: string) => /[a-zA-Z0-9_]/.test(char);

const findNextWord = (text: string, idx: number) => {
  if (idx >= text.length) return text.length;
  let i = idx;
  if (isWordChar(text[i])) {
    while (i < text.length && isWordChar(text[i])) i++;
  }
  while (i < text.length && !isWordChar(text[i])) i++;
  return i;
};

const findPrevWord = (text: string, idx: number) => {
  if (idx <= 0) return 0;
  let i = idx;
  i--;
  while (i > 0 && !isWordChar(text[i])) i--;
  while (i > 0 && isWordChar(text[i - 1])) i--;
  return i;
};

const findLineStart = (text: string, idx: number) => {
  const before = text.lastIndexOf("\n", Math.max(0, idx - 1));
  return before === -1 ? 0 : before + 1;
};

const findLineEnd = (text: string, idx: number) => {
  const next = text.indexOf("\n", idx);
  return next === -1 ? text.length : next;
};

const moveCursorLine = (text: string, idx: number, direction: -1 | 1) => {
  if (!text.includes("\n")) return idx;
  const lineStart = findLineStart(text, idx);
  const lineEnd = findLineEnd(text, idx);
  const column = idx - lineStart;
  if (direction === 1) {
    if (lineEnd >= text.length) return idx;
    const nextStart = lineEnd + 1;
    const nextEnd = findLineEnd(text, nextStart);
    return Math.min(nextStart + column, Math.max(nextStart, nextEnd - 1));
  }
  if (lineStart === 0) return idx;
  const prevEnd = lineStart - 1;
  const prevStart = findLineStart(text, prevEnd);
  return Math.min(prevStart + column, Math.max(prevStart, prevEnd));
};

const findEndWord = (text: string, idx: number) => {
  if (!text.length) return 0;
  let i = Math.min(idx, text.length - 1);
  const atEndOfWord =
    isWordChar(text[i]) && (i === text.length - 1 || !isWordChar(text[i + 1]));
  if (!isWordChar(text[i]) || atEndOfWord) {
    i++;
    while (i < text.length && !isWordChar(text[i])) i++;
    if (i >= text.length) return text.length - 1;
  }
  while (i < text.length - 1 && isWordChar(text[i + 1])) i++;
  return i;
};

const SCROLL_DURATION_MS = 120;

const clampStyle = (shouldClamp: boolean): React.CSSProperties =>
  shouldClamp
    ? {
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
      }
    : {
        overflow: "visible",
        display: "block",
        WebkitLineClamp: "unset",
        WebkitBoxOrient: "initial",
      };

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const smoothScrollTo = (
  container: HTMLElement,
  targetTop: number,
  durationMs: number,
  animationRef?: React.MutableRefObject<number | null>,
) => {
  const startTop = container.scrollTop;
  const maxScroll = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  const clampedTarget = Math.max(0, Math.min(targetTop, maxScroll));
  const distance = clampedTarget - startTop;
  if (Math.abs(distance) < 1) return;
  if (animationRef?.current) {
    cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }
  if (durationMs <= 0) {
    container.scrollTop = clampedTarget;
    return;
  }
  const startTime = performance.now();
  const easeInOut = (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = easeInOut(progress);
    container.scrollTop = startTop + distance * eased;
    if (progress < 1) requestAnimationFrame(step);
    else if (animationRef?.current) animationRef.current = null;
  };
  const frame = requestAnimationFrame(step);
  if (animationRef) animationRef.current = frame;
};

function useUndo(initialState: HistoryState) {
  const [past, setPast] = useState<HistoryState[]>([]);
  const [present, setPresent] = useState<HistoryState>(initialState);
  const [future, setFuture] = useState<HistoryState[]>([]);

  const pushState = (newState: HistoryState) => {
    setPast((prev) => [...prev, present]);
    setPresent(newState);
    setFuture([]);
  };

  const undo = () => {
    if (past.length === 0) return null;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    setFuture((prev) => [present, ...prev]);
    setPresent(previous);
    setPast(newPast);
    return previous;
  };

  const redo = () => {
    if (future.length === 0) return null;
    const next = future[0];
    const newFuture = future.slice(1);
    setPast((prev) => [...prev, present]);
    setPresent(next);
    setFuture(newFuture);
    return next;
  };

  const commitFrom = (baseState: HistoryState, newState: HistoryState) => {
    setPast((prev) => [...prev, baseState]);
    setPresent(newState);
    setFuture([]);
  };

  const reset = (newState: HistoryState) => {
    setPast([]);
    setPresent(newState);
    setFuture([]);
  };

  return {
    state: present,
    setState: setPresent,
    pushState,
    undo,
    redo,
    commitFrom,
    reset,
  };
}

// --- Components ---

const LegendItem = ({
  keys,
  description,
}: {
  keys: string;
  description: string;
}) => (
  <div className="flex items-start gap-2">
    <span className="shrink-0 rounded border border-[#2a2f45] bg-[#16161e] px-1.5 py-0.5 text-[9px] font-bold text-[#c0caf5]">
      {keys}
    </span>
    <span className="text-[10px] text-[#a9b1d6] leading-relaxed">
      {description}
    </span>
  </div>
);

// --- Main App ---

const App = ({ guestMode = false }: { guestMode?: boolean }) => {
  const useLocalPersistence = isE2E || guestMode;
  const auth = authClient as NonNullable<typeof authClient>;
  const [fileSystem, setFileSystem] =
    useState<FileSystemState>(INITIAL_FILESYSTEM);
  const [activeTopicId, setActiveTopicId] = useState(INITIAL_TOPIC.id);
  const [isHydrated, setIsHydrated] = useState(false);

  const {
    state: hState,
    setState: setHState,
    pushState,
    undo,
    redo,
    commitFrom,
    reset: resetHistory,
  } = useUndo({
    topic: INITIAL_TOPIC,
    cursorIdx: 0,
    derivIdx: -1,
  });
  const hStateRef = useRef(hState);

  const { topic, cursorIdx, derivIdx } = hState;
  const [mode, setMode] = useState<Mode>("BLOCK");
  const [normalCursor, setNormalCursor] = useState(0);
  const [keyBuffer, setKeyBuffer] = useState("");
  const blockChordRef = useRef<{ key: "space" | "i" | null; at: number }>({
    key: null,
    at: 0,
  });
  const [visualAnchor, setVisualAnchor] = useState<{
    kind: "text" | "block";
    cursorIdx: number;
    derivIdx: number;
    charIndex?: number;
  } | null>(null);
  const [yankBuffer, setYankBuffer] = useState<YankedItem[] | null>(null);
  const [yankText, setYankText] = useState<string | null>(null);
  const [normalDeletePending, setNormalDeletePending] = useState(false);
  const normalDeletePendingRef = useRef(false);
  const [normalChangePending, setNormalChangePending] = useState(false);
  const normalChangePendingRef = useRef(false);
  const [normalYankPending, setNormalYankPending] = useState(false);
  const normalYankPendingRef = useRef(false);
  const [yankFlash, setYankFlash] = useState<{
    cursorIdx: number;
    derivIdx: number;
    start: number;
    end: number;
  } | null>(null);
  const yankFlashTimerRef = useRef<number | null>(null);
  const insertDirtyRef = useRef(false);
  const insertSkipCommitRef = useRef(false);
  const insertBaseStateRef = useRef<HistoryState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(
    guestMode ? "display" : "account",
  );
  const [isDocumentSwitcherOpen, setIsDocumentSwitcherOpen] = useState(false);
  const [wallpaperOptions, setWallpaperOptions] = useState<WallpaperOption[]>(
    [],
  );
  const [wallpaperLoadStatus, setWallpaperLoadStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [selectedWallpaperFilename, setSelectedWallpaperFilename] = useState<
    string | null
  >(null);
  const [backgroundOpacity, setBackgroundOpacity] = useState(
    DEFAULT_WALLPAPER_OPACITY,
  );
  const [editorFontScale, setEditorFontScale] = useState(
    DEFAULT_EDITOR_FONT_SCALE,
  );
  const [editorBlockWidth, setEditorBlockWidth] = useState(
    DEFAULT_EDITOR_BLOCK_WIDTH,
  );
  const [editorFontPercentDraft, setEditorFontPercentDraft] = useState(
    String(Math.round(DEFAULT_EDITOR_FONT_SCALE * 100)),
  );
  const [editorBlockWidthDraft, setEditorBlockWidthDraft] = useState(
    String(DEFAULT_EDITOR_BLOCK_WIDTH),
  );
  const [insertSelection, setInsertSelection] =
    useState<InsertSelection | null>(null);
  const [showKeyBuffer, setShowKeyBuffer] = useState(true);
  const [liveKeyIndicator, setLiveKeyIndicator] =
    useState<LiveKeyIndicator | null>(null);
  const liveKeyIndicatorTimerRef = useRef<number | null>(null);
  const [pressedModifiers, setPressedModifiers] =
    useState<PressedModifiers>(EMPTY_MODIFIERS);
  const [hasLoadedClientPrefs, setHasLoadedClientPrefs] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [authSyncError, setAuthSyncError] = useState<string | null>(null);
  const [isAuthSynced, setIsAuthSynced] = useState(false);
  const user = sessionData?.user;
  const userName = guestMode
    ? "Guest"
    : ((user?.name || user?.displayName || user?.email || "User") as string);
  const initials =
    userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "U";
  const accountInitialData =
    !guestMode && sessionData?.user && sessionData?.session
      ? ({
          user: sessionData.user,
          session: sessionData.session,
        } as AccountPayload)
      : null;
  const [selectionPending, setSelectionPending] = useState<{
    action: "DELETE" | "CHANGE";
    type: DerivativeType;
    candidates: Derivative[];
  } | null>(null);
  const [nodeDrafts, setNodeDrafts] = useState<Record<string, string>>({
    [INITIAL_TOPIC.id]: INITIAL_TOPIC.title,
  });
  const [currentFolderId, setCurrentFolderId] = useState(
    INITIAL_FILESYSTEM.rootId,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    INITIAL_TOPIC.id,
  );
  const [expandedFolderIds, setExpandedFolderIds] = useState<
    Record<string, boolean>
  >({
    [INITIAL_FILESYSTEM.rootId]: true,
  });
  const [topicMenuIndex, setTopicMenuIndex] = useState(0);
  const topicMenuIndexRef = useRef(0);
  const [topicMenuEditingTarget, setTopicMenuEditingTarget] = useState<{
    id: string;
    field: "name";
  } | null>(null);
  const [topicMenuDeletePending, setTopicMenuDeletePending] = useState(false);
  const topicMenuDeletePendingRef = useRef(false);
  const topicMenuUndoStackRef = useRef<TopicMenuSnapshot[]>([]);
  const [topicMoveTargetId, setTopicMoveTargetId] = useState<string | null>(
    null,
  );
  const [topicMoveFolderIndex, setTopicMoveFolderIndex] = useState(0);
  const [lastCopiedMarkdown, setLastCopiedMarkdown] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [persistStatus, setPersistStatus] = useState<{
    state: "idle" | "saving" | "saved" | "error" | "mismatch";
    message?: string;
    at?: number;
  }>(() => ({ state: "idle" }));
  const saveTimersRef = useRef<Record<string, number>>({});
  const inFlightSavePromisesRef = useRef<Record<string, Promise<void>>>({});
  const lastSavedRef = useRef<Record<string, string>>({});
  const remoteTopicIdsRef = useRef<Set<string>>(new Set());
  const fileSystemRef = useRef(fileSystem);
  const activeTopicIdRef = useRef(activeTopicId);
  const documentSwitcherWasOpenRef = useRef(false);
  const sessionDataRef = useRef<any>(null);
  const sessionBootstrapRef = useRef<Promise<boolean> | null>(null);
  const reloginPromptedRef = useRef(false);

  const currentConcept = topic.concepts[cursorIdx];
  const currentDeriv =
    derivIdx >= 0 &&
    currentConcept &&
    currentConcept.derivatives.length > derivIdx
      ? currentConcept.derivatives[derivIdx]
      : null;
  const activeWallpaper =
    wallpaperOptions.find(
      (item) => item.filename === selectedWallpaperFilename,
    ) ?? null;
  const userId = (user?.id || null) as string | null;
  const persistMessage =
    persistStatus.message ??
    (persistStatus.state === "error"
      ? "Unknown persistence error."
      : undefined);
  const hasActiveSession = useCallback(
    (sessionPayload: any) =>
      Boolean(sessionPayload?.session && sessionPayload?.user),
    [],
  );
  const folderNodes = fileSystemToNodes(fileSystem).filter(
    (node): node is FolderNode => node.type === "folder",
  );
  const visibleExplorerNodes = getVisibleExplorerNodes(
    fileSystem,
    fileSystem.rootId,
    expandedFolderIds,
  );
  const visibleExplorerNodeIdsSignature = visibleExplorerNodes
    .map(({ node }) => node.id)
    .join("|");
  const moveableFolders = folderNodes.filter((node) => !node.isRoot);
  const activeModifierLabels = [
    pressedModifiers.alt ? "Alt" : null,
    pressedModifiers.ctrl ? "Ctrl" : null,
    pressedModifiers.shift ? "Shift" : null,
    pressedModifiers.meta ? "Meta" : null,
  ].filter((label): label is string => Boolean(label));
  const activeInteractionTone: LiveKeyIndicator["tone"] | null =
    liveKeyIndicator?.tone ??
    (pressedModifiers.alt
      ? "amber"
      : pressedModifiers.ctrl || pressedModifiers.meta
        ? "blue"
        : pressedModifiers.shift
          ? "emerald"
          : null);
  const activeInteractionDecor = getInteractionDecor(activeInteractionTone);
  const activeInteractionLabel =
    liveKeyIndicator?.label ??
    (activeModifierLabels.length > 0 ? activeModifierLabels.join("+") : null);
  const conceptTypographyStyle: React.CSSProperties = {
    fontSize: `${(CONCEPT_FONT_BASE_REM * editorFontScale).toFixed(3)}rem`,
    lineHeight: 1.75,
  };
  const derivativeTypographyStyle: React.CSSProperties = {
    fontSize: `${(DERIVATIVE_FONT_BASE_REM * editorFontScale).toFixed(3)}rem`,
    lineHeight: 1.6,
  };
  const editorFontPercent = Math.round(editorFontScale * 100);

  useEffect(() => {
    setEditorFontPercentDraft(String(editorFontPercent));
  }, [editorFontPercent]);

  useEffect(() => {
    setEditorBlockWidthDraft(String(editorBlockWidth));
  }, [editorBlockWidth]);

  useEffect(() => {
    if (mode !== "INSERT") {
      setInsertSelection(null);
      return;
    }

    setInsertSelection((prev) => {
      if (
        prev &&
        prev.cursorIdx === cursorIdx &&
        prev.derivIdx === derivIdx
      ) {
        return prev;
      }
      return {
        cursorIdx,
        derivIdx,
        start: normalCursor,
        end: normalCursor,
        direction: "none",
      };
    });
  }, [mode, cursorIdx, derivIdx, normalCursor]);

  const clearLiveKeyIndicator = useCallback(() => {
    if (liveKeyIndicatorTimerRef.current !== null) {
      window.clearTimeout(liveKeyIndicatorTimerRef.current);
      liveKeyIndicatorTimerRef.current = null;
    }
    setLiveKeyIndicator(null);
  }, []);

  const showLiveKeyHint = useCallback(
    (indicator: Omit<LiveKeyIndicator, "id">) => {
      if (liveKeyIndicatorTimerRef.current !== null) {
        window.clearTimeout(liveKeyIndicatorTimerRef.current);
        liveKeyIndicatorTimerRef.current = null;
      }
      const nextIndicator = { ...indicator, id: Date.now() + Math.random() };
      setLiveKeyIndicator(nextIndicator);
    },
    [],
  );

  const syncPressedModifiers = useCallback(
    (event: KeyboardEvent, isKeyDown: boolean) => {
      setPressedModifiers({
        alt: event.key === "Alt" ? isKeyDown : event.altKey,
        ctrl: event.key === "Control" ? isKeyDown : event.ctrlKey,
        shift: event.key === "Shift" ? isKeyDown : event.shiftKey,
        meta: event.key === "Meta" ? isKeyDown : event.metaKey,
      });
    },
    [],
  );

  const showAltModeHint = useCallback(() => {
    if (mode === "INSERT") {
      showLiveKeyHint({
        label: "Alt",
        title: "Fast exit modifier",
        description: "Leave Insert without stepping through Normal first.",
        hints: [
          { keys: "Alt+Esc", description: "Jump straight back to Block mode" },
          { keys: "Alt+[", description: "Return to Block mode" },
          { keys: "Ctrl+[", description: "Return to Block mode" },
        ],
        tone: "amber",
        sticky: true,
      });
      return;
    }

    const insertHints: LegendEntry[] = [
      { keys: "Alt+i", description: "Enter Insert at the current start point" },
      { keys: "Alt+a", description: "Enter Insert just after the cursor" },
      { keys: "Alt+Shift+A", description: "Enter Insert at the end" },
    ];

    showLiveKeyHint({
      label: "Alt",
      title: mode === "BLOCK" ? "Insert shortcut ready" : "Insert jump ready",
      description:
        mode === "BLOCK"
          ? "Skip Normal mode and open Insert immediately."
          : "Jump into Insert without using the plain Normal-mode motions.",
      hints: insertHints,
      tone: "amber",
      sticky: true,
    });
  }, [mode, showLiveKeyHint]);

  const formatPersistError = useCallback((error: unknown) => {
    if (!error) return "Unknown persistence error.";
    if (typeof error === "string") return error;
    const errorObj = error as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    } | null;
    if (errorObj?.code === "PGRST205") {
      return "Missing required table engram_nodes.";
    }
    if (error instanceof Error) {
      if (error.name === "AuthRequiredError")
        return "Auth token missing. Please sign in again.";
      return error.message || "Unexpected persistence error.";
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Unexpected persistence error.";
    }
  }, []);

  const syncActiveTopicMetadata = useCallback(
    (nextFileSystem: FileSystemState, nextActiveTopicId = activeTopicId) => {
      const activeNode = getFileNode(nextFileSystem, nextActiveTopicId);
      if (!activeNode) return;
      setHState((prev) =>
        prev.topic.id !== nextActiveTopicId
          ? prev
          : {
              ...prev,
              topic: {
                ...prev.topic,
                title: activeNode.name,
                parentId: activeNode.parentId,
                path: getParentPath(activeNode.id, nextFileSystem.nodesById),
              },
            },
      );
    },
    [activeTopicId, setHState],
  );

  const reconcilePersistedNode = useCallback(
    (
      requestedNode: ContentNode,
      requestedSerialized: string,
      persistedNode: ContentNode,
    ) => {
      const persistedSerialized = stableStringify(persistedNode);
      const currentFileSystem = fileSystemRef.current;
      const currentNode =
        currentFileSystem.nodesById[requestedNode.id] ??
        currentFileSystem.nodesById[persistedNode.id];
      const shouldApplyCanonicalNode = currentNode
        ? stableStringify(currentNode) === requestedSerialized
        : false;

      if (requestedNode.id !== persistedNode.id) {
        delete lastSavedRef.current[requestedNode.id];
        remoteTopicIdsRef.current.delete(requestedNode.id);
      }

      lastSavedRef.current[persistedNode.id] = persistedSerialized;
      remoteTopicIdsRef.current.add(persistedNode.id);

      if (!shouldApplyCanonicalNode) return;

      const nextNodesById = {
        ...currentFileSystem.nodesById,
        [persistedNode.id]: persistedNode,
      };
      if (requestedNode.id !== persistedNode.id)
        delete nextNodesById[requestedNode.id];

      const nextFileSystem = {
        rootId:
          currentFileSystem.rootId === requestedNode.id
            ? persistedNode.id
            : currentFileSystem.rootId,
        nodesById: nextNodesById,
      };

      fileSystemRef.current = nextFileSystem;
      setFileSystem(nextFileSystem);
      setNodeDrafts((prev) => {
        const nextDrafts = { ...prev };
        if (requestedNode.id !== persistedNode.id)
          delete nextDrafts[requestedNode.id];
        nextDrafts[persistedNode.id] = persistedNode.name;
        return nextDrafts;
      });
      setSelectedNodeId((prev) =>
        prev === requestedNode.id ? persistedNode.id : prev,
      );
      setTopicMenuEditingTarget((prev) =>
        prev?.id === requestedNode.id
          ? { ...prev, id: persistedNode.id }
          : prev,
      );

      const isActiveTopic =
        persistedNode.type === "file" &&
        (activeTopicIdRef.current === requestedNode.id ||
          activeTopicIdRef.current === persistedNode.id);

      if (!isActiveTopic) return;

      if (activeTopicIdRef.current !== persistedNode.id) {
        activeTopicIdRef.current = persistedNode.id;
        setActiveTopicId(persistedNode.id);
      }
      setCurrentFolderId(persistedNode.parentId ?? nextFileSystem.rootId);
      setHState((prev) =>
        prev.topic.id !== requestedNode.id && prev.topic.id !== persistedNode.id
          ? prev
          : {
              ...prev,
              topic: {
                id: persistedNode.id,
                title: persistedNode.name,
                parentId: persistedNode.parentId,
                path: getParentPath(persistedNode.id, nextFileSystem.nodesById),
                concepts: persistedNode.topic.concepts,
              },
            },
      );
    },
    [setHState],
  );

  const persistNode = useCallback(
    async (nodeId: string, fallbackNode?: ContentNode) => {
      const existingSave = inFlightSavePromisesRef.current[nodeId];
      if (existingSave) {
        await existingSave;
        return;
      }

      const savePromise = (async () => {
        const node = fileSystemRef.current.nodesById[nodeId] ?? fallbackNode;
        if (!node || node.isRoot) return;

        const parentId = node.parentId ?? fileSystemRef.current.rootId;
        if (
          parentId !== fileSystemRef.current.rootId &&
          !remoteTopicIdsRef.current.has(parentId)
        ) {
          const parentNode = fileSystemRef.current.nodesById[parentId];
          if (parentNode?.type === "folder" && !parentNode.isRoot) {
            await persistNode(parentNode.id, parentNode);
          }
        }

        const currentNode = fileSystemRef.current.nodesById[nodeId] ?? node;
        const serialized = stableStringify(currentNode);
        if (lastSavedRef.current[currentNode.id] === serialized) return;

        const payload = contentUpsertRequestSchema.parse(
          currentNode.type === "file"
            ? {
                id: isUuid(currentNode.id) ? currentNode.id : undefined,
                type: "file",
                name: currentNode.name,
                parentId: currentNode.parentId ?? fileSystemRef.current.rootId,
                topic: currentNode.topic,
              }
            : {
                id: isUuid(currentNode.id) ? currentNode.id : undefined,
                type: "folder",
                name: currentNode.name,
                parentId: currentNode.parentId ?? fileSystemRef.current.rootId,
              },
        );
        const shouldUpdate =
          !!payload.id && remoteTopicIdsRef.current.has(payload.id);
        const response = await requestWithAuth("/api/content", {
          method: shouldUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Save failed (${response.status})`);
        const data = upsertContentResponseSchema.parse(await response.json());
        reconcilePersistedNode(currentNode, serialized, data.data.node);
      })();

      inFlightSavePromisesRef.current[nodeId] = savePromise;
      try {
        await savePromise;
      } finally {
        if (inFlightSavePromisesRef.current[nodeId] === savePromise) {
          delete inFlightSavePromisesRef.current[nodeId];
        }
      }
    },
    [reconcilePersistedNode, requestWithAuth],
  );

  const getSelectedExplorerNode = useCallback(
    () =>
      visibleExplorerNodes[topicMenuIndexRef.current]?.node ??
      (selectedNodeId ? fileSystem.nodesById[selectedNodeId] : null) ??
      null,
    [fileSystem.nodesById, selectedNodeId, visibleExplorerNodes],
  );

  const getExplorerInsertionParentId = useCallback(() => {
    const selectedNode = getSelectedExplorerNode();
    if (!selectedNode) return fileSystem.rootId;
    return selectedNode.type === "folder"
      ? selectedNode.id
      : (selectedNode.parentId ?? fileSystem.rootId);
  }, [fileSystem.rootId, getSelectedExplorerNode]);

  const selectExplorerNode = useCallback(
    (
      nextFileSystem: FileSystemState,
      nextExpandedFolderIds: Record<string, boolean>,
      nodeId: string,
    ) => {
      const nextVisibleNodes = getVisibleExplorerNodes(
        nextFileSystem,
        nextFileSystem.rootId,
        nextExpandedFolderIds,
      );
      const nextIndex = Math.max(
        0,
        nextVisibleNodes.findIndex((entry) => entry.node.id === nodeId),
      );
      setTopicMenuIndex(nextIndex);
      topicMenuIndexRef.current = nextIndex;
      setSelectedNodeId(nodeId);
    },
    [],
  );

  function requestWithAuth(path: string, init?: RequestInit) {
    return authFetch(path, init, { onUnauthorized: handleUnauthorized });
  }

  const queueSaveNode = useCallback(
    (nextNode: ContentNode) => {
      if (
        useLocalPersistence ||
        !userId ||
        !isHydrated ||
        !isAuthSynced ||
        nextNode.isRoot
      )
        return;
      const serialized = stableStringify(nextNode);
      if (lastSavedRef.current[nextNode.id] === serialized) return;
      const existingTimer = saveTimersRef.current[nextNode.id];
      if (existingTimer) window.clearTimeout(existingTimer);
      saveTimersRef.current[nextNode.id] = window.setTimeout(async () => {
        delete saveTimersRef.current[nextNode.id];
        try {
          setPersistStatus({ state: "saving", message: "Saving filesystem…" });
          await persistNode(nextNode.id, nextNode);
          setPersistStatus({
            state: "saved",
            message: "Saved",
            at: Date.now(),
          });
        } catch (error) {
          console.error("Failed to save node", error);
          setPersistStatus({
            state: "error",
            message: formatPersistError(error),
          });
        }
      }, 400);
    },
    [
      formatPersistError,
      isAuthSynced,
      isHydrated,
      persistNode,
      useLocalPersistence,
      userId,
    ],
  );

  const deletePersistedNode = useCallback(
    async (nodeId: string) => {
      if (useLocalPersistence || !userId || !isHydrated || !isAuthSynced)
        return;
      const existingTimer = saveTimersRef.current[nodeId];
      if (existingTimer) window.clearTimeout(existingTimer);
      delete saveTimersRef.current[nodeId];
      delete lastSavedRef.current[nodeId];
      try {
        const response = await requestWithAuth(
          `/api/content?id=${encodeURIComponent(nodeId)}`,
          {
            method: "DELETE",
          },
        );
        if (!response.ok) throw new Error(`Delete failed (${response.status})`);
        const payload = deleteContentResponseSchema.parse(
          await response.json(),
        );
        payload.data.deletedIds.forEach((id) => {
          delete lastSavedRef.current[id];
          remoteTopicIdsRef.current.delete(id);
        });
      } catch (error) {
        console.error("Failed to delete node", error);
      }
    },
    [isAuthSynced, isHydrated, requestWithAuth, useLocalPersistence, userId],
  );

  const syncNodeDraft = useCallback((id: string, name: string) => {
    setNodeDrafts((prev) => ({ ...prev, [id]: name }));
  }, []);

  const snapshotTopicMenuState = useCallback(
    (): TopicMenuSnapshot => ({
      fileSystem: cloneFileSystem(fileSystem),
      activeTopicId,
      nodeDrafts: { ...nodeDrafts },
      currentFolderId,
      selectedNodeId,
      topicMenuIndex,
    }),
    [
      activeTopicId,
      currentFolderId,
      fileSystem,
      nodeDrafts,
      selectedNodeId,
      topicMenuIndex,
    ],
  );

  const pushTopicMenuUndoSnapshot = useCallback(() => {
    topicMenuUndoStackRef.current = [
      ...topicMenuUndoStackRef.current,
      snapshotTopicMenuState(),
    ].slice(-50);
  }, [snapshotTopicMenuState]);

  const undoTopicMenuChange = useCallback(() => {
    const snapshot = topicMenuUndoStackRef.current.pop();
    if (!snapshot) return;

    Object.values(fileSystem.nodesById).forEach((node) => {
      if (!node.isRoot && !snapshot.fileSystem.nodesById[node.id]) {
        void deletePersistedNode(node.id);
      }
    });
    Object.values(snapshot.fileSystem.nodesById).forEach((node) => {
      if (!node.isRoot) queueSaveNode(node);
    });

    setFileSystem(snapshot.fileSystem);
    setActiveTopicId(snapshot.activeTopicId);
    setNodeDrafts(snapshot.nodeDrafts);
    setCurrentFolderId(snapshot.currentFolderId);
    setSelectedNodeId(snapshot.selectedNodeId);
    setTopicMenuIndex(snapshot.topicMenuIndex);
    topicMenuIndexRef.current = snapshot.topicMenuIndex;
    setTopicMenuEditingTarget(null);
    topicMenuDeletePendingRef.current = false;
    setTopicMenuDeletePending(false);
    setTopicMoveTargetId(null);

    const restoredActive =
      getFileNode(snapshot.fileSystem, snapshot.activeTopicId) ??
      fileSystemToNodes(snapshot.fileSystem).find(
        (node): node is FileNode => node.type === "file",
      );
    if (!restoredActive) return;
    resetHistory({
      topic: toTopicFromNode(snapshot.fileSystem, restoredActive),
      cursorIdx: 0,
      derivIdx: -1,
    });
  }, [deletePersistedNode, fileSystem.nodesById, queueSaveNode, resetHistory]);
  const bootstrapSessionOnce = useCallback(async () => {
    if (guestMode) return false;
    if (!sessionBootstrapRef.current) {
      sessionBootstrapRef.current = (async () => {
        try {
          const { data } = await auth.getSession();
          setSessionData(data ?? null);
          return Boolean(data?.session && data?.user);
        } catch {
          setSessionData(null);
          return false;
        } finally {
          sessionBootstrapRef.current = null;
        }
      })();
    }
    return sessionBootstrapRef.current;
  }, [auth, guestMode]);

  const handleUnauthorized = useCallback(async () => {
    const recovered = await bootstrapSessionOnce();
    if (recovered) {
      reloginPromptedRef.current = false;
      return true;
    }
    if (!reloginPromptedRef.current) {
      reloginPromptedRef.current = true;
      setPersistStatus({
        state: "error",
        message: "Session expired. Please sign in again to continue saving.",
      });
      setToastMessage("Session expired. Redirecting to sign-in…");
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
    return false;
  }, [bootstrapSessionOnce]);

  const syncAuthCookie = useCallback(
    async (sessionPayload?: any) => {
      if (useLocalPersistence) {
        setAuthSyncError(null);
        setIsAuthSynced(true);
        return;
      }
      const session = sessionPayload ?? sessionDataRef.current;
      if (!hasActiveSession(session)) {
        setIsAuthSynced(false);
        setAuthSyncError("Not signed in.");
        throw new Error("No active session.");
      }
      setAuthSyncError(null);
      setIsAuthSynced(true);
    },
    [hasActiveSession, useLocalPersistence],
  );

  const commitNodeDraft = useCallback(
    (id: string) => {
      const target = fileSystem.nodesById[id];
      if (!target || target.isRoot) return null;
      const desiredName = sanitizeNodeName(
        nodeDrafts[id] ?? target.name,
        target.type === "file" ? "Untitled Topic" : "Untitled Folder",
      );
      const nextName = getAvailableSiblingName(
        desiredName,
        target.parentId,
        fileSystem.nodesById,
        id,
      );
      if (nextName === target.name) {
        return {
          nextFileSystem: fileSystem,
          committedNode: target,
        };
      }

      pushTopicMenuUndoSnapshot();
      const updatedNode = {
        ...target,
        name: nextName,
        updated_at: createTimestamp(),
      } as ContentNode;
      const nextFileSystem = {
        ...fileSystem,
        nodesById: {
          ...fileSystem.nodesById,
          [id]: updatedNode,
        },
      };
      setFileSystem(nextFileSystem);
      syncNodeDraft(id, nextName);
      queueSaveNode(updatedNode);
      syncActiveTopicMetadata(nextFileSystem);
      return {
        nextFileSystem,
        committedNode: updatedNode,
      };
    },
    [
      fileSystem,
      nodeDrafts,
      pushTopicMenuUndoSnapshot,
      queueSaveNode,
      syncActiveTopicMetadata,
      syncNodeDraft,
    ],
  );

  const openTopic = useCallback(
    (id: string) => {
      const committed = commitNodeDraft(id);
      const nextFileSystem = committed?.nextFileSystem ?? fileSystem;
      const target = getFileNode(nextFileSystem, id);
      if (!target) return;
      const nextTopic = toTopicFromNode(nextFileSystem, target);
      setActiveTopicId(id);
      setSelectedNodeId(id);
      setCurrentFolderId(target.parentId ?? nextFileSystem.rootId);
      setExpandedFolderIds((prev) => ({
        ...prev,
        ...getAncestorIds(target.id, nextFileSystem.nodesById).reduce<
          Record<string, boolean>
        >((acc, ancestorId) => {
          acc[ancestorId] = true;
          return acc;
        }, {}),
        [target.parentId ?? nextFileSystem.rootId]: true,
      }));
      resetHistory({ topic: nextTopic, cursorIdx: 0, derivIdx: -1 });
      setTopicMenuEditingTarget(null);
      setTopicMoveTargetId(null);
      setIsDocumentSwitcherOpen(false);
    },
    [commitNodeDraft, fileSystem, resetHistory],
  );

  const createTopic = useCallback(() => {
    const parentId = getExplorerInsertionParentId();
    pushTopicMenuUndoSnapshot();
    const newFile = createFileNode(parentId, "Untitled Topic");
    const nextFileSystem = {
      ...fileSystem,
      nodesById: {
        ...fileSystem.nodesById,
        [newFile.id]: newFile,
      },
    };
    const nextExpandedFolderIds = { ...expandedFolderIds, [parentId]: true };
    setFileSystem(nextFileSystem);
    setActiveTopicId(newFile.id);
    setCurrentFolderId(parentId);
    selectExplorerNode(nextFileSystem, nextExpandedFolderIds, newFile.id);
    syncNodeDraft(newFile.id, newFile.name);
    resetHistory({
      topic: toTopicFromNode(nextFileSystem, newFile),
      cursorIdx: 0,
      derivIdx: -1,
    });
    setExpandedFolderIds(nextExpandedFolderIds);
    setTopicMenuEditingTarget({ id: newFile.id, field: "name" });
    queueSaveNode(newFile);
  }, [
    expandedFolderIds,
    fileSystem,
    getExplorerInsertionParentId,
    pushTopicMenuUndoSnapshot,
    queueSaveNode,
    resetHistory,
    selectExplorerNode,
    syncNodeDraft,
  ]);

  const createFolder = useCallback(() => {
    const parentId = getExplorerInsertionParentId();
    pushTopicMenuUndoSnapshot();
    const newFolder = createFolderNode(parentId, "Untitled Folder");
    const nextFileSystem = {
      ...fileSystem,
      nodesById: {
        ...fileSystem.nodesById,
        [newFolder.id]: newFolder,
      },
    };
    const nextExpandedFolderIds = { ...expandedFolderIds, [parentId]: true };
    setFileSystem(nextFileSystem);
    setCurrentFolderId(parentId);
    selectExplorerNode(nextFileSystem, nextExpandedFolderIds, newFolder.id);
    setExpandedFolderIds(nextExpandedFolderIds);
    syncNodeDraft(newFolder.id, newFolder.name);
    setTopicMenuEditingTarget({ id: newFolder.id, field: "name" });
    queueSaveNode(newFolder);
  }, [
    expandedFolderIds,
    fileSystem,
    getExplorerInsertionParentId,
    pushTopicMenuUndoSnapshot,
    queueSaveNode,
    selectExplorerNode,
    syncNodeDraft,
  ]);

  const moveNodeToFolder = useCallback(
    (nodeId: string, destinationFolderId: string) => {
      const target = fileSystem.nodesById[nodeId];
      if (!target || target.isRoot || target.parentId === destinationFolderId)
        return;
      if (
        nodeId === destinationFolderId ||
        (target.type === "folder" &&
          getSubtreeNodeIds(nodeId, fileSystem.nodesById).includes(
            destinationFolderId,
          ))
      ) {
        setToastMessage("Cannot move a folder into itself.");
        return;
      }

      pushTopicMenuUndoSnapshot();
      const nextName = getAvailableSiblingName(
        target.name,
        destinationFolderId,
        fileSystem.nodesById,
        nodeId,
      );
      const updatedNode = {
        ...target,
        name: nextName,
        parentId: destinationFolderId,
        updated_at: createTimestamp(),
      } as ContentNode;
      const nextFileSystem = {
        ...fileSystem,
        nodesById: {
          ...fileSystem.nodesById,
          [nodeId]: updatedNode,
        },
      };
      setFileSystem(nextFileSystem);
      setCurrentFolderId(destinationFolderId);
      setSelectedNodeId(nodeId);
      setExpandedFolderIds((prev) => ({
        ...prev,
        [destinationFolderId]: true,
      }));
      syncNodeDraft(nodeId, nextName);
      queueSaveNode(updatedNode);
      syncActiveTopicMetadata(nextFileSystem);
      setTopicMoveTargetId(null);
    },
    [
      fileSystem,
      pushTopicMenuUndoSnapshot,
      queueSaveNode,
      syncActiveTopicMetadata,
      syncNodeDraft,
    ],
  );

  const deleteTopic = useCallback(
    (id: string) => {
      const target = fileSystem.nodesById[id];
      if (!target || target.isRoot) return;
      pushTopicMenuUndoSnapshot();

      const deletedIds = new Set(getSubtreeNodeIds(id, fileSystem.nodesById));
      let nextFileSystem: FileSystemState = {
        ...fileSystem,
        nodesById: Object.values(fileSystem.nodesById).reduce<
          Record<string, ContentNode>
        >((acc, node) => {
          if (!deletedIds.has(node.id)) acc[node.id] = node;
          return acc;
        }, {}),
      };

      let nextActiveTopicId = activeTopicId;
      if (deletedIds.has(activeTopicId)) {
        const remainingFiles = fileSystemToNodes(nextFileSystem).filter(
          (node): node is FileNode => node.type === "file",
        );
        if (remainingFiles.length === 0) {
          const fallbackFile = createFileNode(
            nextFileSystem.rootId,
            "Untitled Topic",
          );
          nextFileSystem = {
            ...nextFileSystem,
            nodesById: {
              ...nextFileSystem.nodesById,
              [fallbackFile.id]: fallbackFile,
            },
          };
          nextActiveTopicId = fallbackFile.id;
          queueSaveNode(fallbackFile);
        } else {
          nextActiveTopicId = remainingFiles[0].id;
        }
      }

      setFileSystem(nextFileSystem);
      setActiveTopicId(nextActiveTopicId);
      setCurrentFolderId(target.parentId ?? nextFileSystem.rootId);
      setSelectedNodeId(nextActiveTopicId);
      setNodeDrafts((prev) => {
        const next = { ...prev };
        deletedIds.forEach((nodeId) => delete next[nodeId]);
        return next;
      });
      setTopicMenuEditingTarget((prev) =>
        prev?.id && deletedIds.has(prev.id) ? null : prev,
      );
      setTopicMoveTargetId((prev) =>
        prev && deletedIds.has(prev) ? null : prev,
      );

      const nextActive = getFileNode(nextFileSystem, nextActiveTopicId);
      if (nextActive) {
        resetHistory({
          topic: toTopicFromNode(nextFileSystem, nextActive),
          cursorIdx: 0,
          derivIdx: -1,
        });
      }

      void deletePersistedNode(id);
    },
    [
      activeTopicId,
      deletePersistedNode,
      fileSystem,
      pushTopicMenuUndoSnapshot,
      queueSaveNode,
      resetHistory,
    ],
  );

  const activeRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const normalCursorRef = useRef(0);
  const scrollAnimationRef = useRef<number | null>(null);

  const updateTopic = (
    newTopic: Topic,
    newCursorIdx = cursorIdx,
    newDerivIdx = derivIdx,
  ) => {
    pushState({
      topic: newTopic,
      cursorIdx: newCursorIdx,
      derivIdx: newDerivIdx,
    });
  };

  const setCursor = (next: number) => {
    normalCursorRef.current = next;
    setNormalCursor(next);
  };

  const syncInsertSelectionState = (
    nextCursorIdx: number,
    nextDerivIdx: number,
    start: number,
    end: number,
    direction: "forward" | "backward" | "none" = "none",
  ) => {
    const nextStart = Math.max(0, Math.min(start, end));
    const nextEnd = Math.max(nextStart, Math.max(start, end));
    setInsertSelection({
      cursorIdx: nextCursorIdx,
      derivIdx: nextDerivIdx,
      start: nextStart,
      end: nextEnd,
      direction,
    });
    setCursor(direction === "backward" ? nextStart : nextEnd);
  };

  const syncInsertSelectionFromTextarea = (
    textarea: HTMLTextAreaElement,
    nextCursorIdx = cursorIdx,
    nextDerivIdx = derivIdx,
  ) => {
    const direction =
      textarea.selectionDirection === "forward" ||
      textarea.selectionDirection === "backward"
        ? textarea.selectionDirection
        : "none";
    syncInsertSelectionState(
      nextCursorIdx,
      nextDerivIdx,
      textarea.selectionStart,
      textarea.selectionEnd,
      direction,
    );
  };

  const cloneDerivative = (derivative: Derivative): Derivative => ({
    id: generateId(),
    type: derivative.type,
    text: derivative.text,
  });

  const cloneConcept = (concept: Concept): Concept => ({
    id: generateId(),
    text: concept.text,
    derivatives: concept.derivatives.map(cloneDerivative),
  });

  const buildFlatBlocks = () => {
    const items: Array<{
      kind: "concept" | "derivative";
      cursorIdx: number;
      derivIdx: number;
      concept: Concept;
      derivative?: Derivative;
    }> = [];

    topic.concepts.forEach((concept, cIdx) => {
      items.push({ kind: "concept", cursorIdx: cIdx, derivIdx: -1, concept });
      concept.derivatives.forEach((derivative, dIdx) => {
        items.push({
          kind: "derivative",
          cursorIdx: cIdx,
          derivIdx: dIdx,
          concept,
          derivative,
        });
      });
    });

    return items;
  };

  const yankSelection = () => {
    if (!currentConcept) return;
    if (
      visualAnchor &&
      visualAnchor.kind === "text" &&
      typeof visualAnchor.charIndex === "number" &&
      mode === "NORMAL" &&
      visualAnchor.cursorIdx === cursorIdx &&
      visualAnchor.derivIdx === derivIdx
    ) {
      const baseText =
        derivIdx === -1 ? currentConcept.text : currentDeriv?.text || "";
      const cursorPos = normalCursorRef.current;
      const start = Math.min(visualAnchor.charIndex, cursorPos);
      const end = Math.max(visualAnchor.charIndex, cursorPos);
      const selected = baseText.slice(start, end + 1);
      setYankText(selected);
      setYankBuffer(null);
      setVisualAnchor(null);
      void copyMarkdownToClipboard(selected);
      showToast("Copied");
      return;
    }
    if (visualAnchor) {
      const items = buildFlatBlocks();
      const anchorIndex = items.findIndex(
        (item) =>
          item.cursorIdx === visualAnchor.cursorIdx &&
          item.derivIdx === visualAnchor.derivIdx,
      );
      const currentIndex = items.findIndex(
        (item) => item.cursorIdx === cursorIdx && item.derivIdx === derivIdx,
      );
      if (anchorIndex === -1 || currentIndex === -1) return;
      const [start, end] =
        anchorIndex <= currentIndex
          ? [anchorIndex, currentIndex]
          : [currentIndex, anchorIndex];
      const selection: YankedItem[] = items
        .slice(start, end + 1)
        .map((item) =>
          item.kind === "concept"
            ? { kind: "concept", concept: item.concept }
            : { kind: "derivative", derivative: item.derivative! },
        );
      setYankBuffer(selection);
      setYankText(null);
      setVisualAnchor(null);
      void copyMarkdownToClipboard(yankedItemsToMarkdown(selection));
      showToast("Copied");
      return;
    }

    if (derivIdx === -1) {
      const selection: YankedItem[] = [
        { kind: "concept", concept: currentConcept },
      ];
      setYankBuffer(selection);
      setYankText(null);
      void copyMarkdownToClipboard(yankedItemsToMarkdown(selection));
      showToast("Copied");
      return;
    }
    if (currentDeriv) {
      const selection: YankedItem[] = [
        { kind: "derivative", derivative: currentDeriv },
      ];
      setYankBuffer(selection);
      setYankText(null);
      void copyMarkdownToClipboard(yankedItemsToMarkdown(selection));
      showToast("Copied");
    }
  };

  const deleteVisualTextSelection = (enterInsert: boolean) => {
    if (!currentConcept) return false;
    if (
      !visualAnchor ||
      visualAnchor.kind !== "text" ||
      typeof visualAnchor.charIndex !== "number" ||
      mode !== "NORMAL"
    )
      return false;
    if (
      visualAnchor.cursorIdx !== cursorIdx ||
      visualAnchor.derivIdx !== derivIdx
    )
      return false;
    const baseText =
      derivIdx === -1 ? currentConcept.text : currentDeriv?.text || "";
    const cursorPos = normalCursorRef.current;
    const start = Math.min(visualAnchor.charIndex, cursorPos);
    const end = Math.max(visualAnchor.charIndex, cursorPos);
    const newText = deleteRange(baseText, start, end + 1);
    setVisualAnchor(null);
    setKeyBuffer("");
    if (enterInsert) {
      applyChangeAndEnterInsert(newText, Math.min(start, newText.length));
    } else {
      applyTextChange(newText);
      setCursor(Math.min(start, Math.max(0, newText.length - 1)));
    }
    return true;
  };

  const deleteVisualBlockSelection = (enterInsert: boolean) => {
    if (!visualAnchor || visualAnchor.kind !== "block") return false;
    const items = buildFlatBlocks();
    const anchorIndex = items.findIndex(
      (item) =>
        item.cursorIdx === visualAnchor.cursorIdx &&
        item.derivIdx === visualAnchor.derivIdx,
    );
    const currentIndex = items.findIndex(
      (item) => item.cursorIdx === cursorIdx && item.derivIdx === derivIdx,
    );
    if (anchorIndex === -1 || currentIndex === -1) return false;
    const [startIdx, endIdx] =
      anchorIndex <= currentIndex
        ? [anchorIndex, currentIndex]
        : [currentIndex, anchorIndex];
    const selection = items.slice(startIdx, endIdx + 1);
    const selectedConceptIds = new Set<string>();
    const selectedDerivativeIds = new Set<string>();
    selection.forEach((item) => {
      if (item.kind === "concept") selectedConceptIds.add(item.concept.id);
      else if (item.derivative) selectedDerivativeIds.add(item.derivative.id);
    });
    let nextConcepts = topic.concepts
      .filter((concept) => !selectedConceptIds.has(concept.id))
      .map((concept) => {
        if (selectedConceptIds.has(concept.id)) return concept;
        const nextDerivs = concept.derivatives.filter(
          (deriv) => !selectedDerivativeIds.has(deriv.id),
        );
        return nextDerivs.length === concept.derivatives.length
          ? concept
          : { ...concept, derivatives: nextDerivs };
      });
    if (nextConcepts.length === 0) {
      nextConcepts = [{ id: generateId(), text: "", derivatives: [] }];
    }
    const nextTopic = { ...topic, concepts: nextConcepts };
    let nextCursorIdx = Math.min(cursorIdx, nextConcepts.length - 1);
    let nextDerivIdx = derivIdx;
    const nextConcept = nextConcepts[nextCursorIdx];
    if (!nextConcept) {
      nextCursorIdx = 0;
      nextDerivIdx = -1;
    } else if (nextDerivIdx >= nextConcept.derivatives.length) {
      nextDerivIdx = -1;
    }
    updateTopic(nextTopic, nextCursorIdx, nextDerivIdx);
    setVisualAnchor(null);
    setKeyBuffer("");
    if (enterInsert) {
      setMode("INSERT");
      setNormalCursor(0);
      insertSkipCommitRef.current = true;
    }
    return true;
  };

  const deleteRange = (text: string, start: number, end: number) => {
    const safeStart = Math.max(0, Math.min(start, text.length));
    const safeEnd = Math.max(safeStart, Math.min(end, text.length));
    return text.slice(0, safeStart) + text.slice(safeEnd);
  };

  const deleteCurrentLine = (text: string, cursor: number) => {
    const lineStart = findLineStart(text, cursor);
    const lineEnd = findLineEnd(text, cursor);
    let start = lineStart;
    let end = lineEnd;
    if (lineEnd < text.length) end = lineEnd + 1;
    else if (lineStart > 0) start = lineStart - 1;
    return { text: deleteRange(text, start, end), cursor: start };
  };

  const applyTextChange = (text: string) => {
    const newTopic = buildTopicWithText(text);
    pushState({ topic: newTopic, cursorIdx, derivIdx });
  };

  const pasteYanked = () => {
    if (mode === "NORMAL" && yankText && currentConcept) {
      const baseText =
        derivIdx === -1 ? currentConcept.text : currentDeriv?.text || "";
      const insertAt = Math.max(
        0,
        Math.min(baseText.length, normalCursorRef.current),
      );
      const newText =
        baseText.slice(0, insertAt) + yankText + baseText.slice(insertAt);
      applyTextChange(newText);
      setCursor(insertAt + yankText.length);
      return;
    }
    if (!yankBuffer || !currentConcept) return;
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    let insertCursor = { cursorIdx, derivIdx };

    yankBuffer.forEach((item) => {
      if (item.kind === "concept") {
        const newConcept = cloneConcept(item.concept);
        const insertIndex = Math.min(
          newTopic.concepts.length,
          insertCursor.cursorIdx + 1,
        );
        newTopic.concepts.splice(insertIndex, 0, newConcept);
        insertCursor = { cursorIdx: insertIndex, derivIdx: -1 };
        return;
      }

      const targetConcept = newTopic.concepts[insertCursor.cursorIdx];
      if (!targetConcept) return;
      const newDeriv = cloneDerivative(item.derivative);
      const insertIndex =
        insertCursor.derivIdx >= 0
          ? Math.min(
              targetConcept.derivatives.length,
              insertCursor.derivIdx + 1,
            )
          : targetConcept.derivatives.length;
      targetConcept.derivatives.splice(insertIndex, 0, newDeriv);
      insertCursor = {
        cursorIdx: insertCursor.cursorIdx,
        derivIdx: insertIndex,
      };
    });

    updateTopic(newTopic, insertCursor.cursorIdx, insertCursor.derivIdx);
  };

  const updateText = (text: string) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    if (derivIdx === -1) {
      newTopic.concepts[cursorIdx] = { ...newTopic.concepts[cursorIdx], text };
    } else {
      const newDerivs = [...newTopic.concepts[cursorIdx].derivatives];
      newDerivs[derivIdx] = { ...newDerivs[derivIdx], text };
      newTopic.concepts[cursorIdx].derivatives = newDerivs;
    }
    setHState({ ...hState, topic: newTopic });
    if (mode === "INSERT") {
      insertDirtyRef.current = true;
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(
      () => setToastMessage((prev) => (prev === message ? null : prev)),
      1500,
    );
  };

  const updateEditorFontScale = (
    value: string | number,
    options?: { toast?: boolean },
  ) => {
    const next = normalizeEditorFontScale(value);
    if (next === editorFontScale) {
      if (options?.toast) showToast(`Font size ${editorFontPercent}%`);
      return;
    }
    setEditorFontScale(next);
    if (options?.toast) showToast(`Font size ${Math.round(next * 100)}%`);
  };

  const commitEditorFontScaleDraft = () => {
    if (editorFontPercentDraft.trim() === "") {
      setEditorFontPercentDraft(String(editorFontPercent));
      return;
    }
    updateEditorFontScale(Number(editorFontPercentDraft) / 100);
  };

  const adjustEditorFontScale = (
    delta: number,
    options?: { toast?: boolean },
  ) => {
    updateEditorFontScale(editorFontScale + delta, options);
  };

  const updateEditorBlockWidth = (value: string | number) => {
    setEditorBlockWidth(normalizeEditorBlockWidth(value));
  };

  const commitEditorBlockWidthDraft = () => {
    if (editorBlockWidthDraft.trim() === "") {
      setEditorBlockWidthDraft(String(editorBlockWidth));
      return;
    }
    updateEditorBlockWidth(editorBlockWidthDraft);
  };

  const mapVisibleOffsetToSourceIndex = (
    sourceText: string,
    visibleText: string,
    visibleOffset: number,
  ) => {
    if (!sourceText) return 0;
    const clampedVisibleOffset = Math.max(
      0,
      Math.min(visibleOffset, visibleText.length),
    );
    if (clampedVisibleOffset === 0) return 0;

    const mappedOffsets = new Array(visibleText.length + 1).fill(
      sourceText.length,
    );
    mappedOffsets[0] = 0;

    let sourceIndex = 0;
    let visibleIndex = 0;
    while (sourceIndex < sourceText.length && visibleIndex < visibleText.length) {
      if (sourceText[sourceIndex] === visibleText[visibleIndex]) {
        visibleIndex += 1;
        mappedOffsets[visibleIndex] = sourceIndex + 1;
      }
      sourceIndex += 1;
    }

    return mappedOffsets[clampedVisibleOffset] ?? sourceText.length;
  };

  const getTextOffsetFromPoint = (
    container: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    const doc = container.ownerDocument;
    const textLength = container.textContent?.length ?? 0;
    const docWithCaretApi = doc as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };

    let caretRange: Range | null = null;

    if (typeof docWithCaretApi.caretPositionFromPoint === "function") {
      const caretPosition = docWithCaretApi.caretPositionFromPoint(
        clientX,
        clientY,
      );
      if (
        caretPosition &&
        container.contains(caretPosition.offsetNode)
      ) {
        caretRange = doc.createRange();
        caretRange.setStart(
          caretPosition.offsetNode,
          caretPosition.offset,
        );
        caretRange.collapse(true);
      }
    } else if (typeof docWithCaretApi.caretRangeFromPoint === "function") {
      const fallbackRange = docWithCaretApi.caretRangeFromPoint(
        clientX,
        clientY,
      );
      if (
        fallbackRange &&
        container.contains(fallbackRange.startContainer)
      ) {
        caretRange = fallbackRange.cloneRange();
        caretRange.collapse(true);
      }
    }

    if (!caretRange) {
      const rect = container.getBoundingClientRect();
      const isAfterMidpoint =
        clientY > rect.top + rect.height / 2 ||
        clientX > rect.left + rect.width / 2;
      return isAfterMidpoint ? textLength : 0;
    }

    const prefixRange = doc.createRange();
    prefixRange.selectNodeContents(container);
    prefixRange.setEnd(caretRange.startContainer, caretRange.startOffset);
    return Math.max(
      0,
      Math.min(prefixRange.toString().length, textLength),
    );
  };

  const resolveClickCursor = (
    container: HTMLElement,
    sourceText: string,
    clientX: number,
    clientY: number,
  ) => {
    if (!sourceText) return 0;
    const visibleText = container.textContent ?? "";
    const visibleOffset = getTextOffsetFromPoint(container, clientX, clientY);
    return mapVisibleOffsetToSourceIndex(
      sourceText,
      visibleText,
      visibleOffset,
    );
  };

  const startInsertAtLocation = (
    nextCursorIdx: number,
    nextDerivIdx: number,
    nextCursor: number,
  ) => {
    if (mode === "INSERT" && insertDirtyRef.current && !insertSkipCommitRef.current) {
      commitToHistory();
    }

    insertSkipCommitRef.current = false;
    insertDirtyRef.current = false;
    insertBaseStateRef.current = {
      topic: hStateRef.current.topic,
      cursorIdx: nextCursorIdx,
      derivIdx: nextDerivIdx,
    };

    setVisualAnchor(null);
    setKeyBuffer("");
    blockChordRef.current = { key: null, at: 0 };
    normalYankPendingRef.current = false;
    setNormalYankPending(false);
    normalDeletePendingRef.current = false;
    setNormalDeletePending(false);
    normalChangePendingRef.current = false;
    setNormalChangePending(false);
    setSelectionPending(null);
    setHState((prev) => ({
      ...prev,
      cursorIdx: nextCursorIdx,
      derivIdx: nextDerivIdx,
    }));
    syncInsertSelectionState(
      nextCursorIdx,
      nextDerivIdx,
      nextCursor,
      nextCursor,
      "none",
    );
    setMode("INSERT");
  };

  const handleTextClick = (
    event: React.MouseEvent<HTMLDivElement>,
    block: { cursorIdx: number; derivIdx: number; text: string },
  ) => {
    event.preventDefault();
    const nextCursor = resolveClickCursor(
      event.currentTarget,
      block.text,
      event.clientX,
      event.clientY,
    );
    startInsertAtLocation(block.cursorIdx, block.derivIdx, nextCursor);
  };

  const openSettingsModal = useCallback(() => {
    setSettingsTab(guestMode ? "display" : "account");
    setIsAccountOpen(true);
  }, [guestMode]);

  const applyChangeAndEnterInsert = (text: string, nextCursor: number) => {
    const newTopic = buildTopicWithText(text);
    pushState({ topic: newTopic, cursorIdx, derivIdx });
    insertSkipCommitRef.current = true;
    setMode("INSERT");
    setCursor(nextCursor);
  };

  const buildTopicWithText = (text: string) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    if (derivIdx === -1) {
      newTopic.concepts[cursorIdx] = { ...newTopic.concepts[cursorIdx], text };
    } else {
      const newDerivs = [...newTopic.concepts[cursorIdx].derivatives];
      newDerivs[derivIdx] = { ...newDerivs[derivIdx], text };
      newTopic.concepts[cursorIdx].derivatives = newDerivs;
    }
    return newTopic;
  };

  const topicToMarkdown = (source: Topic) => {
    const lines: string[] = [`# ${source.title}`];
    source.concepts.forEach((concept, index) => {
      lines.push("", `## ${index + 1}. ${concept.text || "Empty concept"}`);
      concept.derivatives.forEach((derivative) => {
        const rawText =
          derivative.text && derivative.text.length > 0
            ? derivative.text
            : "Empty";
        const textLines = rawText.split("\n");
        if (derivative.type === "ELABORATION") {
          lines.push(...textLines);
          return;
        }
        const prefix = derivative.type === "PROBING" ? "?" : "C";
        lines.push(...textLines.map((line) => `${prefix} ${line}`));
      });
    });
    return lines.join("\n");
  };

  const derivativeToMarkdownLines = (derivative: Derivative) => {
    const rawText =
      derivative.text && derivative.text.length > 0 ? derivative.text : "Empty";
    const textLines = rawText.split("\n");
    if (derivative.type === "ELABORATION") return textLines;
    const prefix = derivative.type === "PROBING" ? "?" : "C";
    return textLines.map((line) => `${prefix} ${line}`);
  };

  const yankedItemsToMarkdown = (items: YankedItem[]) => {
    const lines: string[] = [`# ${topic.title}`];
    items.forEach((item) => {
      if (item.kind === "concept") {
        const conceptIndex = topic.concepts.findIndex(
          (concept) => concept.id === item.concept.id,
        );
        const headingIndex = conceptIndex >= 0 ? conceptIndex + 1 : "?";
        lines.push(
          "",
          `## ${headingIndex}. ${item.concept.text || "Empty concept"}`,
        );
        item.concept.derivatives.forEach((derivative) => {
          lines.push(...derivativeToMarkdownLines(derivative));
        });
        return;
      }
      lines.push("", ...derivativeToMarkdownLines(item.derivative));
    });
    return lines.join("\n");
  };

  const copyMarkdownToClipboard = async (markdown: string) => {
    setLastCopiedMarkdown(markdown);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyMarkdown = async () => {
    const markdown = topicToMarkdown(topic);
    await copyMarkdownToClipboard(markdown);
    showToast("Markdown copied");
  };

  const commitToHistory = () => {
    if (insertBaseStateRef.current) {
      commitFrom(insertBaseStateRef.current, hStateRef.current);
      insertBaseStateRef.current = null;
      return;
    }
    pushState(hStateRef.current);
  };

  const performDelete = (targetIdx: number) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    const concept = newTopic.concepts[cursorIdx];
    const targetId = selectionPending?.candidates[targetIdx].id;
    concept.derivatives = concept.derivatives.filter((d) => d.id !== targetId);
    updateTopic(newTopic);
    setSelectionPending(null);
    setKeyBuffer("");
  };

  const performChange = (targetIdx: number) => {
    const newTopic = { ...topic, concepts: [...topic.concepts] };
    const concept = newTopic.concepts[cursorIdx];
    const targetId = selectionPending?.candidates[targetIdx].id;
    const realIdx = concept.derivatives.findIndex((d) => d.id === targetId);
    if (realIdx !== -1) {
      concept.derivatives[realIdx].text = "";
      setHState({ topic: newTopic, cursorIdx, derivIdx: realIdx });
      pushState({ topic: newTopic, cursorIdx, derivIdx: realIdx });
      setMode("INSERT");
      setNormalCursor(0);
      insertSkipCommitRef.current = true;
      setHState((prev) => ({ ...prev, derivIdx: realIdx }));
    }
    setSelectionPending(null);
    setKeyBuffer("");
  };

  const navigateSearch = (query: string, reverse: boolean) => {
    if (!query) return;
    const q = query.toLowerCase();

    const items: { cIdx: number; dIdx: number; text: string }[] = [];
    topic.concepts.forEach((c, ci) => {
      items.push({ cIdx: ci, dIdx: -1, text: c.text });
      c.derivatives.forEach((d, di) => {
        items.push({ cIdx: ci, dIdx: di, text: d.text });
      });
    });

    let currentPos = items.findIndex(
      (item) => item.cIdx === cursorIdx && item.dIdx === derivIdx,
    );
    if (currentPos === -1) currentPos = 0;

    let foundIdx = -1;
    if (reverse) {
      for (let i = currentPos - 1; i >= 0; i--) {
        if (items[i].text.toLowerCase().includes(q)) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx === -1) {
        for (let i = items.length - 1; i > currentPos; i--) {
          if (items[i].text.toLowerCase().includes(q)) {
            foundIdx = i;
            break;
          }
        }
      }
    } else {
      for (let i = currentPos + 1; i < items.length; i++) {
        if (items[i].text.toLowerCase().includes(q)) {
          foundIdx = i;
          break;
        }
      }
      if (foundIdx === -1) {
        for (let i = 0; i <= currentPos; i++) {
          if (items[i].text.toLowerCase().includes(q)) {
            foundIdx = i;
            break;
          }
        }
      }
    }

    if (foundIdx !== -1) {
      const target = items[foundIdx];
      setHState((prev) => ({
        ...prev,
        cursorIdx: target.cIdx,
        derivIdx: target.dIdx,
      }));
      const matchIdx = target.text.toLowerCase().indexOf(q);
      if (matchIdx !== -1) setNormalCursor(matchIdx);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const hasPendingNormalChord =
        keyBuffer !== "" ||
        normalYankPendingRef.current ||
        normalDeletePendingRef.current ||
        normalChangePendingRef.current;
      const hasPendingBlockChord =
        keyBuffer !== "" || blockChordRef.current.key !== null;
      const isModifierOnlyKey =
        e.key === "Alt" ||
        e.key === "Control" ||
        e.key === "Shift" ||
        e.key === "Meta";
      const shouldInterruptWithAlt =
        e.key === "Alt" &&
        ((mode === "NORMAL" && hasPendingNormalChord) ||
          (mode === "BLOCK" && hasPendingBlockChord));
      if (!isModifierOnlyKey || shouldInterruptWithAlt) clearLiveKeyIndicator();
      syncPressedModifiers(e, true);
      const isEditorFontIncreaseShortcut =
        (e.ctrlKey || e.metaKey) &&
        (e.key === "=" || e.key === "+" || e.key === "Add");
      const isEditorFontDecreaseShortcut =
        (e.ctrlKey || e.metaKey) &&
        (e.key === "-" || e.key === "_" || e.key === "Subtract");
      if (isEditorFontIncreaseShortcut || isEditorFontDecreaseShortcut) {
        e.preventDefault();
        adjustEditorFontScale(
          isEditorFontIncreaseShortcut
            ? EDITOR_FONT_SCALE_STEP
            : -EDITOR_FONT_SCALE_STEP,
          { toast: true },
        );
        return;
      }
      if (isAccountOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setIsAccountOpen(false);
        }
        return;
      }
      if (e.key === "Alt" && mode === "NORMAL" && hasPendingNormalChord) {
        setKeyBuffer("");
        normalYankPendingRef.current = false;
        setNormalYankPending(false);
        normalDeletePendingRef.current = false;
        setNormalDeletePending(false);
        normalChangePendingRef.current = false;
        setNormalChangePending(false);
      }
      if (e.key === "Alt" && mode === "BLOCK" && hasPendingBlockChord) {
        setKeyBuffer("");
        blockChordRef.current = { key: null, at: 0 };
      }
      if (
        e.key === "Alt" &&
        (mode === "BLOCK" || mode === "NORMAL" || mode === "INSERT")
      ) {
        showAltModeHint();
      }
      if (e.ctrlKey && (e.key === "r" || e.key === "R")) return;
      const target = e.target as HTMLElement | null;
      const isTopicMenuNameInput =
        target instanceof HTMLInputElement &&
        (target.dataset.testid || "").startsWith("topic-name-input-");
      if (isDocumentSwitcherOpen) {
        if (!isTopicMenuNameInput) {
          e.preventDefault();
          if (topicMoveTargetId) {
            if (e.key === "Escape") {
              setTopicMoveTargetId(null);
              return;
            }
            if (e.key === "j") {
              setTopicMoveFolderIndex((prev) =>
                Math.min(prev + 1, Math.max(0, visibleMoveFolders.length - 1)),
              );
              return;
            }
            if (e.key === "k") {
              setTopicMoveFolderIndex((prev) => Math.max(0, prev - 1));
              return;
            }
            if (e.key === "Enter") {
              const destination = visibleMoveFolders[topicMoveFolderIndex];
              if (destination)
                moveNodeToFolder(topicMoveTargetId, destination.id);
              return;
            }
            return;
          }
          if (e.key === "Escape") {
            setIsDocumentSwitcherOpen(false);
            setTopicMenuEditingTarget(null);
            topicMenuDeletePendingRef.current = false;
            setTopicMenuDeletePending(false);
            return;
          }
          if (e.key === "u") {
            undoTopicMenuChange();
            return;
          }
          if (topicMenuDeletePendingRef.current) {
            topicMenuDeletePendingRef.current = false;
            setTopicMenuDeletePending(false);
            if (e.key === "d") {
              const target =
                visibleExplorerNodes[topicMenuIndexRef.current]?.node;
              if (target) deleteTopic(target.id);
              return;
            }
          }
          if (e.key === "j") {
            const nextIndex = Math.min(
              topicMenuIndexRef.current + 1,
              Math.max(0, visibleExplorerNodes.length - 1),
            );
            topicMenuIndexRef.current = nextIndex;
            setTopicMenuIndex(nextIndex);
            setSelectedNodeId(visibleExplorerNodes[nextIndex]?.node.id ?? null);
            return;
          }
          if (e.key === "k") {
            const nextIndex = Math.max(0, topicMenuIndexRef.current - 1);
            topicMenuIndexRef.current = nextIndex;
            setTopicMenuIndex(nextIndex);
            setSelectedNodeId(visibleExplorerNodes[nextIndex]?.node.id ?? null);
            return;
          }
          if (e.key === "o") {
            createTopic();
            return;
          }
          if (e.key === "O") {
            createFolder();
            return;
          }
          if (e.key === "d") {
            topicMenuDeletePendingRef.current = true;
            setTopicMenuDeletePending(true);
            return;
          }
          if (e.key === "c") {
            const target =
              visibleExplorerNodes[topicMenuIndexRef.current]?.node;
            if (target) {
              setTopicMenuEditingTarget({ id: target.id, field: "name" });
              window.setTimeout(() => {
                document
                  .querySelector<HTMLInputElement>(
                    `[data-testid="topic-name-input-${target.id}"]`,
                  )
                  ?.focus();
              }, 0);
            }
            return;
          }
          if (e.key === "f") {
            const target =
              visibleExplorerNodes[topicMenuIndexRef.current]?.node;
            if (target) {
              setTopicMoveTargetId(target.id);
              setTopicMoveFolderIndex(0);
            }
            return;
          }
          if (e.key === "h") {
            const target =
              visibleExplorerNodes[topicMenuIndexRef.current]?.node;
            if (
              target?.type === "folder" &&
              (expandedFolderIds[target.id] ?? false)
            ) {
              setExpandedFolderIds((prev) => ({ ...prev, [target.id]: false }));
              return;
            }
            const parentId = target?.parentId;
            if (parentId && parentId !== fileSystem.rootId) {
              setSelectedNodeId(parentId);
              const parentIndex = visibleExplorerNodes.findIndex(
                (entry) => entry.node.id === parentId,
              );
              if (parentIndex >= 0) {
                setTopicMenuIndex(parentIndex);
                topicMenuIndexRef.current = parentIndex;
              }
            }
            return;
          }
          if (e.key === "Enter" || e.key === "l") {
            const target =
              visibleExplorerNodes[topicMenuIndexRef.current]?.node;
            if (!target) return;
            if (target.type === "folder") {
              setCurrentFolderId(target.id);
              setExpandedFolderIds((prev) => ({ ...prev, [target.id]: true }));
              setSelectedNodeId(target.id);
              return;
            }
            openTopic(target.id);
            return;
          }
          return;
        }
        if (!isTopicMenuNameInput) return;
        if (e.key === "Escape") {
          e.preventDefault();
          const targetId = topicMenuEditingTarget?.id;
          if (targetId) {
            const existingName = fileSystem.nodesById[targetId]?.name;
            if (existingName) syncNodeDraft(targetId, existingName);
          }
          setTopicMenuEditingTarget(null);
          topicMenuDeletePendingRef.current = false;
          setTopicMenuDeletePending(false);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const targetId = topicMenuEditingTarget?.id;
          if (!targetId) return;
          if (fileSystem.nodesById[targetId]?.type === "file")
            openTopic(targetId);
          else {
            commitNodeDraft(targetId);
            setTopicMenuEditingTarget(null);
          }
          return;
        }
        return;
      }

      if (isSearching) {
        if (e.key === "Escape") {
          setIsSearching(false);
          setSearchQuery("");
        }
        if (e.key === "Enter") {
          const query = searchQuery;
          setLastSearchQuery(query);
          navigateSearch(query, false);
          setIsSearching(false);
        }
        return;
      }

      if (selectionPending) {
        e.preventDefault();
        if (e.key === "Escape") {
          setSelectionPending(null);
          setKeyBuffer("");
          return;
        }
        const num = parseInt(e.key);
        if (
          !isNaN(num) &&
          num >= 1 &&
          num <= selectionPending.candidates.length
        ) {
          if (selectionPending.action === "DELETE") performDelete(num - 1);
          if (selectionPending.action === "CHANGE") performChange(num - 1);
        }
        return;
      }

      if (mode === "INSERT") {
        if (e.key === "Escape" || (e.key === "[" && (e.altKey || e.ctrlKey))) {
          e.preventDefault();
          const shouldReturnToBlock =
            (e.key === "Escape" && e.altKey) || e.key === "[";
          setMode(shouldReturnToBlock ? "BLOCK" : "NORMAL");
          if (insertDirtyRef.current && !insertSkipCommitRef.current)
            commitToHistory();
          insertSkipCommitRef.current = false;
          insertDirtyRef.current = false;
          insertBaseStateRef.current = null;
          setCursor(Math.max(0, normalCursorRef.current));
        }
        return;
      }

      if (mode === "NORMAL") {
        e.preventDefault();
        const text =
          derivIdx === -1 ? currentConcept.text : currentDeriv?.text || "";
        if (
          (e.key === "Escape" && e.altKey) ||
          (e.key === "[" && (e.altKey || e.ctrlKey))
        ) {
          setVisualAnchor(null);
          setKeyBuffer("");
          normalYankPendingRef.current = false;
          setNormalYankPending(false);
          normalDeletePendingRef.current = false;
          setNormalDeletePending(false);
          normalChangePendingRef.current = false;
          setNormalChangePending(false);
          setMode("BLOCK");
          return;
        }
        if (e.key === "Escape") {
          if (visualAnchor) {
            setVisualAnchor(null);
            return;
          }
          if (keyBuffer) {
            setKeyBuffer("");
          }
          if (normalYankPendingRef.current) {
            normalYankPendingRef.current = false;
            setNormalYankPending(false);
            return;
          }
          if (normalDeletePendingRef.current) {
            normalDeletePendingRef.current = false;
            setNormalDeletePending(false);
            return;
          }
          if (normalChangePendingRef.current) {
            normalChangePendingRef.current = false;
            setNormalChangePending(false);
            return;
          }
          setMode("BLOCK");
          return;
        }
        if (visualAnchor && e.key === "d") {
          if (deleteVisualTextSelection(false)) return;
        }
        if (visualAnchor && e.key === "c") {
          if (deleteVisualTextSelection(true)) return;
        }
        if (normalYankPendingRef.current) {
          const cursorPos = normalCursorRef.current;
          let yankedText: string | null = null;
          if (e.key === "w") {
            const end = findNextWord(text, cursorPos);
            yankedText = text.slice(cursorPos, end);
            setYankText(yankedText);
            setYankBuffer(null);
            if (end > cursorPos) triggerYankFlash(cursorPos, end - 1);
          } else if (e.key === "e") {
            const end = Math.min(text.length, findEndWord(text, cursorPos) + 1);
            yankedText = text.slice(cursorPos, end);
            setYankText(yankedText);
            setYankBuffer(null);
            if (end > cursorPos) triggerYankFlash(cursorPos, end - 1);
          } else if (e.key === "b") {
            const start = findPrevWord(text, cursorPos);
            yankedText = text.slice(start, cursorPos);
            setYankText(yankedText);
            setYankBuffer(null);
            if (cursorPos > start) triggerYankFlash(start, cursorPos - 1);
          } else if (e.key === "y") {
            yankedText = text;
            setYankText(yankedText);
            setYankBuffer(null);
            if (text.length > 0) triggerYankFlash(0, text.length - 1);
          }
          if (yankedText !== null) void copyMarkdownToClipboard(yankedText);
          normalYankPendingRef.current = false;
          setNormalYankPending(false);
          setKeyBuffer("");
          return;
        }
        if (normalDeletePendingRef.current) {
          const cursorPos = normalCursorRef.current;
          if (e.key === "w") {
            const end = findNextWord(text, cursorPos);
            const newText = deleteRange(text, cursorPos, end);
            updateTopic(buildTopicWithText(newText));
            setCursor(Math.min(cursorPos, newText.length));
            normalDeletePendingRef.current = false;
            setNormalDeletePending(false);
            setKeyBuffer("");
            return;
          }
          if (e.key === "e") {
            const end = Math.min(text.length, findEndWord(text, cursorPos) + 1);
            const newText = deleteRange(text, cursorPos, end);
            updateTopic(buildTopicWithText(newText));
            setCursor(Math.min(cursorPos, newText.length));
            normalDeletePendingRef.current = false;
            setNormalDeletePending(false);
            setKeyBuffer("");
            return;
          }
          if (e.key === "b") {
            const start = findPrevWord(text, cursorPos);
            const newText = deleteRange(text, start, cursorPos);
            updateTopic(buildTopicWithText(newText));
            setCursor(start);
            normalDeletePendingRef.current = false;
            setNormalDeletePending(false);
            setKeyBuffer("");
            return;
          }
          if (e.key === "d") {
            const { text: newText, cursor: nextCursor } = deleteCurrentLine(
              text,
              cursorPos,
            );
            updateTopic(buildTopicWithText(newText));
            setCursor(Math.min(nextCursor, newText.length));
            normalDeletePendingRef.current = false;
            setNormalDeletePending(false);
            setKeyBuffer("");
            return;
          }
          normalDeletePendingRef.current = false;
          setNormalDeletePending(false);
          setKeyBuffer("");
          return;
        }
        if (normalChangePendingRef.current) {
          const cursorPos = normalCursorRef.current;
          if (e.key === "w") {
            const end = findNextWord(text, cursorPos);
            const newText = deleteRange(text, cursorPos, end);
            applyChangeAndEnterInsert(
              newText,
              Math.min(cursorPos, newText.length),
            );
            normalChangePendingRef.current = false;
            setNormalChangePending(false);
            setKeyBuffer("");
            return;
          }
          if (e.key === "e") {
            const end = Math.min(text.length, findEndWord(text, cursorPos) + 1);
            const newText = deleteRange(text, cursorPos, end);
            applyChangeAndEnterInsert(
              newText,
              Math.min(cursorPos, newText.length),
            );
            normalChangePendingRef.current = false;
            setNormalChangePending(false);
            setKeyBuffer("");
            return;
          }
          if (e.key === "b") {
            const start = findPrevWord(text, cursorPos);
            const newText = deleteRange(text, start, cursorPos);
            applyChangeAndEnterInsert(newText, start);
            normalChangePendingRef.current = false;
            setNormalChangePending(false);
            setKeyBuffer("");
            return;
          }
          if (e.key === "c") {
            const { text: newText, cursor: nextCursor } = deleteCurrentLine(
              text,
              cursorPos,
            );
            applyChangeAndEnterInsert(
              newText,
              Math.min(nextCursor, newText.length),
            );
            normalChangePendingRef.current = false;
            setNormalChangePending(false);
            setKeyBuffer("");
            return;
          }
          normalChangePendingRef.current = false;
          setNormalChangePending(false);
          setKeyBuffer("");
          return;
        }
        if (e.key === " ") {
          showLiveKeyHint({
            label: "Space",
            title: "Leader chord armed",
            description: "Choose a workspace action from the legend below.",
            tone: "blue",
          });
          setKeyBuffer(" ");
          return;
        }
        if (e.key === "v") {
          setVisualAnchor((prev) =>
            prev && prev.kind === "text"
              ? null
              : {
                  kind: "text",
                  cursorIdx,
                  derivIdx,
                  charIndex: normalCursorRef.current,
                },
          );
          return;
        }
        if (keyBuffer === " ") {
          if (e.key === "a") {
            setKeyBuffer("");
            setTopicMenuEditingTarget(null);
            setIsDocumentSwitcherOpen(true);
            return;
          }
          if (e.key === "c") {
            setKeyBuffer("");
            handleCopyMarkdown();
            return;
          }
          setKeyBuffer("");
          return;
        }
        if (e.key === "y") {
          if (visualAnchor) {
            yankSelection();
            return;
          }
          normalYankPendingRef.current = true;
          setNormalYankPending(true);
          setKeyBuffer("y");
          return;
        }
        if (e.key === "p") {
          pasteYanked();
          return;
        }
        if (e.key === "d") {
          showLiveKeyHint({
            label: "d",
            title: "Delete chord armed",
            description: "Choose a motion below.",
            tone: "rose",
          });
          normalDeletePendingRef.current = true;
          setNormalDeletePending(true);
          setKeyBuffer("d");
          return;
        }
        if (e.key === "c") {
          showLiveKeyHint({
            label: "c",
            title: "Change chord armed",
            description: "Choose a motion below.",
            tone: "amber",
          });
          normalChangePendingRef.current = true;
          setNormalChangePending(true);
          setKeyBuffer("c");
          return;
        }

        if (e.key === "/") {
          setIsSearching(true);
          setSearchQuery("");
          return;
        }
        if (e.key === "n") {
          navigateSearch(lastSearchQuery, false);
          return;
        }
        if (e.key === "N") {
          navigateSearch(lastSearchQuery, true);
          return;
        }

        if (e.altKey && (e.key === "i" || e.key === "a" || e.key === "A")) {
          setVisualAnchor(null);
          setKeyBuffer("");
          normalYankPendingRef.current = false;
          setNormalYankPending(false);
          normalDeletePendingRef.current = false;
          setNormalDeletePending(false);
          normalChangePendingRef.current = false;
          setNormalChangePending(false);
          setMode("INSERT");
          if (e.key === "i") {
            setCursor(normalCursorRef.current);
          } else if (e.key === "a") {
            setCursor(Math.min(normalCursorRef.current + 1, text.length));
          } else {
            setCursor(text.length);
          }
          return;
        }

        if (e.key === "i") {
          setMode("INSERT");
          return;
        }
        if (e.key === "I") {
          setMode("INSERT");
          setCursor(0);
          return;
        }
        if (e.key === "a") {
          setMode("INSERT");
          setCursor(Math.min(normalCursorRef.current + 1, text.length));
          return;
        }
        if (e.key === "A") {
          setMode("INSERT");
          setCursor(text.length);
          return;
        }
        if (e.key === "o") {
          const lineEnd = findLineEnd(text, normalCursorRef.current);
          const newText = text.slice(0, lineEnd) + "\n" + text.slice(lineEnd);
          updateText(newText);
          setMode("INSERT");
          setCursor(lineEnd + 1);
          return;
        }
        if (e.key === "x") {
          const cursorPos = normalCursorRef.current;
          const newText = deleteRange(text, cursorPos, cursorPos + 1);
          applyTextChange(newText);
          const nextCursor = Math.min(
            cursorPos,
            Math.max(0, newText.length - 1),
          );
          setCursor(nextCursor);
          return;
        }
        if (e.key === "O") {
          const lineStart = findLineStart(text, normalCursorRef.current);
          const newText =
            text.slice(0, lineStart) + "\n" + text.slice(lineStart);
          updateText(newText);
          setMode("INSERT");
          setCursor(lineStart);
          return;
        }
        if (e.key === "h") setCursor(Math.max(0, normalCursorRef.current - 1));
        if (e.key === "l")
          setCursor(Math.min(text.length - 1, normalCursorRef.current + 1));
        if (e.key === "0") setCursor(0);
        if (e.key === "$") setCursor(text.length - 1);
        if (e.key === "w")
          setCursor(findNextWord(text, normalCursorRef.current));
        if (e.key === "b")
          setCursor(findPrevWord(text, normalCursorRef.current));
        if (e.key === "e")
          setCursor(findEndWord(text, normalCursorRef.current));
        if (e.key === "j") {
          setCursor(moveCursorLine(text, normalCursorRef.current, 1));
          return;
        }
        if (e.key === "k") {
          setCursor(moveCursorLine(text, normalCursorRef.current, -1));
          return;
        }
        if (e.key === "u") undo();
        if (e.key === "r") redo();
        return;
      }

      if (mode === "BLOCK") {
        e.preventDefault();
        const hasFreshBlockChord = (expected: "space" | "i") => {
          const now = Date.now();
          return (
            blockChordRef.current.key === expected &&
            now - blockChordRef.current.at <= 450
          );
        };
        if (e.key === "Escape" && visualAnchor) {
          setVisualAnchor(null);
          return;
        }
        if (e.key === "Escape" && keyBuffer === " ") {
          setKeyBuffer("");
          return;
        }
        if (!keyBuffer && e.key === " ") {
          showLiveKeyHint({
            label: "Space",
            title: "Leader chord armed",
            description: "Choose a workspace action from the legend below.",
            tone: "blue",
          });
          blockChordRef.current = { key: "space", at: Date.now() };
          setKeyBuffer(" ");
          return;
        }
        if (!keyBuffer && e.key === "v") {
          setVisualAnchor((prev) =>
            prev && prev.kind === "block"
              ? null
              : { kind: "block", cursorIdx, derivIdx },
          );
          return;
        }
        if (visualAnchor && e.key === "d") {
          if (deleteVisualBlockSelection(false)) return;
        }
        if (visualAnchor && e.key === "c") {
          if (deleteVisualBlockSelection(true)) return;
        }
        if (keyBuffer === " " || hasFreshBlockChord("space")) {
          blockChordRef.current = { key: null, at: 0 };
          if (e.key === "a") {
            setKeyBuffer("");
            setTopicMenuEditingTarget(null);
            setIsDocumentSwitcherOpen(true);
            return;
          }
          if (e.key === "c") {
            setKeyBuffer("");
            handleCopyMarkdown();
            return;
          }
          setKeyBuffer("");
          return;
        }
        if (!keyBuffer && e.key === "y") {
          yankSelection();
          return;
        }
        if (!keyBuffer && e.key === "p") {
          pasteYanked();
          return;
        }
        if (e.key === "/") {
          setIsSearching(true);
          setSearchQuery("");
          return;
        }
        if (e.key === "n") {
          navigateSearch(lastSearchQuery, false);
          return;
        }
        if (e.key === "N") {
          navigateSearch(lastSearchQuery, true);
          return;
        }

        if (e.altKey && (e.key === "i" || e.key === "a" || e.key === "A")) {
          if (derivIdx !== -1 && !currentDeriv) return;
          const text =
            derivIdx === -1 ? currentConcept.text : currentDeriv?.text || "";
          blockChordRef.current = { key: null, at: 0 };
          setKeyBuffer("");
          setMode("INSERT");
          if (e.key === "i") {
            setNormalCursor(0);
          } else if (e.key === "a") {
            setNormalCursor(Math.min(1, text.length));
          } else {
            setNormalCursor(text.length);
          }
          return;
        }

        if (e.key === "i") {
          if (hasFreshBlockChord("i")) {
            blockChordRef.current = { key: null, at: 0 };
            if (derivIdx !== -1 && !currentDeriv) return;
            setMode("INSERT");
            setNormalCursor(0);
            return;
          }
          blockChordRef.current = { key: "i", at: Date.now() };
          if (derivIdx !== -1 && !currentDeriv) return;
          setMode("NORMAL");
          setNormalCursor(0);
          return;
        }
        if (e.key === "a") {
          if (derivIdx !== -1 && !currentDeriv) return;
          setMode("NORMAL");
          const text =
            derivIdx === -1 ? currentConcept.text : currentDeriv?.text || "";
          setNormalCursor(text.length);
          return;
        }

        if (keyBuffer) {
          if (e.key === "Escape") {
            setKeyBuffer("");
            return;
          }
          if (keyBuffer === "o") {
            if (e.key === "p") {
              const newId = generateId();
              const newTopic = { ...topic, concepts: [...topic.concepts] };
              const concept = newTopic.concepts[cursorIdx];
              concept.derivatives = sortDerivatives([
                ...concept.derivatives,
                { id: newId, type: "PROBING", text: "" },
              ]);
              const newIdx = concept.derivatives.findIndex(
                (d) => d.id === newId,
              );
              updateTopic(newTopic, cursorIdx, newIdx);
              setMode("INSERT");
            } else if (e.key === "c") {
              const newId = generateId();
              const newTopic = { ...topic, concepts: [...topic.concepts] };
              const concept = newTopic.concepts[cursorIdx];
              concept.derivatives = sortDerivatives([
                ...concept.derivatives,
                { id: newId, type: "CLOZE", text: "" },
              ]);
              const newIdx = concept.derivatives.findIndex(
                (d) => d.id === newId,
              );
              updateTopic(newTopic, cursorIdx, newIdx);
              setMode("INSERT");
            } else if (e.key === "e") {
              const newId = generateId();
              const newTopic = { ...topic, concepts: [...topic.concepts] };
              const concept = newTopic.concepts[cursorIdx];
              concept.derivatives = sortDerivatives([
                ...concept.derivatives,
                { id: newId, type: "ELABORATION", text: "" },
              ]);
              const newIdx = concept.derivatives.findIndex(
                (d) => d.id === newId,
              );
              updateTopic(newTopic, cursorIdx, newIdx);
              setMode("INSERT");
            }
            setKeyBuffer("");
            return;
          }
          if (keyBuffer === "d") {
            if (e.key === "d") {
              if (derivIdx === -1) {
                const newTopic = {
                  ...topic,
                  concepts: topic.concepts.filter((_, i) => i !== cursorIdx),
                };
                if (newTopic.concepts.length === 0)
                  newTopic.concepts = [
                    { id: generateId(), text: "", derivatives: [] },
                  ];
                updateTopic(
                  newTopic,
                  Math.min(cursorIdx, newTopic.concepts.length - 1),
                  -1,
                );
              } else if (currentDeriv) {
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                const concept = newTopic.concepts[cursorIdx];
                concept.derivatives = concept.derivatives.filter(
                  (_, i) => i !== derivIdx,
                );
                updateTopic(newTopic, cursorIdx, Math.max(-1, derivIdx - 1));
              }
              setKeyBuffer("");
            } else if (e.key === "p") {
              const probes = currentConcept.derivatives.filter(
                (d) => d.type === "PROBING",
              );
              if (probes.length === 1) {
                const targetId = probes[0].id;
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts[cursorIdx].derivatives = newTopic.concepts[
                  cursorIdx
                ].derivatives.filter((d) => d.id !== targetId);
                updateTopic(newTopic);
                setKeyBuffer("");
              } else if (probes.length > 1) {
                setSelectionPending({
                  action: "DELETE",
                  type: "PROBING",
                  candidates: probes,
                });
              } else {
                setKeyBuffer("");
              }
            } else if (e.key === "c") {
              const clozes = currentConcept.derivatives.filter(
                (d) => d.type === "CLOZE",
              );
              if (clozes.length === 1) {
                const targetId = clozes[0].id;
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts[cursorIdx].derivatives = newTopic.concepts[
                  cursorIdx
                ].derivatives.filter((d) => d.id !== targetId);
                updateTopic(newTopic);
                setKeyBuffer("");
              } else if (clozes.length > 1) {
                setSelectionPending({
                  action: "DELETE",
                  type: "CLOZE",
                  candidates: clozes,
                });
              } else {
                setKeyBuffer("");
              }
            } else if (e.key === "e") {
              const elaborations = currentConcept.derivatives.filter(
                (d) => d.type === "ELABORATION",
              );
              if (elaborations.length === 1) {
                const targetId = elaborations[0].id;
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts[cursorIdx].derivatives = newTopic.concepts[
                  cursorIdx
                ].derivatives.filter((d) => d.id !== targetId);
                updateTopic(newTopic);
                setKeyBuffer("");
              } else if (elaborations.length > 1) {
                setSelectionPending({
                  action: "DELETE",
                  type: "ELABORATION",
                  candidates: elaborations,
                });
              } else {
                setKeyBuffer("");
              }
            }
            return;
          }
          if (keyBuffer === "c") {
            if (e.key === "c") {
              const newTopic = { ...topic, concepts: [...topic.concepts] };
              if (derivIdx === -1) newTopic.concepts[cursorIdx].text = "";
              else if (currentDeriv)
                newTopic.concepts[cursorIdx].derivatives[derivIdx].text = "";
              updateTopic(newTopic);
              setMode("INSERT");
              setNormalCursor(0);
              insertSkipCommitRef.current = true;
              setKeyBuffer("");
            } else if (e.key === "p") {
              const probes = currentConcept.derivatives.filter(
                (d) => d.type === "PROBING",
              );
              if (probes.length === 1) {
                const targetId = probes[0].id;
                const realIdx = currentConcept.derivatives.findIndex(
                  (d) => d.id === targetId,
                );
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts[cursorIdx].derivatives[realIdx].text = "";
                updateTopic(newTopic, cursorIdx, realIdx);
                setMode("INSERT");
                setNormalCursor(0);
                insertSkipCommitRef.current = true;
                setKeyBuffer("");
              } else if (probes.length > 1) {
                setSelectionPending({
                  action: "CHANGE",
                  type: "PROBING",
                  candidates: probes,
                });
              } else {
                setKeyBuffer("");
              }
            } else if (e.key === "l") {
              const clozes = currentConcept.derivatives.filter(
                (d) => d.type === "CLOZE",
              );
              if (clozes.length === 1) {
                const targetId = clozes[0].id;
                const realIdx = currentConcept.derivatives.findIndex(
                  (d) => d.id === targetId,
                );
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts[cursorIdx].derivatives[realIdx].text = "";
                updateTopic(newTopic, cursorIdx, realIdx);
                setMode("INSERT");
                setNormalCursor(0);
                insertSkipCommitRef.current = true;
                setKeyBuffer("");
              } else if (clozes.length > 1) {
                setSelectionPending({
                  action: "CHANGE",
                  type: "CLOZE",
                  candidates: clozes,
                });
              } else {
                setKeyBuffer("");
              }
            } else if (e.key === "e") {
              const elaborations = currentConcept.derivatives.filter(
                (d) => d.type === "ELABORATION",
              );
              if (elaborations.length === 1) {
                const targetId = elaborations[0].id;
                const realIdx = currentConcept.derivatives.findIndex(
                  (d) => d.id === targetId,
                );
                const newTopic = { ...topic, concepts: [...topic.concepts] };
                newTopic.concepts[cursorIdx].derivatives[realIdx].text = "";
                updateTopic(newTopic, cursorIdx, realIdx);
                setMode("INSERT");
                setNormalCursor(0);
                insertSkipCommitRef.current = true;
                setKeyBuffer("");
              } else if (elaborations.length > 1) {
                setSelectionPending({
                  action: "CHANGE",
                  type: "ELABORATION",
                  candidates: elaborations,
                });
              } else {
                setKeyBuffer("");
              }
            }
            return;
          }
        }
        if (e.key === "j") {
          if (derivIdx === -1)
            setHState((prev) => ({
              ...prev,
              cursorIdx: Math.min(
                prev.cursorIdx + 1,
                topic.concepts.length - 1,
              ),
            }));
          else {
            const maxIdx = Math.max(0, currentConcept.derivatives.length - 1);
            setHState((prev) => ({
              ...prev,
              derivIdx: Math.min(prev.derivIdx + 1, maxIdx),
            }));
          }
        }
        if (e.key === "k") {
          if (derivIdx === -1)
            setHState((prev) => ({
              ...prev,
              cursorIdx: Math.max(0, prev.cursorIdx - 1),
            }));
          else
            setHState((prev) => ({
              ...prev,
              derivIdx: Math.max(0, prev.derivIdx - 1),
            }));
        }
        if (e.key === "h") {
          if (derivIdx !== -1) setHState((prev) => ({ ...prev, derivIdx: -1 }));
        }
        if (e.key === "l") {
          if (derivIdx === -1) setHState((prev) => ({ ...prev, derivIdx: 0 }));
        }
        if (e.key === "o") {
          if (derivIdx === -1) {
            const newId = generateId();
            const newTopic = { ...topic, concepts: [...topic.concepts] };
            newTopic.concepts.splice(cursorIdx + 1, 0, {
              id: newId,
              text: "",
              derivatives: [],
            });
            updateTopic(newTopic, cursorIdx + 1, -1);
            setMode("INSERT");
          } else {
            showLiveKeyHint({
              label: "o",
              title: "Add derivative chord armed",
              description: "Choose which derivative type to create.",
              tone: "blue",
            });
            setKeyBuffer("o");
          }
        }
        if (e.key === "O") {
          if (derivIdx === -1) {
            const newId = generateId();
            const newTopic = { ...topic, concepts: [...topic.concepts] };
            newTopic.concepts.splice(cursorIdx, 0, {
              id: newId,
              text: "",
              derivatives: [],
            });
            updateTopic(newTopic, cursorIdx, -1);
            setMode("INSERT");
          }
        }
        if (e.key === "d") {
          showLiveKeyHint({
            label: "d",
            title: "Delete chord armed",
            description: "Choose what to delete from this concept.",
            tone: "rose",
          });
          setKeyBuffer("d");
        }
        if (e.key === "c") {
          showLiveKeyHint({
            label: "c",
            title: "Change chord armed",
            description: "Choose what to rewrite from this concept.",
            tone: "amber",
          });
          setKeyBuffer("c");
        }
        if (e.key === "u") undo();
        if (e.key === "r") redo();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      syncPressedModifiers(e, false);
      if (e.key === "Alt" || e.key === "Control" || e.key === "Shift") {
        setLiveKeyIndicator((current) =>
          current?.sticky && current.label === formatKeyboardKey(e.key)
            ? null
            : current,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  });

  useLayoutEffect(() => {
    if (mode !== "BLOCK") return;
    const container = scrollContainerRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const paddingTop = parseFloat(
      getComputedStyle(container).paddingTop || "0",
    );
    const targetTop =
      container.scrollTop + (activeRect.top - containerRect.top) - paddingTop;
    smoothScrollTo(
      container,
      targetTop,
      SCROLL_DURATION_MS,
      scrollAnimationRef,
    );
  }, [cursorIdx, derivIdx, mode]);

  useLayoutEffect(() => {
    if (mode !== "NORMAL") return;
    const container = scrollContainerRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    const cursorEl = active.querySelector<HTMLElement>(".char-cursor");
    if (!cursorEl) return;
    const containerRect = container.getBoundingClientRect();
    const cursorRect = cursorEl.getBoundingClientRect();
    const cursorCenter = (cursorRect.top + cursorRect.bottom) / 2;
    const containerCenter = (containerRect.top + containerRect.bottom) / 2;
    const offset = cursorCenter - containerCenter;
    if (Math.abs(offset) > 1) {
      const targetTop = container.scrollTop + offset;
      smoothScrollTo(
        container,
        targetTop,
        SCROLL_DURATION_MS,
        scrollAnimationRef,
      );
    }
  }, [
    mode,
    normalCursor,
    cursorIdx,
    derivIdx,
    isSearching,
    searchQuery,
    lastSearchQuery,
    visualAnchor,
  ]);

  useEffect(() => {
    let isActive = true;
    const fetchSession = async () => {
      if (guestMode) return;
      const { data } = await auth.getSession();
      if (!isActive) return;
      setSessionData(data ?? null);
      if (data?.session) {
        try {
          await syncAuthCookie(data);
        } catch (error) {
          console.error("Failed to bootstrap auth cookie", error);
        }
      }
    };
    fetchSession();
    return () => {
      isActive = false;
    };
  }, [auth, guestMode, syncAuthCookie]);

  useEffect(() => {
    if (guestMode) return;
    const maybeSubscribe =
      (auth as any)?.onAuthStateChange ?? (auth as any)?.onAuthStateChanged;
    if (typeof maybeSubscribe !== "function") return;
    const subscription = maybeSubscribe.call(
      auth,
      async (event: string, payload: any) => {
        setSessionData(payload ?? null);
        if (!payload?.session) {
          setIsAuthSynced(false);
          setAuthSyncError(null);
          return;
        }
        try {
          await syncAuthCookie(payload);
        } catch (error) {
          console.error(`Failed to sync auth cookie on ${event}`, error);
        }
      },
    );
    return () => {
      const unsubscribe = subscription?.unsubscribe ?? subscription;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [auth, guestMode, syncAuthCookie]);

  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  useLayoutEffect(() => {
    try {
      setSelectedWallpaperFilename(
        localStorage.getItem(WALLPAPER_FILENAME_KEY),
      );
      setBackgroundOpacity(
        normalizeWallpaperOpacity(localStorage.getItem(WALLPAPER_OPACITY_KEY)),
      );
      setEditorFontScale(
        normalizeEditorFontScale(localStorage.getItem(EDITOR_FONT_SCALE_KEY)),
      );
      setEditorBlockWidth(
        normalizeEditorBlockWidth(localStorage.getItem(EDITOR_BLOCK_WIDTH_KEY)),
      );
      const storedShowKeyBuffer = localStorage.getItem(SHOW_KEY_BUFFER_KEY);
      if (storedShowKeyBuffer !== null) {
        setShowKeyBuffer(storedShowKeyBuffer === "true");
      }
    } catch {
      // ignore storage errors
    } finally {
      setHasLoadedClientPrefs(true);
    }
  }, []);

  useEffect(() => {
    if (useLocalPersistence) return;
    if (!userId) {
      setPersistStatus({
        state: "error",
        message: "Not signed in. Persistence disabled.",
      });
      return;
    }
    if (!isAuthSynced) {
      setPersistStatus({
        state: "error",
        message: authSyncError ?? "Authenticating persistence session…",
      });
      return;
    }
    if (!isHydrated) {
      setPersistStatus({ state: "idle", message: "Loading topics…" });
    }
  }, [authSyncError, isAuthSynced, useLocalPersistence, userId, isHydrated]);

  useEffect(() => {
    if (!useLocalPersistence) return;
    setPersistStatus({
      state: "saved",
      message: guestMode
        ? "Local persistence (Guest mode)"
        : "Local persistence (E2E)",
    });
  }, [useLocalPersistence, guestMode]);

  useEffect(() => {
    let isActive = true;
    const hydrateTopics = async () => {
      if (isHydrated) return;
      if (useLocalPersistence) {
        const stored = loadLocalFileSystem();
        const activeId = localStorage.getItem(LOCAL_ACTIVE_TOPIC_KEY);
        const nextFileSystem = stored ?? createInitialFileSystem();
        const nextFiles = fileSystemToNodes(nextFileSystem).filter(
          (node): node is FileNode => node.type === "file",
        );
        const nextActiveNode =
          nextFiles.find((node) => node.id === activeId) || nextFiles[0];
        if (!nextActiveNode) return;
        const nextTopic = toTopicFromNode(nextFileSystem, nextActiveNode);
        if (!isActive) return;
        setFileSystem(nextFileSystem);
        setActiveTopicId(nextActiveNode.id);
        setCurrentFolderId(nextActiveNode.parentId ?? nextFileSystem.rootId);
        setSelectedNodeId(nextActiveNode.id);
        setExpandedFolderIds({
          [nextFileSystem.rootId]: true,
          ...getAncestorIds(nextActiveNode.id, nextFileSystem.nodesById).reduce<
            Record<string, boolean>
          >((acc, id) => {
            acc[id] = true;
            return acc;
          }, {}),
        });
        setNodeDrafts(
          fileSystemToNodes(nextFileSystem).reduce<Record<string, string>>(
            (acc, node) => {
              if (!node.isRoot) acc[node.id] = node.name;
              return acc;
            },
            {},
          ),
        );
        resetHistory({ topic: nextTopic, cursorIdx: 0, derivIdx: -1 });
        if (!stored) saveLocalFileSystem(nextFileSystem, nextActiveNode.id);
        setIsHydrated(true);
        return;
      }
      if (!userId) return;
      if (!isAuthSynced) return;
      try {
        const response = await requestWithAuth("/api/content");
        if (!response.ok) throw new Error(`Load failed (${response.status})`);
        const payload = listContentResponseSchema.parse(await response.json());
        const nodesById = payload.data.nodes.reduce<
          Record<string, ContentNode>
        >((acc, node) => {
          remoteTopicIdsRef.current.add(node.id);
          acc[node.id] = node;
          return acc;
        }, {});
        let nextFileSystem: FileSystemState = {
          rootId: payload.data.rootId,
          nodesById,
        };
        let nextFiles = fileSystemToNodes(nextFileSystem).filter(
          (node): node is FileNode => node.type === "file",
        );
        if (nextFiles.length === 0) {
          const fallbackFile = createFileNode(
            nextFileSystem.rootId,
            "Untitled Topic",
          );
          nextFileSystem = {
            ...nextFileSystem,
            nodesById: {
              ...nextFileSystem.nodesById,
              [fallbackFile.id]: fallbackFile,
            },
          };
          nextFiles = [fallbackFile];
          queueSaveNode(fallbackFile);
        }
        const nextActiveNode = nextFiles[0];
        if (!isActive) return;
        setFileSystem(nextFileSystem);
        setActiveTopicId(nextActiveNode.id);
        setCurrentFolderId(nextActiveNode.parentId ?? nextFileSystem.rootId);
        setSelectedNodeId(nextActiveNode.id);
        setExpandedFolderIds({
          [nextFileSystem.rootId]: true,
          ...getAncestorIds(nextActiveNode.id, nextFileSystem.nodesById).reduce<
            Record<string, boolean>
          >((acc, id) => {
            acc[id] = true;
            return acc;
          }, {}),
        });
        setNodeDrafts(
          fileSystemToNodes(nextFileSystem).reduce<Record<string, string>>(
            (acc, node) => {
              if (!node.isRoot) acc[node.id] = node.name;
              return acc;
            },
            {},
          ),
        );
        resetHistory({
          topic: toTopicFromNode(nextFileSystem, nextActiveNode),
          cursorIdx: 0,
          derivIdx: -1,
        });
        setIsHydrated(true);
        setPersistStatus({ state: "idle", message: "Ready to save." });
      } catch (error) {
        console.error("Failed to load topics", error);
        if (!isActive) return;
        const message = formatPersistError(error);
        setPersistStatus({ state: "error", message });
        setIsHydrated(true);
      }
    };
    hydrateTopics();
    return () => {
      isActive = false;
    };
  }, [
    formatPersistError,
    isAuthSynced,
    isHydrated,
    queueSaveNode,
    requestWithAuth,
    resetHistory,
    userId,
    useLocalPersistence,
  ]);

  useEffect(() => {
    normalCursorRef.current = normalCursor;
  }, [normalCursor]);

  useEffect(() => {
    if (!isHydrated || !useLocalPersistence) return;
    saveLocalFileSystem(fileSystem, activeTopicId);
  }, [fileSystem, activeTopicId, isHydrated, useLocalPersistence]);

  useEffect(() => {
    if (!isHydrated) return;
    const existing = getFileNode(fileSystem, activeTopicId);
    if (!existing || hState.topic.id !== activeTopicId) return;
    const nextComparableState = {
      name: sanitizeNodeName(hState.topic.title, "Untitled Topic"),
      parentId: hState.topic.parentId ?? fileSystem.rootId,
      topic: toTopicDocument({ concepts: hState.topic.concepts }),
    };
    if (
      stableStringify(nextComparableState) ===
      stableStringify(getComparableFileNodeState(existing))
    )
      return;
    const updatedNode: FileNode = {
      ...existing,
      ...nextComparableState,
      updated_at: createTimestamp(),
    };
    setFileSystem((prev) => ({
      ...prev,
      nodesById: {
        ...prev.nodesById,
        [updatedNode.id]: updatedNode,
      },
    }));
    setNodeDrafts((prev) => ({ ...prev, [updatedNode.id]: updatedNode.name }));
    queueSaveNode(updatedNode);
  }, [activeTopicId, fileSystem, hState.topic, isHydrated, queueSaveNode]);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer as number),
      );
      saveTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    hStateRef.current = hState;
  }, [hState]);

  useEffect(() => {
    fileSystemRef.current = fileSystem;
  }, [fileSystem]);

  useEffect(() => {
    activeTopicIdRef.current = activeTopicId;
  }, [activeTopicId]);

  useEffect(() => {
    topicMenuDeletePendingRef.current = topicMenuDeletePending;
  }, [topicMenuDeletePending]);

  useEffect(() => {
    topicMenuIndexRef.current = topicMenuIndex;
  }, [topicMenuIndex]);

  useEffect(() => {
    if (!isDocumentSwitcherOpen) {
      documentSwitcherWasOpenRef.current = false;
      return;
    }
    const activeIndex = visibleExplorerNodes.findIndex(
      (item) => item.node.id === (selectedNodeId ?? activeTopicId),
    );
    const nextIndex = activeIndex >= 0 ? activeIndex : 0;
    setTopicMenuIndex(nextIndex);
    topicMenuIndexRef.current = nextIndex;
    if (!documentSwitcherWasOpenRef.current) {
      setTopicMenuEditingTarget(null);
      topicMenuDeletePendingRef.current = false;
      setTopicMenuDeletePending(false);
      documentSwitcherWasOpenRef.current = true;
    }
  }, [
    activeTopicId,
    isDocumentSwitcherOpen,
    selectedNodeId,
    visibleExplorerNodeIdsSignature,
  ]);

  useEffect(() => {
    if (!isDocumentSwitcherOpen || !topicMenuEditingTarget) return;
    const focusInput = () => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-testid="topic-name-input-${topicMenuEditingTarget.id}"]`,
      );
      if (input) {
        input.focus();
        input.select();
        return true;
      }
      return false;
    };
    requestAnimationFrame(() => {
      if (focusInput()) return;
      setTimeout(focusInput, 50);
    });
  }, [
    isDocumentSwitcherOpen,
    topicMenuEditingTarget,
    visibleExplorerNodes.length,
  ]);

  useEffect(() => {
    if (mode === "INSERT") {
      if (!insertBaseStateRef.current) {
        insertBaseStateRef.current = hStateRef.current;
      }
      insertDirtyRef.current = false;
    }
  }, [mode]);

  useEffect(() => {
    normalDeletePendingRef.current = normalDeletePending;
  }, [normalDeletePending]);

  useEffect(() => {
    normalChangePendingRef.current = normalChangePending;
  }, [normalChangePending]);

  useEffect(() => {
    normalYankPendingRef.current = normalYankPending;
  }, [normalYankPending]);

  useEffect(() => () => clearLiveKeyIndicator(), [clearLiveKeyIndicator]);

  useEffect(() => {
    if (!hasLoadedClientPrefs) return;
    try {
      localStorage.setItem(SHOW_KEY_BUFFER_KEY, String(showKeyBuffer));
    } catch {
      // ignore storage errors
    }
  }, [hasLoadedClientPrefs, showKeyBuffer]);

  useEffect(() => {
    if (!hasLoadedClientPrefs) return;
    try {
      localStorage.setItem(EDITOR_FONT_SCALE_KEY, String(editorFontScale));
    } catch {
      // ignore storage errors
    }
  }, [editorFontScale, hasLoadedClientPrefs]);

  useEffect(() => {
    if (!hasLoadedClientPrefs) return;
    try {
      localStorage.setItem(EDITOR_BLOCK_WIDTH_KEY, String(editorBlockWidth));
    } catch {
      // ignore storage errors
    }
  }, [editorBlockWidth, hasLoadedClientPrefs]);

  useEffect(() => {
    let cancelled = false;

    const loadWallpapers = async () => {
      setWallpaperLoadStatus("loading");
      try {
        const response = await fetch("/api/wallpapers", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(
            `Wallpaper request failed with status ${response.status}.`,
          );
        }

        const payload = (await response.json()) as {
          data?: { wallpapers?: WallpaperOption[] };
        };
        const wallpapers = Array.isArray(payload?.data?.wallpapers)
          ? payload.data.wallpapers
          : [];

        if (cancelled) return;
        setWallpaperOptions(wallpapers);
        setWallpaperLoadStatus("ready");
        setSelectedWallpaperFilename((prev) =>
          prev && wallpapers.some((item) => item.filename === prev)
            ? prev
            : null,
        );
      } catch {
        if (cancelled) return;
        setWallpaperOptions([]);
        setWallpaperLoadStatus("error");
      }
    };

    void loadWallpapers();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedClientPrefs) return;
    try {
      if (selectedWallpaperFilename)
        localStorage.setItem(WALLPAPER_FILENAME_KEY, selectedWallpaperFilename);
      else localStorage.removeItem(WALLPAPER_FILENAME_KEY);
    } catch {
      // ignore storage errors
    }
  }, [hasLoadedClientPrefs, selectedWallpaperFilename]);

  useEffect(() => {
    if (!hasLoadedClientPrefs) return;
    try {
      localStorage.setItem(WALLPAPER_OPACITY_KEY, String(backgroundOpacity));
    } catch {
      // ignore storage errors
    }
  }, [backgroundOpacity, hasLoadedClientPrefs]);

  useEffect(() => {
    document.body.style.overflow = isAccountOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAccountOpen, guestMode]);

  useEffect(() => {
    if (!visualAnchor) return;
    if (visualAnchor.kind === "text" && mode !== "NORMAL")
      setVisualAnchor(null);
    if (visualAnchor.kind === "block" && mode !== "BLOCK")
      setVisualAnchor(null);
  }, [mode, visualAnchor]);

  useEffect(() => {
    if (mode === "INSERT" && inputRef.current) {
      const selection =
        insertSelection &&
        insertSelection.cursorIdx === cursorIdx &&
        insertSelection.derivIdx === derivIdx
          ? insertSelection
          : {
              start: normalCursor,
              end: normalCursor,
              direction: "none" as const,
            };
      inputRef.current.focus();
      inputRef.current.setSelectionRange(
        selection.start,
        selection.end,
        selection.direction,
      );
    }
  }, [mode, normalCursor, cursorIdx, derivIdx, insertSelection]);

  useEffect(() => {
    return () => {
      if (yankFlashTimerRef.current !== null) {
        window.clearTimeout(yankFlashTimerRef.current);
      }
    };
  }, []);

  const triggerYankFlash = (start: number, end: number) => {
    setYankFlash({ cursorIdx, derivIdx, start, end });
    if (yankFlashTimerRef.current !== null) {
      window.clearTimeout(yankFlashTimerRef.current);
    }
    yankFlashTimerRef.current = window.setTimeout(() => {
      setYankFlash(null);
      yankFlashTimerRef.current = null;
    }, 180);
  };

  const renderTextWithCursor = (
    text: string,
    isFocused: boolean,
    block: { cursorIdx: number; derivIdx: number },
  ) => {
    const hasInteractionAccent =
      !!activeInteractionDecor &&
      cursorIdx === block.cursorIdx &&
      derivIdx === block.derivIdx;
    const cursorAccentClass = hasInteractionAccent
      ? activeInteractionDecor.cursor
      : "";
    const sQuery = isSearching ? searchQuery : lastSearchQuery;
    const hasSearch = !!sQuery;
    const isVisualText =
      !!visualAnchor &&
      visualAnchor.kind === "text" &&
      visualAnchor.cursorIdx === block.cursorIdx &&
      visualAnchor.derivIdx === block.derivIdx &&
      typeof visualAnchor.charIndex === "number" &&
      mode === "NORMAL";
    const visualStart = isVisualText
      ? Math.min(visualAnchor!.charIndex!, normalCursor)
      : -1;
    const visualEnd = isVisualText
      ? Math.max(visualAnchor!.charIndex!, normalCursor)
      : -1;
    const isYankFlash =
      !!yankFlash &&
      yankFlash.cursorIdx === block.cursorIdx &&
      yankFlash.derivIdx === block.derivIdx;
    const yankFlashStart = isYankFlash ? yankFlash!.start : -1;
    const yankFlashEnd = isYankFlash ? yankFlash!.end : -1;
    const activeInsertSelection =
      mode === "INSERT" &&
      insertSelection &&
      insertSelection.cursorIdx === block.cursorIdx &&
      insertSelection.derivIdx === block.derivIdx
        ? insertSelection
        : null;
    const hasInsertSelection =
      !!activeInsertSelection &&
      activeInsertSelection.start !== activeInsertSelection.end;
    const insertSelectionStart = hasInsertSelection
      ? activeInsertSelection!.start
      : -1;
    const insertSelectionEnd = hasInsertSelection
      ? activeInsertSelection!.end
      : -1;

    const matchClass = isFocused
      ? "bg-[#ff9e64] text-[#1a1b26]"
      : "bg-[#e0af68] text-[#1a1b26]";

    if (mode === "INSERT") {
      if ((hasSearch && sQuery) || hasInsertSelection) {
        const ranges: { start: number; end: number }[] = [];
        if (hasSearch && sQuery) {
          const regex = new RegExp(
            sQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "gi",
          );
          let match;
          while ((match = regex.exec(text)) !== null) {
            ranges.push({
              start: match.index,
              end: match.index + match[0].length,
            });
          }
        }

        const chars = text.split("");
        return (
          <span>
            {chars.map((char, i) => {
              const isMatch = ranges.some((r) => i >= r.start && i < r.end);
              const isSelected =
                hasInsertSelection &&
                i >= insertSelectionStart &&
                i < insertSelectionEnd;
              const className = isSelected
                ? "bg-[#ff9e64] text-[#1a1b26] rounded-sm"
                : isMatch
                  ? matchClass
                  : "";

              if (char === "\n" && isSelected) {
                return (
                  <span key={i}>
                    <span className="bg-[#ff9e64] text-[#1a1b26] rounded-sm">
                      &nbsp;
                    </span>
                    {char}
                  </span>
                );
              }

              return (
                <span
                  key={i}
                  className={`${className} ${!text && i === 0 ? "opacity-30 italic" : ""}`.trim()}
                >
                  {char}
                </span>
              );
            })}
            {!text && <span className="opacity-30 italic">Empty...</span>}
            {text.endsWith("\n") && (
              <span className="block">
                {hasInsertSelection &&
                insertSelectionStart < text.length &&
                insertSelectionEnd === text.length ? (
                  <span className="bg-[#ff9e64] text-[#1a1b26] rounded-sm">
                    &nbsp;
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
              </span>
            )}
          </span>
        );
      }
      return (
        <span className={!text ? "opacity-30 italic" : ""}>
          {text || "Empty..."}
          {text.endsWith("\n") && <span className="block">&nbsp;</span>}
        </span>
      );
    }

    if (mode === "NORMAL" && isFocused) {
      if (!text)
        return (
          <span className={`char-cursor ${cursorAccentClass}`.trim()}>
            &nbsp;
          </span>
        );

      const shouldFastRender =
        text.length > NORMAL_FAST_RENDER_LIMIT &&
        !hasSearch &&
        !isVisualText &&
        !isYankFlash;

      if (shouldFastRender) {
        const cursor = Math.max(0, Math.min(normalCursor, text.length));
        const before = text.slice(0, cursor);
        const cursorChar = cursor < text.length ? text[cursor] : "";
        const after = cursor < text.length ? text.slice(cursor + 1) : "";

        return (
          <span>
            {before}
            {cursor === text.length ? (
              <span className={`char-cursor ${cursorAccentClass}`.trim()}>
                &nbsp;
              </span>
            ) : cursorChar === "\n" ? (
              <span>
                <span className={`char-cursor ${cursorAccentClass}`.trim()}>
                  &nbsp;
                </span>
                {cursorChar}
              </span>
            ) : (
              <span className={`char-cursor ${cursorAccentClass}`.trim()}>
                {cursorChar === " " ? "\u00A0" : cursorChar}
              </span>
            )}
            {after}
            {text.endsWith("\n") && (
              <span className="block">
                {cursor === text.length ? (
                  <span className={`char-cursor ${cursorAccentClass}`.trim()}>
                    &nbsp;
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
              </span>
            )}
          </span>
        );
      }

      const ranges: { start: number; end: number }[] = [];
      if (hasSearch) {
        const regex = new RegExp(
          sQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );
        let match;
        while ((match = regex.exec(text)) !== null) {
          ranges.push({
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      }

      const chars = text.split("");
      return (
        <span>
          {chars.map((char, i) => {
            const isMatch = ranges.some((r) => i >= r.start && i < r.end);
            const isSelected =
              isVisualText && i >= visualStart && i <= visualEnd;
            const isFlash =
              isYankFlash && i >= yankFlashStart && i <= yankFlashEnd;
            let className = "";
            if (isMatch) className += matchClass + " ";
            if (isSelected) className += "bg-[#bb9af7] text-[#1a1b26] ";
            if (isFlash) className += "bg-[#7aa2f7] text-[#1a1b26] ";
            if (i === normalCursor)
              className += `char-cursor ${cursorAccentClass} `;

            if (char === "\n" && i === normalCursor) {
              return (
                <span key={i}>
                  <span className={`char-cursor ${cursorAccentClass}`.trim()}>
                    &nbsp;
                  </span>
                  {char}
                </span>
              );
            }

            return (
              <span key={i} className={className}>
                {char}
              </span>
            );
          })}
          {normalCursor === text.length && !text.endsWith("\n") && (
            <span className={`char-cursor ${cursorAccentClass}`.trim()}>
              &nbsp;
            </span>
          )}
          {text.endsWith("\n") && (
            <span className="block">
              {normalCursor === text.length ? (
                <span className={`char-cursor ${cursorAccentClass}`.trim()}>
                  &nbsp;
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </span>
          )}
        </span>
      );
    }

    if (hasSearch && sQuery) {
      const regex = new RegExp(
        `(${sQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
        "gi",
      );
      const parts = text.split(regex);
      return (
        <span>
          {parts.map((part, i) =>
            part.toLowerCase() === sQuery.toLowerCase() ? (
              <span key={i} className={matchClass}>
                {part}
              </span>
            ) : (
              <span
                key={i}
                className={!text && i === 0 ? "opacity-30 italic" : ""}
              >
                {part || (text ? "" : "Empty...")}
              </span>
            ),
          )}
          {text.endsWith("\n") && <span className="block">&nbsp;</span>}
        </span>
      );
    }

    if (mode === "NORMAL" && isFocused && !text) {
      return (
        <span className={`char-cursor ${cursorAccentClass}`.trim()}>
          &nbsp;
        </span>
      );
    }
    return (
      <span className={!text ? "opacity-30 italic" : ""}>
        {text || "Empty..."}
        {text.endsWith("\n") && <span className="block">&nbsp;</span>}
      </span>
    );
  };

  const getStatusColor = () => {
    if (visualAnchor) return "bg-[#bb9af7]";
    if (mode === "BLOCK") return "bg-[#7aa2f7]";
    if (mode === "NORMAL") return "bg-[#9ece6a]";
    return "bg-[#ff9e64]";
  };

  const getModeLabel = () => {
    if (visualAnchor) return "VISUAL";
    if (mode === "BLOCK")
      return derivIdx === -1 ? "BLOCK - CONCEPT" : "BLOCK - DERIVATIVE";
    return mode;
  };

  const isBlockSelected = (cIdx: number, dIdx: number) => {
    if (!visualAnchor) return false;
    if (visualAnchor.kind !== "block") return false;
    const items = buildFlatBlocks();
    const anchorIndex = items.findIndex(
      (item) =>
        item.cursorIdx === visualAnchor.cursorIdx &&
        item.derivIdx === visualAnchor.derivIdx,
    );
    const currentIndex = items.findIndex(
      (item) => item.cursorIdx === cursorIdx && item.derivIdx === derivIdx,
    );
    const targetIndex = items.findIndex(
      (item) => item.cursorIdx === cIdx && item.derivIdx === dIdx,
    );
    if (anchorIndex === -1 || currentIndex === -1 || targetIndex === -1)
      return false;
    const [start, end] =
      anchorIndex <= currentIndex
        ? [anchorIndex, currentIndex]
        : [currentIndex, anchorIndex];
    return targetIndex >= start && targetIndex <= end;
  };

  const renderLiveKeyIndicator = () => {
    if (!liveKeyIndicator && activeModifierLabels.length === 0) return null;
    const toneClasses = getToneClasses(liveKeyIndicator?.tone);

    return (
      <div
        className={`mb-3 flex flex-col gap-2 rounded-lg border bg-[#111723]/70 p-3 ${toneClasses.border}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#7aa2f7]">
            Live Keys
          </span>
          {activeModifierLabels.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
              {activeModifierLabels.map((label) => (
                <span
                  key={label}
                  className="rounded border border-[#3b4261] bg-[#161c29] px-1.5 py-0.5 text-[9px] font-bold text-[#c0caf5]"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
        {liveKeyIndicator && (
          <>
            <div className="flex items-start gap-3">
              <span
                className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-black tracking-[0.18em] uppercase shadow-[0_0_16px_rgba(10,12,20,0.55)] ${toneClasses.badge}`}
              >
                {liveKeyIndicator.label}
              </span>
              <div className="space-y-1">
                <div
                  className={`text-[11px] font-semibold ${toneClasses.title}`}
                >
                  {liveKeyIndicator.title}
                </div>
                <div className="text-[10px] leading-relaxed text-[#a9b1d6]">
                  {liveKeyIndicator.description}
                </div>
              </div>
            </div>
            {liveKeyIndicator.hints && liveKeyIndicator.hints.length > 0 && (
              <div className="mt-1 flex flex-col gap-2">
                {liveKeyIndicator.hints.map((hint) => (
                  <LegendItem
                    key={`${liveKeyIndicator.label}-${hint.keys}`}
                    keys={hint.keys}
                    description={hint.description}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderOptions = () => {
    if (visualAnchor) {
      return (
        <div className="flex flex-col gap-2">
          <LegendItem keys="v" description="Exit Visual selection" />
          <LegendItem keys="y" description="Yank the selection" />
          <LegendItem keys="d" description="Delete the selection" />
          <LegendItem keys="c" description="Change the selection" />
          <LegendItem keys="Esc" description="Cancel selection" />
        </div>
      );
    }

    if (keyBuffer === " ") {
      return (
        <div className="flex flex-col gap-2">
          <LegendItem keys="Space + a" description="Open Folders" />
          <LegendItem keys="Space + c" description="Copy topic as Markdown" />
          <LegendItem keys="Esc" description="Cancel leader chord" />
        </div>
      );
    }

    if (selectionPending)
      return (
        <div className="flex items-center gap-2">
          <span className="text-[#ff9e64] text-[10px] font-bold">
            SELECT {selectionPending.type}
          </span>
          {selectionPending.candidates.map((_, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 border border-[#ff9e64] text-[#ff9e64] rounded text-[10px]"
            >
              {i + 1}
            </span>
          ))}
          <span className="text-[10px] opacity-50">ESC Cancel</span>
        </div>
      );

    if (mode === "INSERT")
      return (
        <div className="flex flex-col gap-2">
          <LegendItem
            keys="Esc"
            description="Return to Normal mode and save changes"
          />
          <LegendItem
            keys="Alt+Esc / Alt+[ / Ctrl+["
            description="Return directly to Block mode"
          />
          <LegendItem
            keys="Ctrl + +/-"
            description="Adjust the editor font size"
          />
        </div>
      );

    if (mode === "NORMAL") {
      if (keyBuffer === "y") {
        return (
          <div className="flex flex-col gap-2">
            <LegendItem keys="y w" description="Yank to next word" />
            <LegendItem keys="y e" description="Yank to end of word" />
            <LegendItem keys="y b" description="Yank to previous word" />
            <LegendItem keys="y y" description="Yank the current line" />
            <LegendItem keys="Esc" description="Cancel yank chord" />
          </div>
        );
      }
      if (keyBuffer === "d") {
        return (
          <div className="flex flex-col gap-2">
            <LegendItem keys="d w" description="Delete to next word" />
            <LegendItem keys="d e" description="Delete to end of word" />
            <LegendItem keys="d b" description="Delete to previous word" />
            <LegendItem keys="d d" description="Delete the current line" />
            <LegendItem keys="Esc" description="Cancel delete chord" />
          </div>
        );
      }
      if (keyBuffer === "c") {
        return (
          <div className="flex flex-col gap-2">
            <LegendItem keys="c w" description="Change to next word" />
            <LegendItem keys="c e" description="Change to end of word" />
            <LegendItem keys="c b" description="Change to previous word" />
            <LegendItem keys="c c" description="Change the current line" />
            <LegendItem keys="Esc" description="Cancel change chord" />
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-2">
          <LegendItem keys="Esc" description="Return to Block mode" />
          <LegendItem keys="i" description="Insert before cursor" />
          <LegendItem keys="a" description="Insert after cursor" />
          <LegendItem
            keys="Alt+i / Alt+a / Alt+Shift+a"
            description="Jump to insert at cursor / after cursor / end"
          />
          <LegendItem keys="o / O" description="Open new line below / above" />
          <LegendItem
            keys="h / j / k / l"
            description="Move cursor left / down / up / right"
          />
          <LegendItem
            keys="w / b / e"
            description="Jump to next / previous / end of word"
          />
          <LegendItem keys="v" description="Toggle Visual selection" />
          <LegendItem
            keys="y"
            description="Yank (copy) the current block/selection"
          />
          <LegendItem keys="p" description="Paste the yanked content below" />
          <LegendItem keys="d" description="Delete: dw / de / db / dd" />
          <LegendItem keys="c" description="Change: cw / ce / cb / cc" />
          <LegendItem keys="Space" description="More actions..." />
          <LegendItem
            keys="/"
            description="Search within concepts and derivatives"
          />
          <LegendItem keys="n / N" description="Next / previous search match" />
          <LegendItem keys="u" description="Undo last change" />
          <LegendItem keys="r" description="Redo last undo" />
          <LegendItem
            keys="Ctrl + +/-"
            description="Adjust the editor font size"
          />
        </div>
      );
    }

    if (mode === "BLOCK") {
      if (keyBuffer === "o")
        return (
          <div className="flex flex-col gap-2">
            <LegendItem keys="o p" description="Add a new probing question" />
            <LegendItem keys="o c" description="Add a new cloze deletion" />
            <LegendItem keys="o e" description="Add an elaboration" />
            <LegendItem keys="Esc" description="Cancel add chord" />
          </div>
        );
      if (keyBuffer === "d")
        return (
          <div className="flex flex-col gap-2">
            <LegendItem keys="d d" description="Delete the focused item" />
            <LegendItem keys="d p" description="Delete a probing question" />
            <LegendItem keys="d c" description="Delete a cloze deletion" />
            <LegendItem keys="d e" description="Delete an elaboration" />
            <LegendItem keys="Esc" description="Cancel delete chord" />
          </div>
        );
      if (keyBuffer === "c")
        return (
          <div className="flex flex-col gap-2">
            <LegendItem keys="c c" description="Change the focused item" />
            <LegendItem keys="c p" description="Change a probing question" />
            <LegendItem keys="c l" description="Change a cloze deletion" />
            <LegendItem keys="c e" description="Change an elaboration" />
            <LegendItem keys="Esc" description="Cancel change chord" />
          </div>
        );

      return (
        <div className="flex flex-col gap-2">
          <LegendItem
            keys="j / k"
            description="Move focus to next / previous item"
          />
          <LegendItem
            keys="h / l"
            description="Move between concept and derivatives"
          />
          <LegendItem
            keys="i / a"
            description="Enter Normal mode at start / end"
          />
          <LegendItem
            keys="Alt+i / Alt+a / Alt+Shift+a"
            description="Enter Insert at start / after first char / end"
          />
          <LegendItem
            keys="o / O"
            description="Add a new concept below / above"
          />
          <LegendItem keys="v" description="Toggle Visual selection" />
          <LegendItem
            keys="y"
            description="Yank (copy) the current block/selection"
          />
          <LegendItem keys="p" description="Paste the yanked content below" />
          <LegendItem keys="d" description="Begin delete chord" />
          <LegendItem keys="c" description="Begin change chord" />
          <LegendItem keys="Space" description="More actions..." />
          <LegendItem keys="/" description="Search across the topic" />
          <LegendItem
            keys="Ctrl + +/-"
            description="Adjust the editor font size"
          />
        </div>
      );
    }
    return null;
  };

  const isFocusMode = mode === "NORMAL" || mode === "INSERT";
  const handleTopicMetaInputBlur = (id: string) => {
    commitNodeDraft(id);
    window.setTimeout(() => {
      const activeTestId =
        document.activeElement instanceof HTMLInputElement
          ? document.activeElement.dataset.testid || ""
          : "";
      const expectedPrefix = "topic-name-input-";
      if (activeTestId === `${expectedPrefix}${id}`) return;
      setTopicMenuEditingTarget((prev) => (prev?.id === id ? null : prev));
    }, 0);
  };
  const visibleMoveFolders = [
    fileSystem.nodesById[fileSystem.rootId] as FolderNode,
    ...(topicMoveTargetId
      ? moveableFolders.filter(
          (folder) =>
            !getSubtreeNodeIds(
              topicMoveTargetId,
              fileSystem.nodesById,
            ).includes(folder.id),
        )
      : moveableFolders),
  ];

  return (
    <div className="relative isolate flex flex-col h-screen overflow-hidden bg-[#0d111b] font-sans">
      {activeWallpaper && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
            style={{
              backgroundImage: `url("${activeWallpaper.src}")`,
              opacity: backgroundOpacity / 100,
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(10,12,20,0.08),rgba(10,12,20,0.42)_52%,rgba(10,12,20,0.72)_100%)]" />
        </div>
      )}
      <div className="p-4 flex justify-between items-center z-20 h-16 absolute top-0 left-0 right-0">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Engram"
            className="w-24 h-6 object-contain"
            width={96}
            height={24}
            priority
          />
          <h1
            className="text-sm font-bold text-[#c0caf5] drop-shadow-[0_0_12px_rgba(26,27,38,0.9)]"
            data-testid="topic-title"
          >
            {topic.path !== "/" ? `${topic.path}/${topic.title}` : topic.title}
          </h1>
          {persistStatus.state !== "saved" && (
            <div className="flex items-center gap-2 text-[9px] font-semibold text-[#94a0c6]">
              <span
                className="rounded-full px-2 py-0.5 border border-[#2a2f45] bg-[#16161e]"
                data-testid="persistence-status"
                title={persistMessage}
              >
                DB: {persistStatus.state.toUpperCase()}
              </span>
              {persistMessage && (
                <span className="opacity-70" data-testid="persistence-message">
                  {persistMessage}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 justify-end min-w-[120px]">
          <div className="flex gap-2 items-center">
            <button
              className="h-8 w-8 rounded-full border border-[#2a2f45] bg-[#1f2335] text-[10px] font-bold text-[#c0caf5] shadow-md hover:border-[#7aa2f7]/60 hover:bg-[#24283b] transition"
              onClick={openSettingsModal}
              aria-label={
                guestMode ? "Open workspace settings" : "Open account settings"
              }
            >
              {!guestMode && user?.image ? (
                <Image
                  src={user.image}
                  alt={userName}
                  className="h-full w-full rounded-full object-cover"
                  width={32}
                  height={32}
                  unoptimized
                />
              ) : (
                <span>{initials}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {showKeyBuffer && (
        <div className="fixed right-6 top-24 z-20 max-w-[280px]">
          <div className="rounded-xl border border-[#2b324a] bg-[#151a26]/90 px-3 py-2 shadow-[0_0_18px_rgba(10,12,20,0.85)] backdrop-blur">
            {renderLiveKeyIndicator()}
            {renderOptions()}
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="relative flex-1 overflow-y-auto p-8 pt-24"
        data-testid="scroll-container"
      >
        <div
          className="mx-auto w-full pb-20 space-y-6"
          style={{ maxWidth: `${editorBlockWidth}px` }}
          data-testid="editor-blocks-container"
        >
          {topic.concepts.map((concept, cIdx) => {
            const isConceptActive = cursorIdx === cIdx && derivIdx === -1;
            const isConceptContextActive = cursorIdx === cIdx;
            const hasSelectedDerivativeInConcept = concept.derivatives.some(
              (_, dIdx) => isBlockSelected(cIdx, dIdx),
            );
            const shouldDimConceptGroup =
              mode === "BLOCK" &&
              visualAnchor?.kind === "block" &&
              !isBlockSelected(cIdx, -1) &&
              !hasSelectedDerivativeInConcept;
            const conceptOpacity =
              (isFocusMode && !isConceptActive) || shouldDimConceptGroup
                ? "opacity-20 grayscale transition-all duration-300"
                : "opacity-100 transition-all duration-300";
            const isConceptSelected = isBlockSelected(cIdx, -1);
            const conceptContextAccent =
              isConceptContextActive && activeInteractionDecor
                ? activeInteractionDecor.context
                : "";
            const conceptFocusAccent =
              isConceptActive && activeInteractionDecor
                ? activeInteractionDecor.focus
                : "";
            const conceptTextAccent =
              isConceptActive && activeInteractionDecor
                ? activeInteractionDecor.text
                : "";
            const shouldRenderConceptMarkdown =
              mode === "BLOCK" && !!concept.text;
            const shouldClampConcept = mode === "BLOCK" && cursorIdx !== cIdx;

            return (
              <div
                key={concept.id}
                ref={cursorIdx === cIdx && derivIdx === -1 ? activeRef : null}
                data-testid={`concept-block-${cIdx}`}
                className={`p-4 rounded transition-all duration-100 relative
											 border bg-[#24283b]
											 ${
                         cursorIdx === cIdx &&
                         derivIdx === -1 &&
                         mode === "BLOCK"
                           ? "border-[#7aa2f7] ring-1 ring-[#7aa2f7] shadow-[0_0_20px_rgba(122,162,247,0.1)]"
                           : "border-[#7aa2f7]/20"
                       }
										 ${isConceptSelected ? "ring-2 ring-[#bb9af7] bg-[#2a1f3d]/40 border-[#bb9af7]/40" : ""}
                     ${conceptContextAccent}
                     ${conceptFocusAccent}
										 `}
              >
                {isConceptActive &&
                  activeInteractionDecor &&
                  activeInteractionLabel && (
                    <div className="pointer-events-none absolute right-3 top-3 z-10">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] shadow-[0_0_12px_rgba(10,12,20,0.5)] ${activeInteractionDecor.chip}`}
                      >
                        {activeInteractionLabel}
                      </span>
                    </div>
                  )}
                <div className={`flex gap-4 ${conceptOpacity}`}>
                  <span
                    className={`mono mt-1.5 text-xs opacity-50 text-[#565f89] ${isConceptContextActive && activeInteractionDecor ? activeInteractionDecor.index : ""}`}
                  >
                    {String(cIdx + 1).padStart(2, "0")}
                  </span>
                  <div
                    className="flex-1 text-lg leading-relaxed relative font-mono"
                    style={conceptTypographyStyle}
                  >
                    {mode === "INSERT" &&
                      cursorIdx === cIdx &&
                      derivIdx === -1 && (
                        <textarea
                          ref={inputRef}
                          value={concept.text}
                          onChange={(e) => {
                            updateText(e.target.value);
                            syncInsertSelectionFromTextarea(
                              e.currentTarget,
                              cIdx,
                              -1,
                            );
                          }}
                          onSelect={(e) =>
                            syncInsertSelectionFromTextarea(
                              e.currentTarget,
                              cIdx,
                              -1,
                            )
                          }
                          className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#ff9e64] outline-none resize-none overflow-hidden z-10 font-mono text-lg leading-relaxed"
                          style={conceptTypographyStyle}
                          spellCheck={false}
                        />
                      )}
                    <div
                      className={`break-words min-h-[1.5em] cursor-text text-[#c0caf5] ${shouldRenderConceptMarkdown ? "engram-markdown whitespace-normal" : "whitespace-pre-wrap"} ${conceptTextAccent}`}
                      style={{
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        ...conceptTypographyStyle,
                        ...clampStyle(shouldClampConcept),
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) =>
                        handleTextClick(event, {
                          cursorIdx: cIdx,
                          derivIdx: -1,
                          text: concept.text,
                        })
                      }
                      data-testid={`concept-text-${cIdx}`}
                      data-cursor-index={
                        mode === "NORMAL" &&
                        cursorIdx === cIdx &&
                        derivIdx === -1
                          ? normalCursor
                          : undefined
                      }
                    >
                      {shouldRenderConceptMarkdown ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {concept.text}
                        </ReactMarkdown>
                      ) : (
                        renderTextWithCursor(
                          concept.text,
                          cursorIdx === cIdx && derivIdx === -1,
                          { cursorIdx: cIdx, derivIdx: -1 },
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div className="ml-10 mt-4 pl-4 border-l border-[#565f89]/30 space-y-3">
                  {concept.derivatives.map((deriv, dIdx) => {
                    const isCandidate =
                      selectionPending &&
                      selectionPending.candidates.some(
                        (c) => c.id === deriv.id,
                      ) &&
                      selectionPending.candidates[0].type === deriv.type &&
                      cursorIdx === cIdx;
                    const candidateIndex = isCandidate
                      ? selectionPending.candidates.findIndex(
                          (c) => c.id === deriv.id,
                        ) + 1
                      : null;
                    const isProbing = deriv.type === "PROBING";
                    const isElaboration = deriv.type === "ELABORATION";
                    const isDerivActive =
                      cursorIdx === cIdx && derivIdx === dIdx;
                    const derivOpacity =
                      (isFocusMode && !isDerivActive) || shouldDimConceptGroup
                        ? "opacity-20 grayscale transition-all duration-300"
                        : "opacity-100 transition-all duration-300";
                    const isDerivSelected = isBlockSelected(cIdx, dIdx);
                    const derivativeFocusAccent =
                      isDerivActive && activeInteractionDecor
                        ? activeInteractionDecor.focus
                        : "";
                    const derivativeTextAccent =
                      isDerivActive && activeInteractionDecor
                        ? activeInteractionDecor.text
                        : "";
                    const shouldRenderDerivMarkdown =
                      mode === "BLOCK" && !!deriv.text;
                    const shouldClampDeriv =
                      mode === "BLOCK" && cursorIdx !== cIdx;

                    const borderColor = isProbing
                      ? "border-[#ff9e64]/30"
                      : isElaboration
                        ? "border-[#7dcfff]/30"
                        : "border-[#bb9af7]/30";
                    const bgColor = isProbing
                      ? "bg-[#ff9e64]/10"
                      : isElaboration
                        ? "bg-[#7dcfff]/10"
                        : "bg-[#bb9af7]/10";
                    const focusRing = isProbing
                      ? "ring-[#ff9e64]"
                      : isElaboration
                        ? "ring-[#7dcfff]"
                        : "ring-[#bb9af7]";
                    const badgeBg = isProbing
                      ? "bg-[#ff9e64]/20"
                      : isElaboration
                        ? "bg-[#7dcfff]/20"
                        : "bg-[#bb9af7]/20";
                    const badgeText = isProbing
                      ? "text-[#ff9e64]"
                      : isElaboration
                        ? "text-[#7dcfff]"
                        : "text-[#bb9af7]";

                    return (
                      <div
                        key={deriv.id}
                        ref={
                          cursorIdx === cIdx && derivIdx === dIdx
                            ? activeRef
                            : null
                        }
                        data-derivative-type={deriv.type}
                        className={`p-3 rounded relative transition-all duration-100 border ${borderColor} ${bgColor} ${derivOpacity}
																${cursorIdx === cIdx && derivIdx === dIdx && mode === "BLOCK" ? `ring-1 ${focusRing} shadow-[0_0_15px_rgba(0,0,0,0.3)]` : ""}
														${isDerivSelected ? "ring-2 ring-[#bb9af7] border-[#bb9af7]/50 bg-[#2a1f3d]/35" : ""}
                            ${derivativeFocusAccent}
														`}
                      >
                        {isDerivActive &&
                          activeInteractionDecor &&
                          activeInteractionLabel && (
                            <div className="pointer-events-none absolute right-3 top-3 z-10">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] shadow-[0_0_12px_rgba(10,12,20,0.5)] ${activeInteractionDecor.chip}`}
                              >
                                {activeInteractionLabel}
                              </span>
                            </div>
                          )}
                        <div className="flex items-start gap-3">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider mt-0.5 ${badgeBg} ${badgeText}`}
                          >
                            {isProbing ? "?" : isElaboration ? "E" : "C"}
                          </span>
                          {isCandidate && (
                            <span className="bg-[#f7768e] text-[#1a1b26] text-[10px] font-bold px-1.5 rounded animate-bounce">
                              [{candidateIndex}]
                            </span>
                          )}
                          <div
                            className="flex-1 text-sm opacity-90 relative font-mono"
                            style={derivativeTypographyStyle}
                          >
                            {mode === "INSERT" &&
                              cursorIdx === cIdx &&
                              derivIdx === dIdx && (
                                <textarea
                                  ref={inputRef}
                                  value={deriv.text}
                                  onChange={(e) => {
                                    updateText(e.target.value);
                                    syncInsertSelectionFromTextarea(
                                      e.currentTarget,
                                      cIdx,
                                      dIdx,
                                    );
                                  }}
                                  onSelect={(e) =>
                                    syncInsertSelectionFromTextarea(
                                      e.currentTarget,
                                      cIdx,
                                      dIdx,
                                    )
                                  }
                                  className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-[#ff9e64] outline-none resize-none overflow-hidden z-10 font-mono text-sm"
                                  style={derivativeTypographyStyle}
                                  spellCheck={false}
                                />
                              )}
                            <div
                              className={`break-words min-h-[1.5em] cursor-text text-[#a9b1d6] ${shouldRenderDerivMarkdown ? "engram-markdown whitespace-normal" : "whitespace-pre-wrap"} ${derivativeTextAccent}`}
                              style={{
                                overflowWrap: "anywhere",
                                wordBreak: "break-word",
                                ...derivativeTypographyStyle,
                                ...clampStyle(shouldClampDeriv),
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) =>
                                handleTextClick(event, {
                                  cursorIdx: cIdx,
                                  derivIdx: dIdx,
                                  text: deriv.text,
                                })
                              }
                              data-testid={`derivative-text-${cIdx}-${dIdx}`}
                            >
                              {shouldRenderDerivMarkdown ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {deriv.text}
                                </ReactMarkdown>
                              ) : (
                                renderTextWithCursor(
                                  deriv.text,
                                  cursorIdx === cIdx && derivIdx === dIdx,
                                  { cursorIdx: cIdx, derivIdx: dIdx },
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {concept.derivatives.length === 0 && (
                    <div
                      ref={
                        cursorIdx === cIdx && derivIdx === 0 ? activeRef : null
                      }
                      className={`p-3 rounded border border-dashed border-[#565f89]/30 text-xs font-mono text-[#565f89] flex items-center gap-2 transition-all
													 ${cursorIdx === cIdx && derivIdx === 0 ? "ring-1 ring-[#565f89] bg-[#565f89]/10 text-[#c0caf5]" : ""}`}
                    >
                      <span>No derivatives.</span>
                      {cursorIdx === cIdx && derivIdx === 0 && (
                        <span className="text-[#ff9e64] font-bold">
                          Press &apos;o&apos; to add.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isSearching && (
        <div className="absolute bottom-10 left-0 right-0 p-4 bg-[#16161e] border-t border-b border-[#7aa2f7] z-50 flex items-center gap-2 shadow-2xl">
          <span className="text-[#9ece6a] font-bold">/</span>
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent outline-none text-[#c0caf5] w-full mono"
            placeholder="Search..."
          />
        </div>
      )}

      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#2a2f45] bg-[#1f2335]/95 px-4 py-2 text-[11px] font-semibold text-[#c0caf5] shadow-[0_0_18px_rgba(10,12,20,0.85)]"
          data-testid="toast"
        >
          {toastMessage}
        </div>
      )}

      <div data-testid="markdown-copy" style={{ display: "none" }}>
        {lastCopiedMarkdown}
      </div>

      <div
        className={`relative p-1 flex justify-between items-center text-[10px] font-bold uppercase text-[#1a1b26] transition-colors duration-200 ${getStatusColor()}`}
      >
        <div className="flex gap-4 px-2">
          <span>{getModeLabel()}</span>
          <span className="opacity-70">
            {cursorIdx + 1}:{derivIdx + 1}
          </span>
        </div>
        <div className="flex gap-4 px-2">
          <span className="opacity-50 tracking-widest">ENGRAM V2.3</span>
        </div>
      </div>

      {isAccountOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e17]/80"
          data-testid="settings-modal"
        >
          <div className="w-[min(920px,92vw)] max-h-[85vh] overflow-hidden rounded-2xl border border-[#22283a] bg-[#141821] shadow-[0_30px_80px_rgba(6,8,14,0.65)]">
            <div className="flex items-center justify-between border-b border-[#1f2536] bg-[#171c28] px-5 py-4">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.svg"
                  alt="Engram"
                  className="w-20 h-5 object-contain"
                  width={80}
                  height={20}
                />
                <div>
                  <div className="text-sm font-bold tracking-[0.2em] text-[#cbd3f2]">
                    SETTINGS
                  </div>
                  <div className="text-sm text-[#94a0c6]">
                    {guestMode
                      ? "Manage display settings and local workspace preferences"
                      : "Manage account details and workspace preferences"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-sm font-bold px-2 py-1 rounded border border-[#5b79d6]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
                  onClick={() => setIsAccountOpen(false)}
                >
                  CLOSE
                </button>
                {!guestMode && (
                  <button
                    className="text-sm font-bold px-2 py-1 rounded border border-[#f27a93]/40 text-[#ff9aaa] hover:bg-[#f27a93]/15 transition"
                    onClick={async () => {
                      try {
                        await auth.signOut({ fetchOptions: { throw: true } });
                      } finally {
                        setIsAuthSynced(false);
                        setAuthSyncError(null);
                        setSessionData(null);
                        setIsAccountOpen(false);
                        window.location.href = "/login";
                      }
                    }}
                  >
                    SIGN OUT
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[calc(85vh-64px)] overflow-y-auto p-5">
              <div className="space-y-5">
                {!guestMode && (
                  <div
                    className="flex flex-wrap gap-2 rounded-xl border border-[#22283a] bg-[#111622]/80 p-2"
                    role="tablist"
                    aria-label="Settings sections"
                    data-testid="settings-tablist"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={settingsTab === "account"}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                        settingsTab === "account"
                          ? "border-[#5b79d6]/60 bg-[#1a2235] text-[#e3e8ff]"
                          : "border-[#252c40] text-[#aab4d7] hover:bg-[#1d2334]"
                      }`}
                      onClick={() => setSettingsTab("account")}
                      data-testid="settings-tab-account"
                    >
                      Account
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={settingsTab === "display"}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                        settingsTab === "display"
                          ? "border-[#5b79d6]/60 bg-[#1a2235] text-[#e3e8ff]"
                          : "border-[#252c40] text-[#aab4d7] hover:bg-[#1d2334]"
                      }`}
                      onClick={() => setSettingsTab("display")}
                      data-testid="settings-tab-display"
                    >
                      Display
                    </button>
                  </div>
                )}

                {guestMode && (
                  <div className="rounded-xl border border-[#2c3b1f] bg-[linear-gradient(135deg,rgba(158,206,106,0.16),rgba(20,24,33,0.96))] p-4">
                    <div className="text-sm font-bold tracking-[0.18em] text-[#d8f6b3]">
                      GUEST SESSION
                    </div>
                    <div className="mt-1 text-sm text-[#b7c7a4]">
                      Display settings are available here. Guest notes and
                      preferences stay in this browser using local storage.
                    </div>
                  </div>
                )}

                {!guestMode && settingsTab === "account" ? (
                  accountInitialData ? (
                    <Account
                      initialSection="settings"
                      initialData={accountInitialData}
                      variant="embedded"
                      onOpenWorkspaceSettings={() => setSettingsTab("display")}
                    />
                  ) : (
                    <div className="rounded-xl border border-[#22283a] bg-[#161b27] p-5 text-sm text-[#94a0c6]">
                      Loading account settings...
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-[#22283a] bg-[#161b27] p-4">
                    <div className="text-sm font-bold tracking-[0.2em] text-[#cbd3f2]">
                      DISPLAY
                    </div>
                    <div className="mt-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-bold text-[#cbd3f2]">
                            Keybuffer legend
                          </div>
                          <div className="text-sm text-[#94a0c6]">
                            Show the chord helper on the right
                          </div>
                        </div>
                        <button
                          className={`text-sm font-bold px-2 py-1 rounded border transition ${showKeyBuffer ? "border-[#5b79d6]/50 text-[#9bb2ff] hover:bg-[#5b79d6]/15" : "border-[#262c3f] text-[#94a0c6] hover:bg-[#1f2536]"}`}
                          onClick={() => setShowKeyBuffer((prev) => !prev)}
                        >
                          {showKeyBuffer ? "ON" : "OFF"}
                        </button>
                      </div>

                      <div className="rounded-xl border border-[#22283a] bg-[#101521]/80 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-[#cbd3f2]">
                              Editor layout
                            </div>
                            <div className="text-sm text-[#94a0c6]">
                              Font size and block width update the workspace immediately and stay in this browser.
                            </div>
                          </div>
                          <div className="text-sm text-[#7f8bb4]">
                            {editorFontPercent}% · {editorBlockWidth}px
                          </div>
                        </div>

                        <div className="mt-4 space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-bold text-[#cbd3f2]">
                                Editor font size
                              </span>
                              <span className="text-[#9bb2ff]">
                                {editorFontPercent}%
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                className="h-9 w-9 rounded-lg border border-[#2a3350] text-lg font-bold text-[#9bb2ff] transition hover:bg-[#2a3350]/30"
                                onClick={() =>
                                  adjustEditorFontScale(
                                    -EDITOR_FONT_SCALE_STEP,
                                  )
                                }
                                aria-label="Decrease editor font size"
                              >
                                -
                              </button>
                              <input
                                type="range"
                                min={MIN_EDITOR_FONT_SCALE * 100}
                                max={MAX_EDITOR_FONT_SCALE * 100}
                                step={EDITOR_FONT_SCALE_STEP * 100}
                                value={editorFontPercent}
                                onChange={(e) =>
                                  updateEditorFontScale(
                                    Number(e.target.value) / 100,
                                  )
                                }
                                className="w-full accent-[#7aa2f7]"
                                data-testid="editor-font-size-slider"
                              />
                              <button
                                type="button"
                                className="h-9 w-9 rounded-lg border border-[#2a3350] text-lg font-bold text-[#9bb2ff] transition hover:bg-[#2a3350]/30"
                                onClick={() =>
                                  adjustEditorFontScale(
                                    EDITOR_FONT_SCALE_STEP,
                                  )
                                }
                                aria-label="Increase editor font size"
                              >
                                +
                              </button>
                            </div>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                min={MIN_EDITOR_FONT_SCALE * 100}
                                max={MAX_EDITOR_FONT_SCALE * 100}
                                step={EDITOR_FONT_SCALE_STEP * 100}
                                value={editorFontPercentDraft}
                                onChange={(e) =>
                                  setEditorFontPercentDraft(e.target.value)
                                }
                                onBlur={commitEditorFontScaleDraft}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="w-28 rounded-lg border border-[#283049] bg-[#0d1320] px-3 py-2 text-sm text-[#cbd3f2] outline-none transition focus:border-[#5b79d6]/70"
                                inputMode="numeric"
                                data-testid="editor-font-size-input"
                              />
                              <span className="text-sm text-[#94a0c6]">
                                % in 5% increments
                              </span>
                            </div>
                            <div className="text-sm text-[#94a0c6]">
                              Shortcut: Ctrl/Cmd + plus or minus. Range: 50% to
                              300%.
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-bold text-[#cbd3f2]">
                                Block width
                              </span>
                              <span className="text-[#9bb2ff]">
                                {editorBlockWidth}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min={MIN_EDITOR_BLOCK_WIDTH}
                              max={MAX_EDITOR_BLOCK_WIDTH}
                              step={EDITOR_BLOCK_WIDTH_STEP}
                              value={editorBlockWidth}
                              onChange={(e) =>
                                updateEditorBlockWidth(e.target.value)
                              }
                              className="w-full accent-[#7aa2f7]"
                              data-testid="editor-block-width-slider"
                            />
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                min={MIN_EDITOR_BLOCK_WIDTH}
                                max={MAX_EDITOR_BLOCK_WIDTH}
                                step={1}
                                value={editorBlockWidthDraft}
                                onChange={(e) =>
                                  setEditorBlockWidthDraft(e.target.value)
                                }
                                onBlur={commitEditorBlockWidthDraft}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="w-32 rounded-lg border border-[#283049] bg-[#0d1320] px-3 py-2 text-sm text-[#cbd3f2] outline-none transition focus:border-[#5b79d6]/70"
                                inputMode="numeric"
                                data-testid="editor-block-width-input"
                              />
                              <span className="text-sm text-[#94a0c6]">
                                px, up to 3840
                              </span>
                            </div>
                            <div className="text-sm text-[#94a0c6]">
                              Wider layouts leave more room for long concepts and nested derivatives.
                            </div>
                          </div>

                          <div className="rounded-xl border border-[#22283a] bg-[#0d1320] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-[#cbd3f2]">
                                Live preview
                              </div>
                              <div className="text-sm text-[#7f8bb4]">
                                Scroll horizontally for wider layouts.
                              </div>
                            </div>
                            <div
                              className="mt-3 overflow-x-auto pb-2"
                              data-testid="editor-layout-preview-scroll"
                            >
                              <div
                                className="space-y-3"
                                style={{ width: `${editorBlockWidth}px` }}
                                data-testid="editor-layout-preview"
                              >
                                <div className="rounded-xl border border-[#7aa2f7]/25 bg-[#24283b] p-4 shadow-[0_0_20px_rgba(122,162,247,0.08)]">
                                  <div className="flex gap-4">
                                    <span className="mono mt-1.5 text-xs text-[#565f89] opacity-50">
                                      01
                                    </span>
                                    <div
                                      className="flex-1 font-mono text-[#c0caf5]"
                                      style={conceptTypographyStyle}
                                    >
                                      Fourier transforms turn dense signals into readable frequency domains.
                                    </div>
                                  </div>
                                  <div className="ml-10 mt-4 space-y-3 border-l border-[#565f89]/30 pl-4">
                                    <div className="rounded-lg border border-[#ff9e64]/30 bg-[#ff9e64]/10 p-3">
                                      <div className="flex items-start gap-3">
                                        <span className="mt-0.5 rounded bg-[#ff9e64]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#ff9e64]">
                                          ?
                                        </span>
                                        <div
                                          className="flex-1 font-mono text-[#a9b1d6]"
                                          style={derivativeTypographyStyle}
                                        >
                                          What changes when the sample window narrows?
                                        </div>
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-[#7dcfff]/30 bg-[#7dcfff]/10 p-3">
                                      <div className="flex items-start gap-3">
                                        <span className="mt-0.5 rounded bg-[#7dcfff]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#7dcfff]">
                                          E
                                        </span>
                                        <div
                                          className="flex-1 font-mono text-[#a9b1d6]"
                                          style={derivativeTypographyStyle}
                                        >
                                          Narrow windows improve time localization, but they smear nearby frequencies together.
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#22283a] bg-[#101521]/80 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-[#cbd3f2]">
                              Workspace wallpaper
                            </div>
                            <div className="text-sm text-[#94a0c6]">
                              Choose a JPG or PNG from `/public`. Labels come
                              directly from each filename.
                            </div>
                          </div>
                          <div className="text-sm text-[#7f8bb4]">
                            {wallpaperLoadStatus === "loading" && "Loading…"}
                            {wallpaperLoadStatus === "ready" &&
                              `${wallpaperOptions.length} available`}
                            {wallpaperLoadStatus === "error" && "Unavailable"}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <button
                            type="button"
                            className={`rounded-xl border text-left transition ${selectedWallpaperFilename === null ? "border-[#7aa2f7]/70 bg-[#1a2338]" : "border-[#22283a] bg-[#121826] hover:border-[#465176]"}`}
                            onClick={() => setSelectedWallpaperFilename(null)}
                            aria-pressed={selectedWallpaperFilename === null}
                          >
                            <div className="flex h-28 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(122,162,247,0.18),rgba(16,21,33,0.96)_70%)]">
                              <div className="rounded-full border border-[#2a3350] px-3 py-1 text-sm font-bold tracking-[0.2em] text-[#9bb2ff]">
                                DEFAULT
                              </div>
                            </div>
                          </button>

                          {wallpaperOptions.map((option) => {
                            const isSelected =
                              option.filename === selectedWallpaperFilename;
                            return (
                              <button
                                key={option.filename}
                                type="button"
                                className={`group overflow-hidden rounded-xl border text-left transition ${isSelected ? "border-[#7aa2f7]/70 bg-[#1a2338]" : "border-[#22283a] bg-[#121826] hover:border-[#465176]"}`}
                                onClick={() =>
                                  setSelectedWallpaperFilename(option.filename)
                                }
                                aria-pressed={isSelected}
                                data-testid={`wallpaper-option-${option.filename}`}
                              >
                                <div className="relative h-28 overflow-hidden bg-[#0d111b]">
                                  <div
                                    className="absolute inset-[-10%] bg-cover bg-center transition duration-300 group-hover:scale-105"
                                    style={{
                                      backgroundImage: `url("${option.src}")`,
                                    }}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e17] via-[#0b0e17]/20 to-transparent" />
                                  <div className="absolute bottom-2 left-3 right-3 text-sm font-bold text-[#f3f6ff] drop-shadow-[0_0_10px_rgba(0,0,0,0.85)]">
                                    {option.name}
                                  </div>
                                  {isSelected && (
                                    <div className="absolute right-2 top-2 rounded-full border border-[#7aa2f7]/60 bg-[#141b29]/85 px-2 py-0.5 text-xs font-bold text-[#9bb2ff]">
                                      Selected
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {wallpaperLoadStatus === "error" && (
                          <div className="mt-3 text-sm text-[#ff9aaa]">
                            Couldn&apos;t load wallpapers from `/public`.
                          </div>
                        )}
                        {wallpaperLoadStatus === "ready" &&
                          wallpaperOptions.length === 0 && (
                            <div className="mt-3 text-sm text-[#94a0c6]">
                              No JPG or PNG wallpapers were found in `/public`.
                            </div>
                          )}

                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-bold text-[#cbd3f2]">
                              Background opacity
                            </span>
                            <span className="text-[#9bb2ff]">
                              {backgroundOpacity}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={backgroundOpacity}
                            onChange={(e) =>
                              setBackgroundOpacity(
                                normalizeWallpaperOpacity(e.target.value),
                              )
                            }
                            disabled={!selectedWallpaperFilename}
                            className="w-full accent-[#7aa2f7] disabled:cursor-not-allowed disabled:opacity-40"
                          />
                          <div className="text-sm text-[#94a0c6]">
                            {selectedWallpaperFilename
                              ? "Lower values keep the wallpaper subtle behind the workspace."
                              : "Select a wallpaper to preview and adjust its opacity."}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isDocumentSwitcherOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e17]/80"
          data-testid="topic-switcher"
        >
          <div className="w-[min(760px,94vw)] rounded-2xl border border-[#22283a] bg-[#141821] shadow-[0_30px_80px_rgba(6,8,14,0.65)]">
            <div className="flex items-center justify-between border-b border-[#1f2536] bg-[#171c28] px-5 py-4">
              <div>
                <div className="text-sm font-bold tracking-[0.2em] text-[#cbd3f2]">
                  FILESYSTEM
                </div>
                <div className="text-sm text-[#94a0c6]">
                  Explorer-style folders and files
                </div>
              </div>
              <button
                className="text-sm font-bold px-2 py-1 rounded border border-[#5b79d6]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
                data-testid="topic-close"
                onClick={() => {
                  topicMenuDeletePendingRef.current = false;
                  setTopicMenuDeletePending(false);
                  setIsDocumentSwitcherOpen(false);
                  setTopicMenuEditingTarget(null);
                }}
              >
                CLOSE
              </button>
            </div>
            <section className="relative p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-[#cbd3f2]">
                    Current note
                  </div>
                  <div className="mt-1 text-sm text-[#7aa2f7]">
                    {topic.path}
                  </div>
                  <div className="text-base text-[#94a0c6]">{topic.title}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm font-bold px-2 py-1 rounded border border-[#7aa2f7]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
                    data-testid="topic-create"
                    onClick={createTopic}
                  >
                    NEW NOTE
                  </button>
                  <button
                    className="text-sm font-bold px-2 py-1 rounded border border-[#2a3350] text-[#9bb2ff] hover:bg-[#2a3350]/30 transition"
                    onClick={createFolder}
                  >
                    NEW FOLDER
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-[#22283a] bg-[#161b27] px-3 py-2 text-sm text-[#94a0c6]">
                {topicMoveTargetId ? (
                  <span>
                    <span className="font-bold text-[#cbd3f2]">Move:</span> j/k
                    choose folder, Enter confirm, Esc cancel
                  </span>
                ) : topicMenuEditingTarget ? (
                  <span>
                    <span className="font-bold text-[#cbd3f2]">Editing:</span>{" "}
                    Esc cancel, Enter save
                  </span>
                ) : topicMenuDeletePending ? (
                  <span>
                    <span className="font-bold text-[#ff9e64]">
                      Delete armed:
                    </span>{" "}
                    press{" "}
                    <span className="rounded border border-[#ff9e64]/50 bg-[#2a1d18] px-1.5 py-0.5 font-bold text-[#ffb08a]">
                      d
                    </span>{" "}
                    again to delete, or any other key to cancel
                  </span>
                ) : (
                  <span>
                    <span className="font-bold text-[#cbd3f2]">Keys:</span> j/k
                    move, h collapse, l/Enter expand or open, o new file, O new
                    folder, c rename, f move, dd delete, u undo
                  </span>
                )}
              </div>
              <div className="space-y-2" data-testid="topic-list">
                {visibleExplorerNodes.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[#2a3350] bg-[#101521] px-4 py-5 text-sm text-[#7f8bb4]">
                    No files yet.
                  </div>
                )}
                {visibleExplorerNodes.map(({ node: item, depth }, index) => {
                  const isEditingName = item.id === topicMenuEditingTarget?.id;
                  const isSelected =
                    visibleExplorerNodes[topicMenuIndex]?.node.id === item.id;
                  const isFolder = item.type === "folder";
                  const isExpanded = isFolder
                    ? (expandedFolderIds[item.id] ?? false)
                    : false;
                  const isCurrentFolder = currentFolderId === item.id;
                  return (
                    <div
                      key={item.id}
                      data-testid={`topic-item-${item.id}`}
                      data-selected={isSelected}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${item.id === activeTopicId || isCurrentFolder ? "border-[#7aa2f7]/60 bg-[#1b2131]" : "border-[#22283a] bg-[#161b27]"} ${isSelected ? "ring-1 ring-[#ff9e64] shadow-[0_0_10px_rgba(255,158,100,0.3)]" : ""}`}
                      onClick={() => {
                        setTopicMenuIndex(index);
                        topicMenuIndexRef.current = index;
                        setSelectedNodeId(item.id);
                        setCurrentFolderId(
                          isFolder
                            ? item.id
                            : (item.parentId ?? fileSystem.rootId),
                        );
                      }}
                    >
                      <button
                        type="button"
                        className="shrink-0 text-xs font-bold text-[#7aa2f7]"
                        style={{ marginLeft: `${depth * 18}px` }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isFolder) return;
                          setExpandedFolderIds((prev) => ({
                            ...prev,
                            [item.id]: !isExpanded,
                          }));
                          setCurrentFolderId(item.id);
                          setSelectedNodeId(item.id);
                        }}
                      >
                        {isFolder ? (isExpanded ? "▾" : "▸") : "·"}
                      </button>
                      <ExplorerNodeIcon type={item.type} />
                      <div className="min-w-0 flex-1">
                        {isEditingName ? (
                          <input
                            className="w-full bg-transparent text-base text-[#c0caf5] outline-none"
                            value={nodeDrafts[item.id] ?? item.name}
                            data-testid={`topic-name-input-${item.id}`}
                            autoFocus
                            onChange={(e) =>
                              syncNodeDraft(item.id, e.target.value)
                            }
                            onFocus={() => {
                              setTopicMenuEditingTarget({
                                id: item.id,
                                field: "name",
                              });
                              setTopicMenuIndex(index);
                              topicMenuIndexRef.current = index;
                              setSelectedNodeId(item.id);
                            }}
                            onBlur={() => handleTopicMetaInputBlur(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                syncNodeDraft(item.id, item.name);
                                setTopicMenuEditingTarget(null);
                                (e.currentTarget as HTMLInputElement).blur();
                                return;
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (!isFolder) openTopic(item.id);
                                else {
                                  commitNodeDraft(item.id);
                                  setTopicMenuEditingTarget(null);
                                }
                              }
                            }}
                            placeholder={
                              isFolder ? "Untitled Folder" : "Untitled Topic"
                            }
                          />
                        ) : (
                          <div
                            className="truncate text-base text-[#c0caf5]"
                            onDoubleClick={() => {
                              setTopicMenuEditingTarget({
                                id: item.id,
                                field: "name",
                              });
                              setTopicMenuIndex(index);
                              topicMenuIndexRef.current = index;
                              setSelectedNodeId(item.id);
                            }}
                          >
                            {nodeDrafts[item.id] ?? item.name}
                          </div>
                        )}
                        {!isFolder && (
                          <div className="truncate text-sm text-[#7f8bb4]">
                            {getTopicPreview(item.topic)}
                          </div>
                        )}
                      </div>
                      <button
                        className="text-sm font-bold px-2 py-1 rounded border border-[#2a3350] text-[#9bb2ff] hover:bg-[#2a3350]/30 transition"
                        onClick={() => {
                          if (isFolder) {
                            setCurrentFolderId(item.id);
                            setExpandedFolderIds((prev) => ({
                              ...prev,
                              [item.id]: !isExpanded,
                            }));
                            setSelectedNodeId(item.id);
                          } else {
                            openTopic(item.id);
                          }
                        }}
                        data-testid={`topic-open-${item.id}`}
                      >
                        {isFolder
                          ? isExpanded
                            ? "COLLAPSE"
                            : "EXPAND"
                          : "OPEN"}
                      </button>
                      <button
                        className="text-sm font-bold px-2 py-1 rounded border border-[#5b79d6]/40 text-[#9bb2ff] hover:bg-[#5b79d6]/15 transition"
                        onClick={() => {
                          setTopicMoveTargetId(item.id);
                          setTopicMoveFolderIndex(0);
                        }}
                      >
                        MOVE
                      </button>
                      <button
                        className="text-sm font-bold px-2 py-1 rounded border border-[#f27a93]/40 text-[#ff9aaa] hover:bg-[#f27a93]/15 transition"
                        data-testid={`topic-delete-${item.id}`}
                        onClick={() => deleteTopic(item.id)}
                      >
                        DELETE
                      </button>
                    </div>
                  );
                })}
              </div>
              {topicMoveTargetId && (
                <div className="absolute inset-5 z-10 rounded-2xl border border-[#2a3350] bg-[#0f1420]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.45)] backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold tracking-[0.14em] text-[#cbd3f2]">
                        MOVE ITEM
                      </div>
                      <div className="text-sm text-[#94a0c6]">
                        Select a destination folder.
                      </div>
                    </div>
                    <button
                      className="rounded border border-[#2a3350] px-2 py-1 text-sm font-bold text-[#9bb2ff] hover:bg-[#2a3350]/30"
                      onClick={() => setTopicMoveTargetId(null)}
                    >
                      CANCEL
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {visibleMoveFolders.map((folder, index) => (
                      <button
                        key={folder.id}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${topicMoveFolderIndex === index ? "border-[#7aa2f7]/60 bg-[#1b2131] text-[#cbd3f2]" : "border-[#22283a] bg-[#141821] text-[#94a0c6]"}`}
                        onClick={() => setTopicMoveFolderIndex(index)}
                        onDoubleClick={() =>
                          moveNodeToFolder(topicMoveTargetId, folder.id)
                        }
                      >
                        <span>{folder.isRoot ? "Root" : folder.name}</span>
                        <span className="text-xs text-[#6f7ca8]">
                          {folder.isRoot
                            ? "/"
                            : getNodePath(folder.id, fileSystem.nodesById)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      className="rounded border border-[#7aa2f7]/40 px-3 py-1.5 text-sm font-bold text-[#9bb2ff] hover:bg-[#5b79d6]/15"
                      onClick={() => {
                        const destination =
                          visibleMoveFolders[topicMoveFolderIndex];
                        if (destination && topicMoveTargetId)
                          moveNodeToFolder(topicMoveTargetId, destination.id);
                      }}
                    >
                      MOVE HERE
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
