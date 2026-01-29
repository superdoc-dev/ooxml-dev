// Shared types for ECMA spec data

export interface SpecContent {
	id: number;
	partNumber: number;
	sectionId: string | null;
	title: string | null;
	content: string;
	contentType: string;
	pageNumber: number | null;
	embedding?: number[];
}

export interface SearchResult extends SpecContent {
	score: number;
}
