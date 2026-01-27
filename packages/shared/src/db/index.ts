import postgres from "postgres";
import type { SearchResult, SpecContent } from "../types";

export type DbClient = ReturnType<typeof createDbClient>;

export function createDbClient(connectionString: string) {
	const sql = postgres(connectionString);

	return {
		sql,

		async close() {
			await sql.end();
		},

		// Insert content
		async insert(content: Omit<SpecContent, "id">) {
			const [result] = await sql<[{ id: number }]>`
				INSERT INTO spec_content (part_number, section_id, title, content, content_type, embedding)
				VALUES (
					${content.partNumber},
					${content.sectionId},
					${content.title},
					${content.content},
					${content.contentType},
					${content.embedding ? `[${content.embedding.join(",")}]` : null}
				)
				RETURNING id
			`;
			return result.id;
		},

		// Insert multiple (batch)
		async insertBatch(items: Omit<SpecContent, "id">[]) {
			const values = items.map((item) => ({
				part_number: item.partNumber,
				section_id: item.sectionId,
				title: item.title,
				content: item.content,
				content_type: item.contentType,
				embedding: item.embedding ? `[${item.embedding.join(",")}]` : null,
			}));

			const result = await sql`
				INSERT INTO spec_content ${sql(values)}
				RETURNING id
			`;
			return result.map((r) => r.id as number);
		},

		// Update embedding
		async updateEmbedding(id: number, embedding: number[]) {
			await sql`
				UPDATE spec_content
				SET embedding = ${`[${embedding.join(",")}]`}
				WHERE id = ${id}
			`;
		},

		// Semantic search
		async search(
			queryEmbedding: number[],
			options: { limit?: number; partNumber?: number; contentType?: string } = {},
		): Promise<SearchResult[]> {
			const { limit = 5, partNumber, contentType } = options;
			const embeddingStr = `[${queryEmbedding.join(",")}]`;

			const results = await sql<
				Array<{
					id: number;
					part_number: number;
					section_id: string | null;
					title: string | null;
					content: string;
					content_type: string;
					score: number;
				}>
			>`
				SELECT
					id, part_number, section_id, title, content, content_type,
					1 - (embedding <=> ${embeddingStr}::vector) as score
				FROM spec_content
				WHERE embedding IS NOT NULL
				${partNumber ? sql`AND part_number = ${partNumber}` : sql``}
				${contentType ? sql`AND content_type = ${contentType}` : sql``}
				ORDER BY embedding <=> ${embeddingStr}::vector
				LIMIT ${limit}
			`;

			return results.map((r) => ({
				id: r.id,
				partNumber: r.part_number,
				sectionId: r.section_id,
				title: r.title,
				content: r.content,
				contentType: r.content_type,
				score: r.score,
			}));
		},

		// Get by section
		async getBySection(partNumber: number, sectionId: string): Promise<SpecContent[]> {
			const results = await sql<
				Array<{
					id: number;
					part_number: number;
					section_id: string | null;
					title: string | null;
					content: string;
					content_type: string;
				}>
			>`
				SELECT id, part_number, section_id, title, content, content_type
				FROM spec_content
				WHERE part_number = ${partNumber} AND section_id = ${sectionId}
				ORDER BY id
			`;

			return results.map((r) => ({
				id: r.id,
				partNumber: r.part_number,
				sectionId: r.section_id,
				title: r.title,
				content: r.content,
				contentType: r.content_type,
			}));
		},

		// Get stats
		async getStats() {
			const [stats] = await sql<[{ total: number; embedded: number }]>`
				SELECT
					COUNT(*) as total,
					COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded
				FROM spec_content
			`;
			return {
				total: Number(stats.total),
				embedded: Number(stats.embedded),
			};
		},

		// Clear all
		async clearAll() {
			await sql`TRUNCATE spec_content RESTART IDENTITY`;
		},
	};
}
