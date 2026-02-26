# Kinetica Geospatial Functions Reference

Kinetica geospatial is PostGIS-based with Kinetica-specific modifications.
Standard PostGIS functions work, but these rules are critical.

## CRITICAL Rules

- **SRID 4326 exclusively** — never specify or change SRID. All geospatial data uses WGS 84.
- **ST_DISTANCE takes exactly 3 arguments**: `ST_DISTANCE(geom1, geom2, solution)` — not 2.
- **Solution parameter**: `0`=Euclidean, `1`=Haversine (meters, **recommended default**), `2`=Vincenty (more accurate, slower)
- Functions that accept `solution`: `ST_DISTANCE`, `ST_AREA`, `ST_LENGTH`, `ST_BUFFER`, `ST_PERIMETER`, `ST_DWITHIN`, `ST_DFULLYWITHIN`, `ST_MAXDISTANCE`, `STXY_DISTANCE`, `STXY_DWITHIN`
- WKT format: `POINT(longitude latitude)` — **longitude first**
- `ST_MAKEPOINT(longitude, latitude)` — implicit SRID 4326, no `ST_SetSRID` needed
- `ST_GEOMFROMTEXT('WKT')` — single arg, implicit SRID 4326

## Key Differences from PostGIS

| Function | Kinetica | PostGIS |
|----------|----------|---------|
| `ST_DISTANCE` | 3 args: `(geom1, geom2, solution)`. SRID 4326 only. | 2 args. Flexible SRID. |
| `ST_AREA` | `(geom, solution)` | No solution param |
| `ST_LENGTH` | `(geom, solution)` | No solution param |
| `ST_BUFFER` | `(geom, distance, solution)`. Meters if Haversine/Vincenty. | Distance in SRID units |
| `ST_MAKEPOINT` | Implicit SRID 4326 | Often needs `ST_SetSRID` |
| `ST_GEOMFROMTEXT` | Single arg, implicit 4326 | Usually `ST_GeomFromText(wkt, srid)` |
| `STXY_*` functions | Kinetica-only accelerated point functions | No equivalent |
| `GEODIST` | `(lon1, lat1, lon2, lat2)` — meters | No equivalent |

## Accelerated STXY_* Functions (Kinetica-Specific)

**Prefer these over ST_* when you have separate lon/lat columns** — significantly faster.

| Function | Description | Returns |
|----------|-------------|---------|
| `STXY_CONTAINS(geom, x, y)` | Geometry contains point | 1/0 |
| `STXY_CONTAINSPROPERLY(geom, x, y)` | Point intersects interior not boundary | 1/0 |
| `STXY_INTERSECTS(x, y, geom)` | Point and geometry intersect | 1/0 |
| `STXY_WITHIN(x, y, geom)` | Point inside geometry (not on boundary) | 1/0 |
| `STXY_DWITHIN(x, y, geom, distance [, solution])` | Point within distance of geometry | 1/0 |
| `STXY_DISTANCE(x, y, geom [, solution])` | Minimum distance from point to geometry | meters |
| `STXY_DISJOINT(x, y, geom)` | No spatial intersection | 1/0 |
| `STXY_COVERS(geom, x, y)` | Geometry covers point | 1/0 |
| `STXY_COVEREDBY(x, y, geom)` | Point covered by geometry | 1/0 |
| `STXY_TOUCHES(x, y, geom)` | Share boundary point | 1/0 |
| `STXY_ENVDWITHIN(x, y, geom, distance [, solution])` | Within distance of bounding box | 1/0 |
| `STXY_ENVINTERSECTS(x, y, geom)` | Bounding box intersects point | 1/0 |
| `STXY_INTERSECTION(x, y, geom)` | Shared portion | geometry |
| `STXY_GEOHASH(x, y [, precision])` | Geohash string (precision 1-32) | string |
| `STXY_H3(x, y, resolution)` | Alias for H3_XYTOCELL | H3 index |

Note argument order: some take `(geom, x, y)`, others `(x, y, geom)`. Check each function.

## Distance Functions

