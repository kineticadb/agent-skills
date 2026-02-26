# Kinetica Security & Administration Reference

Security commands follow PostgreSQL-style GRANT/REVOKE but with Kinetica-specific
extensions for row-level security, column masking, and resource groups.

## User Management

```sql
CREATE USER "analyst"
  WITH PASSWORD = 'secret123'
  WITH RESOURCE GROUP = "analytics_rg"
  WITH DEFAULT SCHEMA = "sales"

-- External LDAP user (no password, prefixed with @)
CREATE USER "@ldap_user"

ALTER USER "analyst" SET PASSWORD = 'new_pwd'
ALTER USER "analyst" SET RESOURCE GROUP = "default"
ALTER USER "analyst" SET DEFAULT SCHEMA = "reporting"
ALTER USER "analyst" SET ACTIVATED = FALSE    -- disable login

DROP USER "analyst"

-- Inspect permissions
SHOW SECURITY FOR "analyst"
```

## Role Management

```sql
CREATE ROLE "data_reader" WITH RESOURCE GROUP = "readonly_rg"
ALTER ROLE "data_reader" SET RESOURCE GROUP = DEFAULT
DROP ROLE "data_reader"
SHOW SECURITY FOR "data_reader"
```

## GRANT / REVOKE

### Role Assignment

```sql
GRANT "data_reader" TO "analyst"
GRANT "data_reader" TO "senior_role"    -- role-to-role
REVOKE "data_reader" FROM "analyst"
```

### System Permissions

```sql
GRANT SYSTEM ADMIN TO "dba_role"        -- full admin
GRANT SYSTEM CREATE TO "dev_role"       -- create schemas/tables
GRANT SYSTEM MONITOR TO "ops_role"      -- view system status
GRANT SYSTEM READ TO "reader_role"      -- read all objects
GRANT SYSTEM WRITE TO "writer_role"     -- write all objects
GRANT USER ADMIN TO "team_lead"         -- manage users

REVOKE SYSTEM CREATE FROM "dev_role"
```

### Schema Permissions

```sql
GRANT ALL ON SCHEMA "sales" TO "analyst" WITH GRANT OPTION
GRANT SELECT ON SCHEMA "reporting" TO "viewer_role"
GRANT CREATE TABLE ON SCHEMA "staging" TO "etl_role"
GRANT INSERT, UPDATE, DELETE ON SCHEMA "staging" TO "etl_role"

REVOKE SELECT ON SCHEMA "sales" FROM "viewer_role"
```

### Table Permissions

```sql
GRANT SELECT ON TABLE "sales"."orders" TO "analyst"
GRANT INSERT, UPDATE ON TABLE "staging"."raw" TO "etl_role"
GRANT ALL ON TABLE "sales"."orders" TO "admin_role" WITH GRANT OPTION

REVOKE UPDATE ON TABLE "sales"."orders" FROM "analyst"
```

### Object-Specific Permissions

```sql
GRANT READ ON CREDENTIAL "aws_creds" TO "etl_role"
GRANT CONNECT ON DATA SOURCE "s3_source" TO "etl_role"
GRANT CONNECT ON DATA SINK "kafka_sink" TO "streaming_role"
GRANT READ, WRITE ON DIRECTORY "kifs://uploads" TO "etl_role"
GRANT EXECUTE ON FUNCTION "my_udf" TO "analyst"
GRANT READ ON GRAPH "social_graph" TO "analyst"
GRANT EXECUTE PROCEDURE ON "daily_refresh" TO "scheduler_role"
GRANT READ ON CONTEXT "search_ctx" TO "analyst"
GRANT ADMIN ON STREAM "cdc_stream" TO "admin_role"
```

## Row-Level Security

Apply row filters via WHERE clause on GRANT SELECT:

```sql
-- User only sees orders from 2024 onward
GRANT SELECT ON "sales"."orders" TO "limited_analyst"
  WHERE "order_date" >= '2024-01-01'

-- User only sees their own records
GRANT SELECT ON "hr"."employees" TO "employee_role"
  WHERE "manager_id" = CURRENT_USER()
```

## Column-Level Security

Restrict or obfuscate specific columns:

```sql
-- Only grant access to specific columns
GRANT SELECT ("order_id", "product", "amount") ON "sales"."orders" TO "limited_role"

-- Obfuscate column (deterministic hash — same input → same output, enables JOINs)
GRANT SELECT (OBFUSCATE("ssn"), "name", "department") ON "hr"."employees" TO "analyst"

-- Mask column (partial reveal)
GRANT SELECT (MASK("ssn", 'XXX-XX-####'), "name") ON "hr"."employees" TO "analyst"
GRANT SELECT (MASK("credit_card", '####-XXXX-XXXX-XXXX')) ON "billing"."cards" TO "support"
```

## CHECK PERMISSION / CHECK ROLE

```sql
-- Check if current user has permission
CHECK SELECT ON TABLE "sales"."orders"

-- Check for another user
CHECK INSERT PERMISSION ON TABLE "staging"."raw" FOR "etl_user"

-- Check role membership
CHECK ROLE OF "data_reader" FOR "analyst"
```

## Impersonation (EXECUTE AS)

Only available via KiSQL or ODBC/JDBC (not HTTP API):

```sql
EXECUTE AS USER = 'analyst'       -- impersonate user
-- ... queries run as 'analyst' ...
REVERT                            -- return to original user

SET USER "analyst"                -- alias for EXECUTE AS
EXECUTE AS USER = 'analyst' WITH NO REVERT  -- permanent for session
```

## Resource Groups

Control query resource allocation per user/role:

```sql
CREATE RESOURCE GROUP "analytics_rg"
  RANK AFTER "system_default"
  TIER LIMITS (
    VRAM USING (max_memory = 8000000000),
    RAM USING (max_memory = 32000000000)
  )
  WITH OPTIONS (
    max_cpu_concurrency = 4,
    max_data = 100000000000,
    max_scheduling_priority = 5,
    max_tier_priority = 3
  )

ALTER RESOURCE GROUP "analytics_rg"
  WITH OPTIONS (max_cpu_concurrency = 8, persist = true)

DROP RESOURCE GROUP "analytics_rg"

SHOW RESOURCE GROUP "analytics_rg"
SHOW RESOURCE GROUP ALL
```

Default groups: `kinetica_system_resource_group`, `kinetica_default_resource_group`.

Assign to users/roles:
```sql
CREATE USER "analyst" WITH RESOURCE GROUP = "analytics_rg"
ALTER USER "analyst" SET RESOURCE GROUP = "analytics_rg"
CREATE ROLE "heavy_users" WITH RESOURCE GROUP = "analytics_rg"
```

## Tier Management

```sql
ALTER TIER VRAM WITH OPTIONS (capacity = 16000000000, high_watermark = 90, low_watermark = 70)
ALTER TIER RAM WITH OPTIONS (capacity = 64000000000, high_watermark = 85)
ALTER TIER PERSIST WITH OPTIONS (capacity = 500000000000)
```

Tiers: `VRAM`, `RAM`, `DISK1`..`DISK2`, `PERSIST`, `COLD1`..`COLD2`.
