import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { EgovClient, type FetchLike } from "./egov/client";
import {
	COMPARE_REVISIONS_DESCRIPTION,
	compareRevisionsInputSchema,
	runCompareRevisions,
} from "./tools/compare_revisions";
import {
	GET_ARTICLE_DESCRIPTION,
	getArticleInputSchema,
	runGetArticle,
} from "./tools/get_article";
import {
	GET_LAW_METADATA_DESCRIPTION,
	getLawMetadataInputSchema,
	runGetLawMetadata,
} from "./tools/get_law_metadata";
import {
	LIST_CATEGORIES_DESCRIPTION,
	runListCategories,
} from "./tools/list_categories";
import {
	SEARCH_LAW_DESCRIPTION,
	runSearchLaw,
	searchLawInputSchema,
} from "./tools/search_law";
import { EgovApiError } from "./utils/errors";

export interface AgentEnv {
	EGOV_CACHE?: KVNamespace;
}

function asMcpError(err: unknown) {
	if (err instanceof EgovApiError) {
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(err.toPayload()),
				},
			],
			isError: true,
		};
	}
	const message = err instanceof Error ? err.message : "Unknown error";
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify({ code: 0, message, retryable: false }),
			},
		],
		isError: true,
	};
}

function jsonResult<T>(value: T) {
	const text = JSON.stringify(value, null, 2);
	return {
		content: [{ type: "text" as const, text }],
	};
}

export function buildClient(env: AgentEnv, fetchImpl?: FetchLike): EgovClient {
	return new EgovClient({
		cache: env.EGOV_CACHE,
		fetch: fetchImpl,
	});
}

export class EgovMcp extends McpAgent<Env> {
	server = new McpServer({
		name: "japan-legal-mcp",
		version: "1.0.0",
	});

	async init() {
		const env = this.env as AgentEnv;

		this.server.registerTool(
			"search_law",
			{
				description: SEARCH_LAW_DESCRIPTION,
				inputSchema: searchLawInputSchema,
			},
			async (input) => {
				try {
					const client = buildClient(env);
					const out = await runSearchLaw(client, input);
					return jsonResult(out);
				} catch (err) {
					return asMcpError(err);
				}
			},
		);

		this.server.registerTool(
			"get_article",
			{
				description: GET_ARTICLE_DESCRIPTION,
				inputSchema: getArticleInputSchema,
			},
			async (input) => {
				try {
					const client = buildClient(env);
					const out = await runGetArticle(client, input);
					return jsonResult(out);
				} catch (err) {
					return asMcpError(err);
				}
			},
		);

		this.server.registerTool(
			"list_categories",
			{
				description: LIST_CATEGORIES_DESCRIPTION,
				inputSchema: {},
			},
			async () => {
				try {
					const client = buildClient(env);
					const out = await runListCategories(client);
					return jsonResult(out);
				} catch (err) {
					return asMcpError(err);
				}
			},
		);

		this.server.registerTool(
			"get_law_metadata",
			{
				description: GET_LAW_METADATA_DESCRIPTION,
				inputSchema: getLawMetadataInputSchema,
			},
			async (input) => {
				try {
					const client = buildClient(env);
					const out = await runGetLawMetadata(client, input);
					return jsonResult(out);
				} catch (err) {
					return asMcpError(err);
				}
			},
		);

		this.server.registerTool(
			"compare_revisions",
			{
				description: COMPARE_REVISIONS_DESCRIPTION,
				inputSchema: compareRevisionsInputSchema,
			},
			async (input) => {
				try {
					const client = buildClient(env);
					const out = await runCompareRevisions(client, input);
					return jsonResult(out);
				} catch (err) {
					return asMcpError(err);
				}
			},
		);
	}
}