| Function | Description |
|----------|-------------|
| `ST_DISTANCE(geom1, geom2, solution)` | Distance between geometries (**3 args required**) |
| `STXY_DISTANCE(x, y, geom [, solution])` | Point-to-geometry distance (faster) |
| `GEODIST(lon1, lat1, lon2, lat2)` | Great-circle distance in meters (no geom needed) |
| `DIST(x1, y1, x2, y2)` | Euclidean distance in degrees |
| `ST_MAXDISTANCE(geom1, geom2 [, solution])` | Maximum distance |
| `ST_DWITHIN(geom1, geom2, dist [, solution])` | True if within distance |
| `ST_DFULLYWITHIN(geom1, geom2, dist [, solution])` | True if max distance within threshold |

**Best practice for point-to-point distance:**
```sql
-- When you have lon/lat columns, use STXY_DISTANCE (fastest)
STXY_DISTANCE("lon", "lat", ST_MAKEPOINT(-74.0060, 40.7128), 1) AS "distance_m"

-- For geometry-to-geometry
ST_DISTANCE("geom1", "geom2", 1) AS "distance_m"
```

## Containment & Spatial Relationships (ST_*)

| Function | Description |
|----------|-------------|
| `ST_CONTAINS(geom1, geom2)` | geom1 contains geom2 |
| `ST_CONTAINSPROPERLY(geom1, geom2)` | Interior intersection only |
| `ST_WITHIN(geom1, geom2)` | geom1 inside geom2 |
| `ST_INTERSECTS(geom1, geom2)` | Geometries intersect |
| `ST_CROSSES(geom1, geom2)` | Geometries cross |
| `ST_TOUCHES(geom1, geom2)` | Touch at boundary |
| `ST_OVERLAPS(geom1, geom2)` | Share space, neither contains other |
| `ST_EQUALS(geom1, geom2)` | Spatially equal |
| `ST_DISJOINT(geom1, geom2)` | No intersection |
| `ST_COVEREDBY(geom1, geom2)` | No point in geom1 outside geom2 |
| `ST_COVERS(geom1, geom2)` | No point in geom2 outside geom1 |

## Geometry Construction

| Function | Description |
|----------|-------------|
| `ST_MAKEPOINT(x, y)` | Point from lon/lat (SRID 4326 implicit) |
| `ST_POINT(x, y)` | Alias for ST_MAKEPOINT |
| `ST_GEOMFROMTEXT(wkt)` | Geometry from WKT string |
| `ST_MAKELINE(geom [, geom2])` | LINESTRING from points |
| `ST_MAKEPOLYGON(geom)` | POLYGON from closed LINESTRING |
| `ST_MAKEENVELOPE(xmin, ymin, xmax, ymax)` | Rectangular POLYGON (bounding box) |
| `ST_COLLECT(geom1, geom2)` | MULTI* or GEOMETRYCOLLECTION |
| `ST_BUFFER(geom, radius [, style [, solution]])` | Buffered geometry |
| `ST_CONVEXHULL(geom)` | Minimum convex geometry |
| `ST_CONCAVEHULL(geom, pct [, holes])` | Concave enclosing geometry |
| `ST_ELLIPSE(x, y, h, w)` | Ellipse at coordinates |
| `ST_HEXGRID(xmin, ymin, xmax, ymax, side [, limit])` | Hexagonal grid |
| `ST_SQUAREGRID(xmin, ymin, xmax, ymax, side [, limit])` | Square grid |
| `ST_TRIANGLEGRID(xmin, ymin, xmax, ymax, side [, limit])` | Triangle grid |
| `ST_POINTGRID(xmin, ymin, xmax, ymax, side [, limit])` | Point grid |
| `ST_GENERATEPOINTS(geom, num)` | Random MULTIPOINT within geometry |

## Geometry Manipulation

