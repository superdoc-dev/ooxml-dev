export type EmbeddingProvider = "openai" | "google" | "voyage" | "cohere";

export interface EmbeddingClient {
	embed(text: string): Promise<number[]>;
	embedBatch(texts: string[]): Promise<number[][]>;
	readonly dimensions: number;
	readonly model: string;
}

interface EmbeddingConfig {
	apiKey: string;
	model?: string;
}

// OpenAI embeddings
async function embedOpenAI(texts: string[], apiKey: string, model: string): Promise<number[][]> {
	const response = await fetch("https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			input: texts,
			model,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI embedding failed: ${error}`);
	}

	const data = (await response.json()) as {
		data: Array<{ embedding: number[]; index: number }>;
	};

	// Sort by index to maintain order
	return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Google embeddings
async function embedGoogle(texts: string[], apiKey: string, model: string): Promise<number[][]> {
	// Google requires individual requests for each text
	const embeddings = await Promise.all(
		texts.map(async (text) => {
			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: `models/${model}`,
						content: { parts: [{ text }] },
					}),
				},
			);

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Google embedding failed: ${error}`);
			}

			const data = (await response.json()) as {
				embedding: { values: number[] };
			};
			return data.embedding.values;
		}),
	);

	return embeddings;
}

// Voyage embeddings
async function embedVoyage(texts: string[], apiKey: string, model: string): Promise<number[][]> {
	const response = await fetch("https://api.voyageai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			input: texts,
			model,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Voyage embedding failed: ${error}`);
	}

	const data = (await response.json()) as {
		data: Array<{ embedding: number[]; index: number }>;
	};

	return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Cohere embeddings
async function embedCohere(texts: string[], apiKey: string, model: string): Promise<number[][]> {
	const response = await fetch("https://api.cohere.com/v2/embed", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			texts,
			model,
			input_type: "search_document",
			embedding_types: ["float"],
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Cohere embedding failed: ${error}`);
	}

	const data = (await response.json()) as {
		embeddings: { float: number[][] };
	};

	return data.embeddings.float;
}

// Model configurations
const MODEL_CONFIG: Record<EmbeddingProvider, { defaultModel: string; dimensions: number }> = {
	openai: { defaultModel: "text-embedding-3-small", dimensions: 1536 },
	google: { defaultModel: "text-embedding-004", dimensions: 768 },
	voyage: { defaultModel: "voyage-3", dimensions: 1024 },
	cohere: { defaultModel: "embed-english-v3.0", dimensions: 1024 },
};

export function createEmbeddingClient(
	provider: EmbeddingProvider,
	config: EmbeddingConfig,
): EmbeddingClient {
	const { apiKey, model } = config;
	const modelConfig = MODEL_CONFIG[provider];
	const modelName = model || modelConfig.defaultModel;

	const embedFn = async (texts: string[]): Promise<number[][]> => {
		switch (provider) {
			case "openai":
				return embedOpenAI(texts, apiKey, modelName);
			case "google":
				return embedGoogle(texts, apiKey, modelName);
			case "voyage":
				return embedVoyage(texts, apiKey, modelName);
			case "cohere":
				return embedCohere(texts, apiKey, modelName);
		}
	};

	return {
		async embed(text: string): Promise<number[]> {
			const [embedding] = await embedFn([text]);
			return embedding;
		},

		async embedBatch(texts: string[]): Promise<number[][]> {
			// Process in batches of 100 to avoid API limits
			const batchSize = 100;
			const results: number[][] = [];

			for (let i = 0; i < texts.length; i += batchSize) {
				const batch = texts.slice(i, i + batchSize);
				const embeddings = await embedFn(batch);
				results.push(...embeddings);
			}

			return results;
		},

		get dimensions() {
			return modelConfig.dimensions;
		},

		get model() {
			return modelName;
		},
	};
}
