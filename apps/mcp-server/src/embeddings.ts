/**
 * Embedding client for query embedding
 */

export async function embedQuery(text: string, apiKey: string): Promise<number[]> {
	const response = await fetch("https://api.voyageai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			input: [text],
			model: "voyage-3",
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Voyage embedding failed: ${error}`);
	}

	const data = (await response.json()) as {
		data: Array<{ embedding: number[]; index: number }>;
	};

	return data.data[0].embedding;
}
