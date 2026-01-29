/**
 * Database client for MCP server using Neon serverless driver
 */

import { neon } from "@neondatabase/serverless";

export interface SearchResult {
	id: number;
	partNumber: number;
	sectionId: string | null;
	title: string | null;
	content: string;
	contentType: string;
	pageNumber: number | null;
	score: number;
}

export interface SpecContent {
	id: number;
	partNumber: number;
	sectionId: string | null;
	title: string | null;
	content: string;
	contentType: string;
}

export function createDb(connectionString: string) {
	const sql = neon(connectionString);

	return {
		// Semantic search using vector similarity
		async search(
			queryEmbedding: number[],
			options: { limit?: number; partNumber?: number; contentType?: string } = {},
		): Promise<SearchResult[]> {
			const { limit = 5, partNumber, contentType } = options;
			const embeddingStr = `[${queryEmbedding.join(",")}]`;

			// Build query with optional filters
			let results: Record<string, unknown>[];
			if (partNumber !== undefined && contentType) {
				results = await sql`
					SELECT id, part_number, section_id, title, content, content_type, page_number,
						1 - (embedding <=> ${embeddingStr}::vector) as score
					FROM spec_content
					WHERE embedding IS NOT NULL
						AND part_number = ${partNumber}
						AND content_type = ${contentType}
					ORDER BY embedding <=> ${embeddingStr}::vector
					LIMIT ${limit}
				`;
			} else if (partNumber !== undefined) {
				results = await sql`
					SELECT id, part_number, section_id, title, content, content_type, page_number,
						1 - (embedding <=> ${embeddingStr}::vector) as score
					FROM spec_content
					WHERE embedding IS NOT NULL
						AND part_number = ${partNumber}
					ORDER BY embedding <=> ${embeddingStr}::vector
					LIMIT ${limit}
				`;
			} else if (contentType) {
				results = await sql`
					SELECT id, part_number, section_id, title, content, content_type, page_number,
						1 - (embedding <=> ${embeddingStr}::vector) as score
					FROM spec_content
					WHERE embedding IS NOT NULL
						AND content_type = ${contentType}
					ORDER BY embedding <=> ${embeddingStr}::vector
					LIMIT ${limit}
				`;
			} else {
				results = await sql`
					SELECT id, part_number, section_id, title, content, content_type, page_number,
						1 - (embedding <=> ${embeddingStr}::vector) as score
					FROM spec_content
					WHERE embedding IS NOT NULL
					ORDER BY embedding <=> ${embeddingStr}::vector
					LIMIT ${limit}
				`;
			}

			return results.map((r) => ({
				id: r.id as number,
				partNumber: r.part_number as number,
				sectionId: r.section_id as string | null,
				title: r.title as string | null,
				content: r.content as string,
				contentType: r.content_type as string,
				pageNumber: r.page_number as number | null,
				score: r.score as number,
			}));
		},

		// Get content by section ID
		async getBySection(sectionId: string, partNumber?: number): Promise<SpecContent[]> {
			const pattern = `${sectionId}%`;
			let results: Record<string, unknown>[];

			if (partNumber !== undefined) {
				results = await sql`
					SELECT id, part_number, section_id, title, content, content_type
					FROM spec_content
					WHERE section_id LIKE ${pattern}
						AND part_number = ${partNumber}
					ORDER BY section_id, id
				`;
			} else {
				results = await sql`
					SELECT id, part_number, section_id, title, content, content_type
					FROM spec_content
					WHERE section_id LIKE ${pattern}
					ORDER BY section_id, id
				`;
			}

			return results.map((r) => ({
				id: r.id as number,
				partNumber: r.part_number as number,
				sectionId: r.section_id as string | null,
				title: r.title as string | null,
				content: r.content as string,
				contentType: r.content_type as string,
			}));
		},

		// Get sections list (for browsing)
		async listSections(
			partNumber?: number,
		): Promise<Array<{ sectionId: string; title: string; partNumber: number }>> {
			let results: Record<string, unknown>[];

			if (partNumber !== undefined) {
				results = await sql`
					SELECT DISTINCT section_id, title, part_number
					FROM spec_content
					WHERE section_id IS NOT NULL AND title IS NOT NULL
						AND part_number = ${partNumber}
					ORDER BY part_number, section_id
				`;
			} else {
				results = await sql`
					SELECT DISTINCT section_id, title, part_number
					FROM spec_content
					WHERE section_id IS NOT NULL AND title IS NOT NULL
					ORDER BY part_number, section_id
				`;
			}

			return results.map((r) => ({
				sectionId: r.section_id as string,
				title: r.title as string,
				partNumber: r.part_number as number,
			}));
		},

		// Get stats
		async getStats(): Promise<{ total: number; byPart: Record<number, number> }> {
			const results = await sql`
				SELECT part_number, COUNT(*) as count
				FROM spec_content
				GROUP BY part_number
				ORDER BY part_number
			`;

			const byPart: Record<number, number> = {};
			let total = 0;

			for (const r of results) {
				const part = r.part_number as number;
				const count = Number(r.count);
				byPart[part] = count;
				total += count;
			}

			return { total, byPart };
		},
	};
}
