# Kinetica Vector Search & Embeddings Reference

Kinetica provides native vector distance functions and embedding generation.
No PostgreSQL equivalent — this is entirely Kinetica-specific.

## Vector Distance Functions

| Function | Description | Ordering |
|----------|-------------|----------|
| `L2_DISTANCE(vec_col, query_vec)` | Euclidean distance | ASC (lower = more similar) |
| `IP_DISTANCE(vec_col, query_vec)` | Inner product distance | DESC (higher = more similar, if normalized) |
| `COSINE_DISTANCE(vec_col, query_vec)` | Cosine distance (1 - similarity) | ASC (0 = identical, 2 = opposite) |

### Distance Operators (Syntactic Sugar)

| Operator | Equivalent |
|----------|-----------|
| `<->` | L2_DISTANCE |
| `<#>` | IP_DISTANCE |
| `<=>` | COSINE_DISTANCE |

### Vector Constructor

`VECTOR('array_string', dimensions)` — constructs a vector literal:
```sql
VECTOR('[1.0, 2.0, 3.0]', 3)
VECTOR('[0.1, -0.3, 0.5, ...]', 1536)
```

## Similarity Search Pattern

```sql
-- Find 10 most similar documents to a query vector
SELECT "id", "title",
    COSINE_DISTANCE("embedding", VECTOR('[0.1, 0.2, ...]', 1536)) AS "dist"
FROM "schema"."documents"
ORDER BY "dist" ASC
LIMIT 10

-- Using operator syntax
SELECT "id", "title",
    "embedding" <=> VECTOR('[0.1, 0.2, ...]', 1536) AS "dist"
FROM "schema"."documents"
ORDER BY "dist" ASC
LIMIT 10
```

## Generating Embeddings via SQL (GENERATE_EMBEDDINGS)

`GENERATE_EMBEDDINGS` is a table function (UDF) that generates vector embeddings
from text using a configured model. Uses `INPUT_TABLE` for data input.

### From a table:
```sql
SELECT *
FROM TABLE(
    GENERATE_EMBEDDINGS(
        MODEL_NAME=>'openai_remote_model',
        EMBEDDING_TABLE=>INPUT_TABLE("schema"."documents"),
        EMBEDDING_INPUT_COLUMNS=>'title,content',
        EMBEDDING_OUTPUT_COLUMNS=>'title_emb,content_emb',
        DIMENSIONS=>1536
    )
)
LIMIT 100
```

### From a subquery:
```sql
SELECT *
FROM TABLE(
    GENERATE_EMBEDDINGS(
        MODEL_NAME=>'nvidia_remote_model',
        EMBEDDING_TABLE=>INPUT_TABLE(SELECT * FROM "schema"."reviews" WHERE "score" > 3),
        EMBEDDING_INPUT_COLUMNS=>'text',
        PARAMS=>KV_PAIRS('input_type'='passage')
    )
)
LIMIT 100
```

### Semantic search with on-the-fly embedding:
```sql
SELECT /* KI_HINT_SAVE_UDF_STATS */
    COSINE_DISTANCE("p"."content_emb", "q"."query_emb") AS "dist",
    "p"."id", "p"."title", "p"."content"
FROM
    TABLE(
        GENERATE_EMBEDDINGS(
            MODEL_NAME=>'openai_remote_model',
            EMBEDDING_TABLE=>INPUT_TABLE("schema"."documents"),
            EMBEDDING_INPUT_COLUMNS=>'content',
            EMBEDDING_OUTPUT_COLUMNS=>'content_emb',
            DIMENSIONS=>1536
        )
    ) "p",
    TABLE(
        GENERATE_EMBEDDINGS(
            MODEL_NAME=>'openai_remote_model',
            EMBEDDING_TABLE=>INPUT_TABLE(SELECT 'healthy food recipes' AS "query"),
            EMBEDDING_INPUT_COLUMNS=>'query',
            EMBEDDING_OUTPUT_COLUMNS=>'query_emb',
            DIMENSIONS=>1536
        )
    ) "q"
ORDER BY "dist" ASC
LIMIT 10
```

## GENERATE_EMBEDDINGS Parameters

| Parameter | Description |
|-----------|-------------|
| `MODEL_NAME` | Name of the configured embedding model |
| `EMBEDDING_TABLE` | `INPUT_TABLE(table_ref)` or `INPUT_TABLE(subquery)` |
| `EMBEDDING_INPUT_COLUMNS` | Comma-separated column names to embed |
| `EMBEDDING_OUTPUT_COLUMNS` | Output column names for embeddings |
| `DIMENSIONS` | Vector dimensions (must match model) |
| `PARAMS` | Optional `KV_PAIRS(...)` for model-specific params |

## Vector Column Definition

```sql
CREATE TABLE "schema"."documents" (
    "id" INT NOT NULL,
    "content" VARCHAR,
    "embedding" VECTOR(1536),          -- fixed-dimension vector
    PRIMARY KEY ("id"),
    CAGRA INDEX ("embedding")          -- GPU-accelerated vector index
)

-- With auto-normalization
CREATE TABLE "schema"."normalized_docs" (
    "id" INT NOT NULL,
    "embedding" VECTOR(1536) NORMALIZE, -- L2-normalize on insert/update
    HNSW INDEX ("embedding")            -- alternative vector index
)
```

## Vector Index Types

| Index | Description | Best For |
|-------|-------------|----------|
| `CAGRA INDEX` | GPU-accelerated approximate search | Large-scale, high throughput |
| `HNSW INDEX` | Hierarchical navigable small world | General vector search |

## Distance Metric Selection

| Metric | Best For | Sort Order |
|--------|----------|------------|
| **Cosine** | Text embeddings (most common) | ASC (0=identical) |
| **L2** | Image/audio embeddings | ASC (0=identical) |
| **Inner Product** | Normalized embeddings, recommendation | DESC (higher=more similar) |

For normalized vectors, inner product and cosine similarity are proportional.
The `NORMALIZE` column property handles this at insert time.

## Combining Vector + SQL

```sql
-- Find similar documents, then aggregate by category
WITH "matches" AS (
    SELECT "id", "category",
        COSINE_DISTANCE("embedding", VECTOR('[...]', 1536)) AS "dist"
    FROM "schema"."documents"
    ORDER BY "dist" ASC
    LIMIT 100
)
SELECT "category", COUNT(*) AS "match_count", AVG("dist") AS "avg_dist"
FROM "matches"
GROUP BY "category"
ORDER BY "match_count" DESC
```
