# Kinetica Geospatial Query Examples

All examples use Kinetica-specific syntax. Note: identifiers must be double-quoted,
SRID 4326 is implicit, and ST_DISTANCE requires 3 arguments.

## Points Within Radius (STXY_DISTANCE)

```sql
-- All stores within 5km of NYC using STXY_DISTANCE (fastest)
SELECT "name", "address",
    STXY_DISTANCE("longitude", "latitude", ST_MAKEPOINT(-74.0060, 40.7128), 1) AS "distance_m"
FROM "retail"."stores"
WHERE STXY_DWITHIN("longitude", "latitude", ST_MAKEPOINT(-74.0060, 40.7128), 5000, 1) = 1
ORDER BY "distance_m"
LIMIT 100
```

## Point-in-Polygon Containment

```sql
-- Which delivery zone contains this address?
SELECT "zone_name", "zone_type"
FROM "logistics"."delivery_zones"
WHERE ST_CONTAINS("geom", ST_GEOMFROMTEXT('POINT(-73.9857 40.7484)'))
LIMIT 100

-- Using accelerated STXY variant (faster with lon/lat columns)
SELECT "zone_name"
FROM "logistics"."delivery_zones"
WHERE STXY_CONTAINS("geom", -73.9857, 40.7484) = 1
LIMIT 100
```

## Spatial JOIN — Count by Region

```sql
-- Customers per sales territory
SELECT "t"."territory_name", COUNT("c"."id") AS "customer_count"
FROM "sales"."territories" AS "t"
INNER JOIN "sales"."customers" AS "c"
    ON STXY_CONTAINS("t"."geom", "c"."longitude", "c"."latitude") = 1
GROUP BY "t"."territory_name"
ORDER BY "customer_count" DESC
LIMIT 100
```

## Nearest Neighbor

```sql
-- 10 nearest hospitals to Los Angeles
SELECT "name", "address",
    STXY_DISTANCE("lon", "lat", ST_MAKEPOINT(-118.2437, 34.0522), 1) AS "distance_m"
FROM "health"."hospitals"
ORDER BY "distance_m" ASC
LIMIT 10
```

## Buffer / Proximity Search

```sql
-- All incidents within 1km of a pipeline
SELECT "i"."incident_type", "i"."severity", "i"."incident_date"
FROM "safety"."incidents" AS "i"
INNER JOIN "infra"."pipelines" AS "p"
    ON ST_DWITHIN("i"."geom", "p"."geom", 1000, 1)
WHERE "p"."pipeline_id" = 'PL-001'
LIMIT 100
```

## Area Calculation (with solution parameter)

```sql
-- Largest parcels in square meters (Haversine)
SELECT "parcel_id", "owner_name",
    ST_AREA("geom", 1) AS "area_sq_m"
FROM "property"."parcels"
ORDER BY "area_sq_m" DESC
LIMIT 10
```

## Track Distance — Sequential Points with CTE

Must use CTE to avoid nested aggregates:

```sql
WITH "positions" AS (
    SELECT "TRACKID", "TIMESTAMP", "X", "Y",
        LAG("X") OVER (PARTITION BY "TRACKID" ORDER BY "TIMESTAMP") AS "prev_X",
        LAG("Y") OVER (PARTITION BY "TRACKID" ORDER BY "TIMESTAMP") AS "prev_Y"
    FROM "vessel_tracking"."ais_tracks"
)
SELECT "TRACKID",
    SUM(CASE
        WHEN "prev_X" IS NOT NULL
        THEN STXY_DISTANCE("X", "Y", ST_MAKEPOINT("prev_X", "prev_Y"), 1)
        ELSE 0
    END) AS "total_distance_m"
FROM "positions"
GROUP BY "TRACKID"
ORDER BY "total_distance_m" DESC
LIMIT 10
```

## H3 Spatial Indexing

```sql
-- Aggregate events by H3 cell (resolution 7)
SELECT H3_XYTOCELL("longitude", "latitude", 7) AS "h3_cell",
    COUNT(*) AS "event_count"
FROM "schema"."events"
GROUP BY "h3_cell"
ORDER BY "event_count" DESC
LIMIT 100

-- Get H3 cell boundary as polygon
SELECT H3_CELLTOBOUNDARY(H3_XYTOCELL(-74.0060, 40.7128, 9)) AS "cell_boundary"

-- Find all cells within 2 hex steps
SELECT H3_GRIDDISKN(H3_XYTOCELL(-74.0060, 40.7128, 7), 2, ITER.i) AS "neighbor_cell"
FROM ITER
WHERE ITER.i < H3_NUMGRIDDISK(H3_XYTOCELL(-74.0060, 40.7128, 7), 2)
```

## Geofencing

```sql
-- Tracks that passed through a geofence
SELECT DISTINCT "TRACKID"
FROM "tracking"."positions"
WHERE STXY_CONTAINS(
    ST_GEOMFROMTEXT('POLYGON((-74.1 40.7, -74.0 40.7, -74.0 40.8, -74.1 40.8, -74.1 40.7))'),
    "X", "Y"
) = 1

-- Using track functions
SELECT * FROM TABLE(
    ST_TRACKINTERSECTS(
        INPUT_TABLE("tracking"."positions"),
        "TRACKID", "X", "Y", "TIMESTAMP",
        ST_GEOMFROMTEXT('POLYGON((...))'),
        INTERVAL '0' SECOND, INTERVAL '1' HOUR
    )
)
```

## Dissolve Overlapping Regions

```sql
-- Merge overlapping coverage areas into single geometry
SELECT ST_DISSOLVEOVERLAPPING("coverage_geom") AS "merged_coverage"
FROM "telecom"."cell_towers"
WHERE "region" = 'Northeast'
```

## Grid Generation

```sql
-- Generate a hex grid over an area of interest
SELECT * FROM TABLE(
    ST_HEXGRID(-74.3, 40.5, -73.7, 40.9, 0.01)
)
LIMIT 1000
```

## Rich Results Pattern

When querying spatial data, include extra context columns:

```sql
-- Not just distance — include useful details
SELECT "TRACKID", "transmitter_type", "country", "destination",
    "course_over_ground", "speed_over_ground",
    "ship_beam", "ship_length", "draught",
    STXY_DISTANCE("X", "Y", ST_MAKEPOINT(125.7625, 39.0392), 1) AS "distance_m"
FROM "vessel_tracking"."ais_tracks"
GROUP BY 1,2,3,4,5,6,7,8,9,"X","Y"
HAVING "distance_m" <= 50000
ORDER BY "distance_m"
LIMIT 10
```
