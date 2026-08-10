/**
 * Shape raw BugSmash API payloads into LLM-friendly fields.
 * Drops envelope noise (HTTP status wrappers) and keeps review-relevant data.
 */

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 0) return false;
  if (value === 1) return true;
  return null;
}

function unwrapData(payload: unknown): unknown {
  const root = asRecord(payload);
  if (root && "data" in root) return root.data;
  return payload;
}

function shapeTag(tag: unknown): { id: string | null; name: string | null } | null {
  const t = asRecord(tag);
  if (!t) return null;
  return {
    id: str(t.id),
    name: str(t.name),
  };
}

function shapeLocation(meta: unknown): unknown {
  if (meta === null || meta === undefined) return null;
  return meta;
}

/** Map a comment / reply object to the fields useful to an LLM. */
export function shapeComment(raw: unknown): UnknownRecord {
  const c = asRecord(raw) ?? {};
  const tags = Array.isArray(c.tags)
    ? c.tags.map(shapeTag).filter((t): t is NonNullable<typeof t> => t !== null)
    : [];

  const shaped: UnknownRecord = {
    id: str(c.comment_id) ?? str(c.id),
    number: num(c.comment_number),
    text: str(c.comment),
    status: str(c.status),
    priority: str(c.priority),
    isPrivate: bool(c.is_private),
    author: {
      name: str(c.comment_by_name),
      email: str(c.comment_by_email),
    },
    assignee: {
      name: str(c.assigned_to_name),
      email: str(c.assigned_to_email),
    },
    createdAt: str(c.created_at),
    updatedAt: str(c.updated_at),
    projectType: str(c.project_type),
    screenshotUrl: str(c.comment_screenshot_file_url),
    attachmentUrl: str(c.attachment_file_url),
    audioUrl: str(c.audio_file_url),
    tags,
  };

  if ("location_metadata" in c || "comment_metadata" in c) {
    shaped.location = shapeLocation(c.location_metadata);
    shaped.browserContext = shapeLocation(c.comment_metadata);
  }

  if (Array.isArray(c.replies)) {
    shaped.replies = c.replies.map(shapeComment);
  }

  // Prefer page URL from location metadata as a link-back when present.
  const location = asRecord(c.location_metadata);
  if (location) {
    const pageUrl = str(location.page_url);
    if (pageUrl) shaped.pageUrl = pageUrl;
  }

  return shaped;
}

export function shapeCommentsList(payload: unknown): {
  comments: UnknownRecord[];
} {
  const data = unwrapData(payload);
  const list = Array.isArray(data) ? data : [];
  return { comments: list.map(shapeComment) };
}

export function shapeCommentDetails(payload: unknown): UnknownRecord {
  return shapeComment(unwrapData(payload));
}

export function shapeProject(raw: unknown): UnknownRecord {
  const p = asRecord(raw) ?? {};
  return {
    id: str(p.id),
    name: str(p.name),
    type: str(p.type),
    shareAccess: str(p.share_access),
    reviewUrl: str(p.short_url),
    bannerUrl: str(p.banner),
    createdAt: str(p.created_at),
    updatedAt: str(p.updated_at),
  };
}

export function shapeProjectsList(payload: unknown): {
  projects: UnknownRecord[];
  page: number | null;
  lastPage: number | null;
  perPage: number | null;
  total: number | null;
} {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? {};
  const list = Array.isArray(data.data)
    ? data.data
    : Array.isArray(root.data)
      ? (root.data as unknown[])
      : [];

  return {
    projects: list.map(shapeProject),
    page: num(data.current_page) ?? num(root.current_page),
    lastPage: num(root.last_page),
    perPage: num(root.per_page),
    total: num(root.total),
  };
}

export function shapeProjectDetails(payload: unknown): UnknownRecord {
  const data = asRecord(unwrapData(payload)) ?? {};
  const versions = Array.isArray(data.project_versions)
    ? data.project_versions.map((v) => {
        const ver = asRecord(v) ?? {};
        return {
          id: str(ver.id),
          name: str(ver.version_name),
          number: num(ver.version_no),
          status: str(ver.status),
          uploadStatus: str(ver.upload_status),
          isLatest: bool(ver.is_latest),
          reviewUrl: str(ver.short_url),
          updatedAt: str(ver.updated_at),
        };
      })
    : [];

  return {
    id: str(data.id),
    name: str(data.name),
    versions,
  };
}
