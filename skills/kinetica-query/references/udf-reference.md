# Kinetica UDFs, Procedures & Functions

User-Defined Functions (UDFs) run custom code (Python, etc.) inside the Kinetica cluster.
SQL Procedures are scheduled SQL batches. Both are Kinetica-specific — no PostgreSQL equivalent.

## UDF — User-Defined Functions

### Create UDF

```sql
CREATE [OR REPLACE] FUNCTION "schema"."my_udf"
  RETURNS TABLE ("result_col" VARCHAR, "score" DOUBLE)  -- UDTF (table function)
  MODE = 'DISTRIBUTED'                                   -- or NONDISTRIBUTED
  RUN_COMMAND = 'python'
  RUN_COMMAND_ARGS = 'my_script.py'
  FILE PATHS 'kifs://udf/my_script.py, kifs://udf/utils.py'
  WITH OPTIONS (
    max_concurrency_per_node = 2,
    set_environment = 'my_env'
  )
```

Without `RETURNS TABLE`, creates a regular UDF (not table function).

### Execute UDF

```sql
-- As a function call (returns result set)
EXECUTE FUNCTION "schema"."my_udf" (
  INPUT_TABLE_NAMES  => INPUT_TABLE("schema"."source"),
  OUTPUT_TABLE_NAMES => OUTPUT_TABLES('schema.output1', 'schema.output2'),
  PARAMS             => KV_PAIRS(threshold = '0.5', mode = 'fast'),
  OPTIONS            => KV_PAIRS(run_tag = 'my-run-001')
)
```

### Execute UDTF (Inline in SELECT)

```sql
SELECT * FROM TABLE(
  "schema"."my_udtf"(
    INPUT_TABLE_NAMES => INPUT_TABLE(
      SELECT "col1", "col2" FROM "schema"."source" WHERE "active" = 1
    )
  )
)
```

### Management

```sql
DROP FUNCTION "schema"."my_udf"
SHOW FUNCTION "schema"."my_udf"
SHOW FUNCTION *                          -- list all
SHOW FUNCTION STATUS                     -- running UDFs
SHOW FUNCTION STATUS VERBOSE FOR 'run-id'
DESCRIBE FUNCTION "schema"."my_udf"
```

## Python Environments

UDFs run in managed Python environments with pre-installed packages:

```sql
-- Create custom environment
CREATE [OR REPLACE] FUNCTION ENVIRONMENT "my_env"

-- Install packages
ALTER FUNCTION ENVIRONMENT "my_env"
  INSTALL PYTHON PACKAGE 'pandas==2.1.0 scikit-learn>=1.3'

-- Uninstall packages
ALTER FUNCTION ENVIRONMENT "my_env"
  UNINSTALL PYTHON PACKAGE 'scikit-learn'

DROP FUNCTION ENVIRONMENT "my_env"
SHOW FUNCTION ENVIRONMENT "my_env"
DESCRIBE FUNCTION ENVIRONMENT "my_env"
```

Default environment: `kinetica-default-environment`.

## SQL Procedures

SQL procedures are **scheduled SQL batches** — not stored functions with parameters.
If any referenced object is dropped, the procedure is auto-dropped.

### Create Procedure

```sql
CREATE [OR REPLACE] PROCEDURE "schema"."daily_refresh" ()
LANGUAGE SQL
BEGIN
    DELETE FROM "analytics"."daily_stats"
    WHERE "date" < DATEADD('DAY', -90, NOW());

    INSERT INTO "analytics"."daily_stats"
    SELECT DATE_TRUNC('day', "created_at") AS "date",
           COUNT(*) AS "cnt", SUM("amount") AS "total"
    FROM "sales"."orders"
    WHERE "created_at" >= DATEADD('DAY', -1, NOW())
    GROUP BY "date";
END
EXECUTE FOR EVERY 1 HOUR
  STARTING AT '2024-01-01 00:00:00'
  STOP AFTER '2025-12-31 23:59:59'
WITH OPTIONS (EXECUTE AS = 'etl_user')
```

Supported statements inside: SELECT, INSERT, UPDATE, DELETE, CREATE/DROP TABLE,
EXECUTE FUNCTION, EXECUTE PROCEDURE, SHOW SECURITY, SHOW RESOURCE GROUP.

### Schedule Options

```sql
-- Run every 30 minutes
EXECUTE FOR EVERY 30 MINUTES

-- Run daily at midnight
EXECUTE FOR EVERY 1 DAY STARTING AT '2024-01-01 00:00:00'

-- Run for a limited time
EXECUTE FOR EVERY 1 HOUR STOP AFTER '2024-12-31 23:59:59'
EXECUTE FOR EVERY 1 HOUR STOP AFTER INTERVAL '30' DAY
```

### Alter Schedule

```sql
ALTER PROCEDURE "schema"."daily_refresh"
  SET EXECUTE FOR EVERY 2 HOURS STARTING AT '2024-06-01 00:00:00'

ALTER PROCEDURE "schema"."daily_refresh"
  SET EXECUTE AS 'new_user'
```

### Management

```sql
EXECUTE PROCEDURE "schema"."daily_refresh"   -- run immediately
DROP PROCEDURE "schema"."daily_refresh"
SHOW PROCEDURE "schema"."daily_refresh"
SHOW PROCEDURE *                              -- list all
```

## Built-In ML Table Functions

These are built-in (no UDF setup required):

### Linear Regression Prediction

```sql
SELECT "x", "y" FROM TABLE(
    PREDICT(
        HISTORY_TABLE     => INPUT_TABLE("schema"."training_data"),
        X_COLUMN          => 'timestamp_col',
        Y_COLUMN          => 'value_col',
        PREDICT_ON_TABLE  => INPUT_TABLE("schema"."future_dates"),
        PREDICT_ON_COLUMN => 'timestamp_col',
        PREDICT_METHOD    => 'LINEAR'
    )
)
```

### Outlier Detection

```sql
SELECT * FROM TABLE(
    OUTLIERS(
        DATA_TABLE        => INPUT_TABLE("schema"."sensor_data"),
        DATA_COLUMN       => 'reading',
        PARTITION_COLUMN  => 'sensor_id',
        OUTLIER_METHOD    => 'ZSCORE',       -- or PERCENTILE
        THRESHOLD_HIGH    => 3.0,
        OUTPUT_DATA       => 'ALL',          -- OUTLIERS|NON_OUTLIERS|ALL
        OUTPUT_SCORE      => TRUE
    )
)
```

## Docker Model Management

Import and run containerized ML models:

```sql
-- Register container registry
CREATE CONTAINER REGISTRY "my_registry"
  URI = 'https://myregistry.azurecr.io'
  CREDENTIAL = "azure_cred"

-- Import model
IMPORT MODEL "sentiment_model"
  REGISTRY = "my_registry"
  CONTAINER = 'ml-models/sentiment:v2'
  RUN_FUNCTION = 'predict'

-- Batch inference
SELECT * FROM TABLE(
    EVALUATE_MODEL(
        MODEL            => 'sentiment_model',
        DEPLOYMENT_MODE  => 'BATCH',
        REPLICATIONS     => 2,
        SOURCE_TABLE     => INPUT_TABLE("schema"."reviews")
    )
)

-- Management
DROP MODEL "sentiment_model"
SHOW MODEL *
DESCRIBE MODEL "sentiment_model"
```
