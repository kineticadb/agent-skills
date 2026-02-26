# Vector Search & Embeddings Reference

## Vector Distance Functions

| Function | Description | Ordering |
|----------|-------------|----------|
| `L2_DISTANCE(vec_col, query_vec)` | Euclidean distance | ASC (lower = more similar) |
| `IP_DISTANCE(vec_col, query_vec)` | Inner product distance | DESC (higher = more similar, normalized) |
| `COSINE_DISTANCE(vec_col, query_vec)` | Cosine distance (1 - similarity) | ASC (0 = identical, 2 = opposite) |

### Distance Operators
| Operator | Equivalent |
|----------|-----------|
| `<->` | L2_DISTANCE |
| `<#>` | IP_DISTANCE |
| `<=>` | COSINE_DISTANCE |

### Vector Constructor
`VECTOR('array_string', dimensions)` — e.g., `VECTOR('[1.0, 2.0, 3.0]', 3)`

## Generating Embeddings via SQL

```sql
SELECT *
FROM TABLE(
    GENERATE_EMBEDDINGS(
        MODEL_NAME=>'openai_remote_model',
        EMBEDDING_TABLE=>INPUT_TABLE("schema"."table"),
        EMBEDDING_INPUT_COLUMNS=>'col1,col2',
        EMBEDDING_OUTPUT_COLUMNS=>'col1_emb,col2_emb',
        DIMENSIONS=>1536
    )
)
LIMIT 100
```

With subquery input:
```sql
SELECT *
FROM TABLE(
    GENERATE_EMBEDDINGS(
        MODEL_NAME=>'nvidia_remote_model',
        EMBEDDING_TABLE=>INPUT_TABLE(SELECT * FROM "schema"."table" WHERE "score" > 3),
        EMBEDDING_INPUT_COLUMNS=>'text_col',
        PARAMS=>KV_PAIRS('input_type'='passage')
    )
)
LIMIT 100
```

## Semantic Search via toolbelt_vectors

For most use cases, use `toolbelt_vectors(namespace_id, query)` instead of raw SQL.
It handles embedding generation and similarity search automatically.

**Good queries** (semantic, conceptual):
- "What is the company's refund policy?"
- "Explain the onboarding process for new employees"
- "How does the authentication system handle expired tokens?"

**Poor queries** (use SQL instead):
- "How many refunds were processed?" → use `toolbelt_sql`
- "List all employees hired in 2024" → use `toolbelt_sql`

## Combining Vector + SQL

For questions that need both context and data:
1. Use `toolbelt_vectors` to find relevant policy/documentation
2. Use `toolbelt_sql` to get actual metrics
3. Combine both in your response

Example: "Are we meeting our SLA targets?"
- Vector search: find SLA definition documents
- SQL: query actual uptime/response metrics
- Combine: compare actual metrics against SLA thresholds

## Result Interpretation
- **score > 0.8**: Highly relevant — directly answers the question
- **score 0.5-0.8**: Moderately relevant — contains useful context
- **score < 0.5**: Low relevance — may not be useful
- Always cite the source document when using vector results

## Vector Column Notes
- Vector columns are typically `bytes` type with `vector(dimensions)` property
- The `normalize` option (`vector(3, normalize)`) L2-normalizes on insert/update
- Cosine distance is most common for text embeddings