| Function | Description |
|----------|-------------|
| `ST_INTERSECTION(geom1, geom2)` | Shared portion |
| `ST_UNION(geom1, geom2)` | Point set union |
| `ST_DIFFERENCE(geom1, geom2)` | geom1 minus intersection |
| `ST_SYMDIFFERENCE(geom1, geom2)` | Non-intersecting portions |
| `ST_CLIP(geom1, geom2)` | Shared geometry |
| `ST_SPLIT(geom1, geom2)` | Split geometries |
| `ST_SNAP(geom1, geom2, tolerance)` | Snap within tolerance |
| `ST_SIMPLIFY(geom, tolerance)` | Simplified geometry |
| `ST_SIMPLIFYPRESERVETOPOLOGY(geom, tolerance)` | Simplified preserving topology |
| `ST_SEGMENTIZE(geom, max_size [, solution])` | Break into smaller segments |
| `ST_TRANSLATE(geom, dx, dy [, dz])` | Move by offsets |
| `ST_ROTATE(geom, radians [, x, y])` | Counter-clockwise rotation |
| `ST_SCALE(geom, x, y)` | Scale by factors |
| `ST_REVERSE(geom)` | Reversed coordinate order |
| `ST_FORCE2D(geom)` | 2D version |
| `ST_FORCE3D(geom [, z])` | 3D version |
| `ST_MAKEVALID(geom [, options])` | Fix invalid geometry |
| `ST_PARTITION(geom [, threshold])` | Partition into POLYGONs |
| `ST_MULTI(geom)` | Convert to MULTI- type |
| `ST_LINEMERGE(geom)` | Merge LINESTRING segments |

## Geometry Properties

| Function | Description |
|----------|-------------|
| `ST_AREA(geom [, solution])` | Area (solution param!) |
| `ST_LENGTH(geom [, solution])` | Length of LINESTRING |
| `ST_PERIMETER(geom [, solution])` | Perimeter of POLYGON |
| `ST_CENTROID(geom)` | Center point |
| `ST_X(point)` / `ST_Y(point)` | X/Y coordinate |
| `ST_MAXX/MAXY/MINX/MINY(geom)` | Bounding box coordinates |
| `ST_MAXZ/MINZ(geom)` | Z bounding box |
| `ST_ENVELOPE(geom)` | Bounding box as POLYGON |
| `ST_DIMENSION(geom)` | 0=POINT, 1=LINE, 2=POLYGON |
| `ST_GEOMETRYTYPE(geom)` | Type string |
| `ST_NPOINTS(geom)` | Vertex count |
| `ST_NRINGS(geom)` | Ring count |
| `ST_NUMGEOMETRIES(geom)` | Geometry count in collection |
| `ST_NUMINTERIORRINGS(geom)` | Interior ring count |
| `ST_NUMPOINTS(geom)` | Points in LINESTRING |
| `ST_GEOMETRYN(geom, index)` | N-th geometry (1-based) |
| `ST_POINTN(geom, n)` | N-th point (1-based) |
| `ST_POINTS(geom)` | MULTIPOINT of all coordinates |
| `ST_STARTPOINT(geom)` | First point |
| `ST_ENDPOINT(geom)` | Last point |
| `ST_EXTERIORRING(geom)` | Exterior ring LINESTRING |
| `ST_BOUNDARY(geom)` | Boundary closure |
| `ST_ISCLOSED(geom)` | Start = end? |
| `ST_ISEMPTY(geom)` | Empty geometry? |
| `ST_ISRING(geom)` | Closed and simple? |
| `ST_ISSIMPLE(geom)` | No anomalous points? |
| `ST_ISVALID(geom)` | Well-formed? |
| `ST_CLOSESTPOINT(geom1, geom2 [, solution])` | Closest point |
| `ST_SHORTESTLINE(geom1, geom2)` | Shortest line between |
| `ST_LONGESTLINE(geom1, geom2 [, solution])` | Longest line between |
| `ST_LINEINTERPOLATEPOINT(geom, frac)` | Point at fraction along line |
| `ST_LINELOCATEPOINT(line, point)` | Fraction 0-1 of point on line |
| `ST_LINESUBSTRING(geom, start, end)` | Portion of LINESTRING |
| `ST_REMOVEPOINT(geom, offset)` | Remove point (0-based) |
| `ST_AZIMUTH(geom1, geom2)` | Azimuth in radians |
| `ST_PROJECT(geom, dist, azimuth)` | Projected point |
| `ST_GEOHASH(geom [, precision])` | Geohash of centroid |
| `ST_WKTTOWKB(geom)` | WKT to WKB binary |

