# RAG Cost Analysis — StudAI Prism

**Finding: Prism has no RAG pipeline, no embeddings usage, and no vector database. Cost: $0.**

Evidence:

- Zero call sites for any embeddings API. The `text-embedding-3-large` deployment on the shared Azure OpenAI account (`studai-openai-286274596`) exists for other StudAI workloads — **no Prism code references it** (verified by workspace-wide search for embedding endpoints/SDK calls).
- No vector store (no Pinecone/Qdrant/Weaviate/pgvector/Azure AI Search dependencies in either `package.json`, no pgvector extension in the migrations 0001–0010).
- Scenario content is a **fixed, frozen bank** (≤8 scenarios per build rules) served from `server/data/content.json` and the DB — retrieval is a keyed lookup, not similarity search. This is deliberate: a psychometric instrument needs identical stimulus material per item, which is the opposite of dynamic retrieval.

Forward note: if a knowledge-grounded feature ever ships (e.g., role-specific scenario packs), the cost template is: embedding at $0.13/1M tokens (3-large) one-time per corpus + retrieval compute ≈ negligible + the retrieved-context tokens billed as normal chat input — the dominant cost is always the injected context tokens, not the embeddings. Re-cost in FEATURE_COST_ANALYSIS.md before building.
