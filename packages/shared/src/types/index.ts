// Shared types for ECMA spec data

export interface SpecChunk {
	id: number;
	partNumber: number;
	sectionId: string | null;
	sectionTitle: string | null;
	content: string;
	contentType: "text" | "xml_example" | "table";
	pageNumber: number | null;
	embedding?: number[];
}

export interface SpecSection {
	id: number;
	partNumber: number;
	sectionId: string;
	sectionTitle: string | null;
	parentSectionId: string | null;
	depth: number;
	pageStart: number | null;
	pageEnd: number | null;
}

export interface SearchResult {
	chunk: SpecChunk;
	score: number;
}