## Aggregate Geospatial (Kinetica-Specific)

| Function | Description |
|----------|-------------|
| `ST_COLLECT_AGGREGATE(geom)` | Aggregate into GEOMETRYCOLLECTION |
| `ST_DISSOLVE(geom)` | Merge all geometries into one |
| `ST_DISSOLVEOVERLAPPING(geom)` | Optimized for overlapping geometries |
| `ST_INTERSECTION_AGGREGATE(geom)` | Shared portions among all geometries |
| `ST_LINESTRINGFROMORDEREDPOINTS(x, y, t)` | Build track from ordered points |
| `ST_LINESTRINGFROMORDEREDPOINTS3D(x, y, z, t)` | 3D track |
| `ST_POLYGONIZE(geom)` | POLYGONs from LINESTRINGs |

No direct PostGIS equivalents for DISSOLVE and INTERSECTION_AGGREGATE.

## Track Functions (Kinetica-Specific)

| Function | Description |
|----------|-------------|
| `ST_TRACKDURATION([unit,] t)` | Total time spanned by track |
| `ST_TRACKLENGTH(lat, lon, t [, solution])` | Total track distance |
| `ST_TRACK_DWITHIN(...)` | Related tracks within spatial/temporal bounds |
| `ST_TRACKINTERSECTS(...)` | Tracks passing through geofences |

## H3 Spatial Indexing (Kinetica-Specific)

Uber H3 hexagonal grid system. Resolution 0-15 (0=coarsest, 15=finest).

| Function | Description |
|----------|-------------|
| `H3_GEOMTOCELL(geom, res)` | Geometry to H3 cell index |
| `H3_XYTOCELL(x, y, res)` | Lon/lat to H3 cell index |
| `H3_LATLNGTOCELL(lat, lon, res)` | Lat/lon to H3 cell (note: lat first) |
| `H3_CELLTOBOUNDARY(h3)` | Cell boundary as POLYGON |
| `H3_CELLTOXY(h3)` | Cell centroid as WKT POINT |
| `H3_CELLTOPARENT(h3, res)` | Parent cell at resolution |
| `H3_CELLTOFIRSTCHILD(h3, res)` | First child cell |
| `H3_CELLTOLASTCHILD(h3, res)` | Last child cell |
| `H3_CELLTOCHILDN(h3, res, i)` | I-th child cell |
| `H3_CELLTOCHILDRENSIZE(h3, res)` | Child count |
| `H3_CELLTOCHILDPOS(h3, res)` | Position in ordered children |
| `H3_CHILDPOSTOCELL(i, h3, res)` | Child at position |
| `H3_GETRESOLUTION(h3)` | Resolution of index |
| `H3_ISVALID(h3)` | Validate H3 index |
| `H3_GRIDDISKN(h3, k, i)` | I-th index within distance k |
| `H3_NUMGRIDDISK(h3, k)` | Cell count at distance k |
| `H3_NUMPOLYGONTOCELLS(geom, res)` | Cell count within polygon |
| `H3_POLYGONTOCELLSN(geom, res, i)` | I-th cell within polygon |
| `H3_H3TOSTRING(h3)` | String representation |
| `H3_STRINGTOH3(str)` | H3 index from string |

## Tips

- For spatial JOINs, prefer `STXY_DWITHIN` over distance comparison (uses spatial index)
- Use `STXY_*` over `ST_*` when you have separate lon/lat columns
- Always use solution `1` (Haversine) for geographic distance unless you need higher accuracy (then `2`)
- Use CTEs to separate window functions from geospatial aggregates
- GEOSPATIAL INDEX required for optimal performance on geometry columns
