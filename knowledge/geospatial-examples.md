# Geospatial Query Examples

## Find points within radius
```sql
-- All stores within 5km of a location
SELECT name, address,
  GEODIST(latitude, longitude, 40.7128, -74.0060) as distance_m
FROM stores
WHERE GEODIST(latitude, longitude, 40.7128, -74.0060) < 5000
ORDER BY distance_m;
```

## Point-in-polygon containment
```sql
-- Which delivery zone contains this address?
SELECT zone_name, zone_type
FROM delivery_zones
WHERE ST_CONTAINS(geom, ST_GEOMFROMTEXT('POINT(-73.9857 40.7484)'));
```

## Spatial JOIN
```sql
-- Count customers per sales territory
SELECT t.territory_name, COUNT(c.id) as customer_count
FROM territories t
JOIN customers c ON ST_CONTAINS(t.geom, ST_MAKEPOINT(c.longitude, c.latitude))
GROUP BY t.territory_name
ORDER BY customer_count DESC;
```

## Nearest neighbor
```sql
-- Find 5 nearest hospitals to a location
SELECT name, address,
  GEODIST(lat, lon, 34.0522, -118.2437) as distance_m
FROM hospitals
ORDER BY distance_m
LIMIT 5;
```

## Buffer / radius search with geometry
```sql
-- All incidents within 1km buffer of a pipeline
SELECT i.incident_type, i.severity
FROM incidents i
JOIN pipelines p ON ST_DWITHIN(i.geom, p.geom, 1000)
WHERE p.pipeline_id = 'PL-001';
```

## Area calculations
```sql
-- Largest parcels by area
SELECT parcel_id, owner_name,
  ST_AREA(geom) as area_sq_m
FROM parcels
ORDER BY area_sq_m DESC
LIMIT 10;
```
