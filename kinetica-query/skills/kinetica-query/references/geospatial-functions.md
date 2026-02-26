# Geospatial Functions Reference

Kinetica geospatial is PostGIS-based with Kinetica-specific modifications.

## CRITICAL: SRID and Distance Rules

- Kinetica **exclusively uses SRID 4326 (WGS 84)** — do not specify or change SRID
- `ST_DISTANCE` takes exactly **3 arguments**: `ST_DISTANCE(geom1, geom2, solution)`
- Solution parameter: `0`=Euclidean, `1`=Haversine (meters, recommended), `2`=Vincenty (more accurate, slower)

## Core Distance Functions

| Function | Description |
|----------|-------------|
| `ST_DISTANCE(geom1, geom2, solution)` | Distance between geometries (3 args required) |
| `STXY_DISTANCE(x, y, geom, solution)` | Distance from point coords to geometry (faster) |
| `ST_DWITHIN(geom1, geom2, dist)` | True if within distance |

## Accelerated STXY_* Functions

Prefer these for performance with explicit X/Y coordinates:

| Function | Description |
|----------|-------------|
| `STXY_CONTAINS(geom, x_lon, y_lat)` | 1 if geom contains point |
| `STXY_INTERSECTS(geom, x_lon, y_lat)` | 1 if geom intersects point |
| `STXY_DWITHIN(geom, x_lon, y_lat, distance_m)` | 1 if within distance |
| `STXY_DISTANCE(x, y, geom, solution)` | Minimum distance |
| `STXY_WITHIN(x, y, geom)` | 1 if point is inside geom |
| `STXY_DISJOINT(x, y, geom)` | 1 if point and geom don't intersect |
| `STXY_COVERS(geom, x, y)` | 1 if geom covers point |
| `STXY_COVEREDBY(x, y, geom)` | 1 if point is covered by geom |
| `STXY_TOUCHES(x, y, geom)` | 1 if they share boundary |

## Standard ST_* Functions

### Containment & Intersection
| Function | Description |
|----------|-------------|
| `ST_CONTAINS(geom, point)` | True if geometry contains point |
| `ST_WITHIN(geom1, geom2)` | True if geom1 is within geom2 |
| `ST_INTERSECTS(geom1, geom2)` | True if geometries overlap |
| `ST_CROSSES(geom1, geom2)` | True if geometries cross |
| `ST_TOUCHES(geom1, geom2)` | True if geometries touch at boundary |
| `ST_EQUALS(geom1, geom2)` | True if geometries are identical |
| `ST_OVERLAPS(geom1, geom2)` | True if overlapping but neither contains the other |
| `ST_DISJOINT(geom1, geom2)` | True if geometries do not intersect |

### Geometry Construction
| Function | Description |
|----------|-------------|
| `ST_MAKEPOINT(lon, lat)` | Create point (implicit SRID 4326) |
| `ST_GEOMFROMTEXT('POINT(lon lat)')` | Create from WKT (implicit SRID 4326) |
| `ST_BUFFER(geom, distance, solution)` | Buffer zone (meters if Haversine/Vincenty) |
| `ST_ENVELOPE(geom)` | Bounding box |
| `ST_CONVEXHULL(geom)` | Convex hull |

### Geometry Properties
| Function | Description |
|----------|-------------|
| `ST_AREA(geom, solution)` | Area (accepts solution param) |
| `ST_PERIMETER(geom)` | Perimeter of polygon |
| `ST_CENTROID(geom)` | Center point |
| `ST_X(point)` / `ST_Y(point)` | Extract longitude / latitude |
| `ST_ASTEXT(geom)` | Convert to WKT string |
| `ST_ASGEOJSON(geom)` | Convert to GeoJSON |

### Aggregate Geospatial
| Function | Description |
|----------|-------------|
| `ST_COLLECT_AGGREGATE(geom)` | Aggregate into GEOMETRYCOLLECTION |
| `ST_DISSOLVE(geom)` | Merge all geometries into one |
| `ST_DISSOLVEOVERLAPPING(geom)` | Optimized for overlapping geometries |
| `ST_INTERSECTION_AGGREGATE(geom)` | Shared portions among geometries |

## H3 Spatial Indexing

| Function | Description |
|----------|-------------|
| `H3_GEOMTOCELL(geom, res)` | Geometry to H3 cell at resolution |
| `H3_XYTOCELL(x, y, res)` | Coordinates to H3 cell |
| `H3_CELLTOBOUNDARY(h3_index)` | Cell boundary as polygon |
| `H3_CELLTOPARENT(h3_index, res)` | Parent cell at resolution |
| `H3_CELLTOCHILDREN(h3_index, res)` | Child cells at resolution |
| `H3_KRING(h3_index, k)` | All cells within k steps |
| `H3_POLYFILL(geom, res)` | Fill polygon with H3 cells |
| `H3_COMPACT(cells)` | Compact cells into parents |
| `H3_UNCOMPACT(cells, res)` | Expand parents into children |

## Key Differences from PostGIS

| Function | Kinetica | PostGIS |
|----------|----------|---------|
| `ST_Area(geom, solution)` | Accepts solution param. SRID 4326 only. | No solution param, flexible SRID |
| `ST_Distance(geom1, geom2, solution)` | 3 args required. SRID 4326 only. | 2 args, flexible SRID |
| `ST_Buffer(geom, dist, solution)` | Meters if Haversine/Vincenty | Distance in SRID units |
| `ST_MAKEPOINT(lon, lat)` | Implicit SRID 4326 | Often needs ST_SetSRID |

## Tips

- WKT format: `POINT(longitude latitude)` — longitude first
- For spatial JOINs, prefer `STXY_DWITHIN` over distance comparison (uses spatial index)
- Use STXY_* functions over ST_* when you have separate lon/lat columns (faster)
- Use CTE to separate window functions from geospatial aggregates
