#!/usr/bin/env node
/**
 * BugSmash MCP server — stdio transport.
 *
 * Exposes BugSmash reviewer feedback to LLMs without ever putting the API key
 * in tool inputs, responses, or logs. Credentials come only from BUGSMASH_API_KEY.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  assertApiKeyConfigured,
  BugSmashApiError,
  bugsmashRequest,
} from "./client.js";
import {
  shapeCommentDetails,
  shapeCommentsList,
  shapeProjectDetails,
  shapeProjectsList,
} from "./shape.js";

const PROJECT_TYPES = [
  "image",
  "video",
  "pdf",
  "audio",
  "website",
  "ppt",
  "email",
] as const;

const COMMENT_STATUSES = ["Active", "Resolved"] as const;
const COMMENT_PRIORITIES = ["Unset", "P1", "P2", "P3", "P4"] as const;

function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  let message: string;
  if (err instanceof BugSmashApiError) {
    message = err.message;
    if (err.body !== null && err.body !== undefined) {
      message += `\n${JSON.stringify(err.body, null, 2)}`;
    }
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = "Unknown error";
  }

  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

function createServer(): McpServer {
  const server = new McpServer({
    name: "bugsmash",
    version: "1.0.0",
  });

  server.registerTool(
    "list_projects",
    {
      title: "List BugSmash projects",
      description:
        "List review projects in the BugSmash workspace (paginated). Use this to discover project IDs before calling list_feedback. Maps to GET /projects.",
      inputSchema: {
        page: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Page number (default 1)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Results per page (max 50)"),
        folderId: z
          .string()
          .optional()
          .describe(
            "Filter by folder UUID. Pass the string \"null\" for root-level projects only.",
          ),
        types: z
          .array(z.enum(PROJECT_TYPES))
          .optional()
          .describe("Filter by one or more content types"),
      },
    },
    async (args) => {
      try {
        const query: Record<string, string | number | boolean | undefined> = {
          page: args.page,
          limit: args.limit,
          folderId: args.folderId,
        };

        // BugSmash accepts types[] for multi-value filters; append via URLSearchParams in client.
        // For multiple types we build the query string path with repeated keys.
        if (args.types && args.types.length > 0) {
          const params = new URLSearchParams();
          if (args.page !== undefined) params.set("page", String(args.page));
          if (args.limit !== undefined) params.set("limit", String(args.limit));
          if (args.folderId !== undefined) params.set("folderId", args.folderId);
          for (const t of args.types) {
            params.append("types[]", t);
          }
          const payload = await bugsmashRequest({
            path: `projects?${params.toString()}`,
          });
          return jsonResult(shapeProjectsList(payload));
        }

        const payload = await bugsmashRequest({
          path: "projects",
          query,
        });
        return jsonResult(shapeProjectsList(payload));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get BugSmash project",
      description:
        "Fetch details for a single BugSmash project, including versions and review links. Maps to GET /project/{projectId}.",
      inputSchema: {
        projectId: z.string().describe("Project UUID"),
      },
    },
    async (args) => {
      try {
        const payload = await bugsmashRequest({
          path: `project/${encodeURIComponent(args.projectId)}`,
        });
        return jsonResult(shapeProjectDetails(payload));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_feedback",
    {
      title: "List BugSmash feedback",
      description:
        "Retrieve all reviewer comments for a project. Maps to GET /comments?projectId. Prefer plainText=true for LLM consumption. Optionally include location metadata (pin/DOM/page).",
      inputSchema: {
        projectId: z.string().describe("Project UUID whose comments to list"),
        plainText: z
          .boolean()
          .optional()
          .describe(
            "Return comment bodies as plain text instead of HTML (default true for this tool)",
          ),
        locationMetadata: z
          .boolean()
          .optional()
          .describe(
            "Include pin coordinates, DOM path, page number, and related location fields",
          ),
        status: z
          .enum(COMMENT_STATUSES)
          .optional()
          .describe(
            "Client-side filter: only return comments with this status (Active or Resolved). The API returns all comments; filtering happens locally.",
          ),
      },
    },
    async (args) => {
      try {
        const payload = await bugsmashRequest({
          path: "comments",
          query: {
            projectId: args.projectId,
            plainText: args.plainText ?? true,
            locationMetadata: args.locationMetadata ?? false,
          },
        });
        const shaped = shapeCommentsList(payload);
        if (args.status) {
          return jsonResult({
            comments: shaped.comments.filter((c) => c.status === args.status),
          });
        }
        return jsonResult(shaped);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_feedback",
    {
      title: "Get BugSmash comment",
      description:
        "Fetch a single comment by UUID, including replies when present. Maps to GET /comment/{commentId}.",
      inputSchema: {
        commentId: z.string().describe("Comment UUID"),
        plainText: z
          .boolean()
          .optional()
          .describe("Return text as plain text instead of HTML (default true)"),
        locationMetadata: z
          .boolean()
          .optional()
          .describe("Include location metadata on the comment"),
      },
    },
    async (args) => {
      try {
        const payload = await bugsmashRequest({
          path: `comment/${encodeURIComponent(args.commentId)}`,
          query: {
            plainText: args.plainText ?? true,
            locationMetadata: args.locationMetadata ?? false,
          },
        });
        return jsonResult(shapeCommentDetails(payload));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "update_feedback",
    {
      title: "Update BugSmash comment",
      description:
        "Update a comment's text, status (e.g. mark Resolved), priority, or privacy. Maps to PATCH /comment/{commentId}. At least one field besides commentId is required.",
      inputSchema: {
        commentId: z.string().describe("Comment UUID to update"),
        text: z.string().optional().describe("Updated comment text"),
        status: z
          .enum(COMMENT_STATUSES)
          .optional()
          .describe('New status: "Active" or "Resolved"'),
        priority: z
          .enum(COMMENT_PRIORITIES)
          .optional()
          .describe('Priority: "Unset", "P1", "P2", "P3", or "P4"'),
        isPrivate: z
          .boolean()
          .optional()
          .describe("Make the comment private (true) or public to reviewers (false)"),
      },
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {};
        if (args.text !== undefined) body.text = args.text;
        if (args.status !== undefined) body.status = args.status;
        if (args.priority !== undefined) body.priority = args.priority;
        if (args.isPrivate !== undefined) body.isPrivate = args.isPrivate;

        if (Object.keys(body).length === 0) {
          return errorResult(
            new Error(
              "Provide at least one of: text, status, priority, isPrivate",
            ),
          );
        }

        const payload = await bugsmashRequest({
          method: "PATCH",
          path: `comment/${encodeURIComponent(args.commentId)}`,
          body,
        });
        return jsonResult(shapeCommentDetails(payload));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_replies",
    {
      title: "List comment replies",
      description:
        "List all replies on a comment thread. Maps to GET /comment/{commentId}/replies.",
      inputSchema: {
        commentId: z.string().describe("Parent comment UUID"),
        plainText: z
          .boolean()
          .optional()
          .describe("Return reply text as plain text (default true)"),
      },
    },
    async (args) => {
      try {
        // Docs use plain_text for this endpoint.
        const payload = await bugsmashRequest({
          path: `comment/${encodeURIComponent(args.commentId)}/replies`,
          query: {
            plain_text: args.plainText ?? true,
          },
        });
        return jsonResult(shapeCommentsList(payload));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "post_reply",
    {
      title: "Reply to a BugSmash comment",
      description:
        "Post a reply on an existing comment thread. Maps to POST /reply.",
      inputSchema: {
        commentId: z.string().describe("Parent comment UUID"),
        text: z.string().min(1).describe("Reply text"),
        isPrivate: z
          .boolean()
          .optional()
          .describe("Make the reply private to the workspace (default false)"),
      },
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          commentId: args.commentId,
          text: args.text,
        };
        if (args.isPrivate !== undefined) body.isPrivate = args.isPrivate;

        const payload = await bugsmashRequest({
          method: "POST",
          path: "reply",
          body,
        });
        return jsonResult(shapeCommentDetails(payload));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  try {
    assertApiKeyConfigured();
  } catch {
    // Fail fast with a generic message — never print the key value.
    console.error("BUGSMASH_API_KEY is not set");
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Failed to start server";
  console.error(message);
  process.exit(1);
});
