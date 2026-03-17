# Graph Query Examples

## Complete Lifecycle: Tables → Graph → Query

```sql
-- 1. Create node/edge tables with grammar-matching column names
CREATE OR REPLACE TABLE wiki_graph_nodes (
    node  CHAR(64) NOT NULL,
    label VARCHAR[] NOT NULL,
    age   INT
);
CREATE OR REPLACE TABLE wiki_graph_edges (
    node1  CHAR(64) NOT NULL,
    node2  CHAR(64) NOT NULL,
    label  VARCHAR[] NOT NULL,
    met_time DATE
);

-- 2. Insert data with multi-label support
INSERT INTO wiki_graph_nodes(node, label, age) VALUES
('Jane',  string_to_array('FEMALE,business', ','), 29),
('Bill',  string_to_array('MALE,golf', ','), 58),
('Susan', string_to_array('FEMALE,dance', ','), 24),
('Alex',  string_to_array('MALE,chess', ','), 23),
('Tom',   string_to_array('MALE,chess', ','), 42);

INSERT INTO wiki_graph_edges(node1, node2, label, met_time) VALUES
('Jane', 'Bill',  string_to_array('Friend', ','), '1997-09-15'),
('Bill', 'Alex',  string_to_array('Family', ','), '1991-02-26'),
('Bill', 'Susan', string_to_array('Friend', ','), '2001-01-30'),
('Susan', 'Alex', string_to_array('Friend', ','), '2010-04-19'),
('Alex', 'Tom',   string_to_array('Friend', ','), '2024-10-07');

-- 3. Create directed graph with label key groupings
CREATE OR REPLACE DIRECTED GRAPH wiki_graph (
    NODES => INPUT_TABLES(
        (SELECT 'Gender' AS LABEL_KEY, string_to_array('MALE,FEMALE', ',') AS LABEL),
        (SELECT 'Interest' AS LABEL_KEY, string_to_array('golf,business,dance,chess', ',') AS LABEL),
        (SELECT * FROM wiki_graph_nodes)
    ),
    EDGES => INPUT_TABLES(
        (SELECT 'Relations' AS LABEL_KEY, string_to_array('Family,Friend', ',') AS LABEL),
        (SELECT * FROM wiki_graph_edges)
    ),
    OPTIONS => KV_PAIRS(graph_table = 'wiki_graph_table')
)
```

## Wikipedia: Friends of Friends

```sql
-- Find friends of friends of Tom (flip arrow direction since Tom has no outgoing edges)
GRAPH wiki_graph
MATCH (a:MALE WHERE (node = 'Tom'))<-[b:Friend]-(c)<-[d]-(e)
RETURN a.node AS originator, c.node AS friend, e.node AS target
```

## Variable-Length Paths

```sql
-- Find all females within 4 hops of a chess player under 40
GRAPH wiki_graph
MATCH (a:FEMALE)-[b]->{1,4}(c:chess WHERE c.age < 40)
RETURN DISTINCT a.NODE AS source, c.NODE AS target

-- Find everyone who are friends to Tom within 2 to 4 hops
GRAPH wiki_graph
MATCH (a:MALE WHERE (node = 'Tom'))<-[b:Friend]-{2,4}(e)
RETURN a.node AS source, e.node AS target
```

## Edge Attribute Filtering

```sql
-- Friends of friends of Tom who met after 1990 (force undirected)
-- KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (force_undirected, true) KI_HINT_MERGE_GRAPH_INPUTS
GRAPH wiki_graph
MATCH (a:MALE WHERE (node = 'Tom'))<-[b:Friend]-(c)<-[d WHERE (d.met_time > '1990-01-01')]-(e)
RETURN a.node AS source, e.node AS target
```

## Fuzzy Text Search on Nodes

```sql
-- Find all females whose names contain 'su' (case insensitive)
-- KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (force_undirected, true)
GRAPH wiki_graph
MATCH (a:FEMALE WHERE (LOWER(a.node) LIKE '%su%'))-[b]->(c)
RETURN a.NODE AS source, c.NODE AS target
```

## ALTER GRAPH: Add and Remove Edges

```sql
-- Add a new edge and restrict (remove) an existing one
ALTER GRAPH wiki_graph MODIFY (
    EDGES => INPUT_TABLES(
        (SELECT 'Tom' AS node1, 'Jane' AS node2, 'Family' AS label)
    ),
    RESTRICTIONS => INPUT_TABLES(
        (SELECT 'Bill' AS node1, 'Alex' AS node2)
    ),
    OPTIONS => KV_PAIRS(graph_table = 'wiki_graph_modified',
                        schema_node_labelkeys = 'false',
                        schema_edge_labelkeys = 'false')
)
```

---

## Banking: Transaction Chain Analysis

```sql
-- Create banking graph from vertex/edge tables with typed properties
CREATE OR REPLACE DIRECTED GRAPH expero.banking_graph (
    NODES => INPUT_TABLES(
        (SELECT id AS NODE, label AS LABEL,
         "banking_transaction:amount" AS banking_transaction_amount,
         "wire_message:risk_score" AS wire_message_risk_score,
         "party:risk_score" AS party_risk_score,
         "party:party_name" AS party_name,
         "bank:bank_name" AS bank_name,
         "bank:risk_score" AS bank_risk_score
         FROM expero.vertexes)
    ),
    EDGES => INPUT_TABLES(
        (SELECT id AS ID, source_name AS NODE1, target_name AS NODE2, label AS LABEL
         FROM expero.edges)
    ),
    OPTIONS => KV_PAIRS(is_partitioned = 'false')
)
```

## Banking: Wire Transfers with Risk Scores

```sql
GRAPH expero.banking_graph
MATCH (a:bank WHERE (a.NODE = 'd8d3cb99-0e3b-45b4-8221-79e8425065f3'))
      -[ab:performed]->(b:wire_message)-[bc:is_for_transaction]->(c:banking_transaction)
RETURN a.bank_name AS bank, b.NODE AS wire, ab.LABEL AS ablabel,
       c.NODE AS transaction, c.banking_transaction_amount, b.wire_message_risk_score
```

## Banking: Aggregation via GRAPH_TABLE()

```sql
-- Aggregate wire transfers sorted by total amount
SELECT wire, risk, ROUND(SUM(amount), 0) AS total
FROM GRAPH_TABLE(
    GRAPH expero.banking_graph
    MATCH (a:bank WHERE (a.bank_name = 'Harvey Group'))
          -[ab:performed]->(b:wire_message)
          -[bc:is_for_transaction]->(c:banking_transaction)
    RETURN a.NODE AS bank, b.NODE AS wire,
           c.banking_transaction_amount AS amount,
           b.wire_message_risk_score AS risk
)
GROUP BY 1, 2 ORDER BY 3 DESC
```

## Banking: Multi-Hop with Risk Filtering

```sql
-- High-risk wire transfers → transactions → internal accounts → people → devices
GRAPH expero.banking_graph
MATCH (a:bank WHERE (a.NODE = 'd8d3cb99-0e3b-45b4-8221-79e8425065f3'))
      -[ab:performed]->(b:wire_message WHERE b.wire_message_risk_score > 20)
      -[bc:is_for_transaction]->(c:banking_transaction)
      -[d:involved]->(e:internal_account)<-[f:manages]-(g:party)<-[h]-(i)-[]->(j)
RETURN DISTINCT g.party_name AS person, g.party_risk_score AS risk_score,
       c.banking_transaction_amount, j.NODE AS device_id
```

## Banking: Aggregated Suspicious Activity

```sql
-- High-risk banks: aggregate transactions per person with device count
SELECT person, bank, COUNT(DISTINCT device_id) AS device_count,
       MAX(risk_score) AS max_risk_score, ROUND(SUM(amount), 2) AS total_transaction
FROM GRAPH_TABLE(
    GRAPH expero.banking_graph
    MATCH (a:bank WHERE (a.bank_risk_score > 95))
          -[ab:performed]->(b:wire_message WHERE b.wire_message_risk_score > 20)
          -[bc:is_for_transaction]->(c:banking_transaction)
          -[d:involved]->(e:internal_account)<-[f:manages]-(g:party)<-[h]-(i)-[]->(j)
    RETURN DISTINCT g.party_name AS person, a.bank_name AS bank,
           g.party_risk_score AS risk_score,
           c.banking_transaction_amount AS amount, j.NODE AS device_id
)
GROUP BY 1, 2 ORDER BY 4 DESC
```

## Banking: LIKE Search on Bank Names

```sql
-- Find transactions at banks with names matching 'ernser'
GRAPH expero.banking_graph
MATCH (a:bank WHERE (LOWER(a.bank_name) LIKE '%ernser%'))
      -[ab:performed]->(b:wire_message)-[bc:is_for_transaction]->(c:banking_transaction)
RETURN a.bank_name AS bank, b.NODE AS wire,
       c.banking_transaction_amount, b.wire_message_risk_score
```

---

## Social Network: Bluesky

```sql
-- Create user/post bipartite graph
CREATE OR REPLACE TABLE bluesky1_nodes (
    node CHAR(64) NOT NULL,
    label VARCHAR[] NOT NULL,
    user_text STRING NOT NULL,
    user_age INT NOT NULL
);
CREATE OR REPLACE TABLE bluesky1_edges (
    node1 CHAR(64) NOT NULL,
    node2 CHAR(64) NOT NULL,
    label CHAR(64) NOT NULL
);

INSERT INTO bluesky1_nodes(node, label, user_text, user_age) VALUES
('kaan', string_to_array('user', ','), 'I am a good programmer', 58),
('tan',  string_to_array('user', ','), 'I am a good manager', 28),
('post1', string_to_array('post', ','), 'Kinetica is a hybrid DB', 15),
('post2', string_to_array('post', ','), 'Kinetica is a distributed DB', 24);

INSERT INTO bluesky1_edges(node1, node2, label) VALUES
('kaan', 'post1', 'posted'),
('kaan', 'post2', 'liked'),
('tan',  'post1', 'liked'),
('tan',  'post2', 'posted');

CREATE OR REPLACE GRAPH bluesky (
    NODES => INPUT_TABLES((SELECT * FROM bluesky1_nodes)),
    EDGES => INPUT_TABLES((SELECT * FROM bluesky1_edges)),
    OPTIONS => KV_PAIRS(label_delimiter = ':',
                        graph_table = 'bluesky1_graph_table',
                        schema_edge_labelkeys = 'false',
                        schema_node_labelkeys = 'false')
)
```

## Bluesky: Mutual Likes

```sql
-- Mutual likes: who likes Tan back?
GRAPH bluesky
MATCH (a:user WHERE (a.NODE = 'tan'))-[ab:liked]-(b:post)
      -[bc:posted]-(c:user)-[cd:liked]-(d:post)
      -[de:posted]-(e:user WHERE (e.NODE = 'tan'))
RETURN DISTINCT c.NODE AS poster, c.user_text AS info
```

## Bluesky: Text Search in Traversal

```sql
-- Text search in traversal: filter for posts containing 'distributed'
GRAPH bluesky
MATCH (a:user WHERE (a.NODE = 'tan'))-[ab:liked]-(b:post)
      -[bc:posted]-(c:user)-[cd:liked]-
      (d:post WHERE (CONTAINS('distributed', d.user_text) = 1))
      -[de:posted]-(e:user WHERE (e.NODE = 'tan'))
RETURN DISTINCT c.NODE AS poster, c.user_text AS poster_text, d.user_text AS original
```

## Bluesky: Age Group Analysis via GRAPH_TABLE()

```sql
-- Age group analysis via GRAPH_TABLE()
-- KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (multi_paths, true)
SELECT age_group, FLOAT(SUM(total)) / COUNT(og) AS mean_age_back FROM (
    SELECT CASE
        WHEN age < 30 THEN 'lessthan_30'
        WHEN age BETWEEN 30 AND 40 THEN 'between_30_40'
        WHEN age BETWEEN 41 AND 50 THEN 'between_40_50'
        ELSE 'olderthan_50'
    END AS age_group, originator AS og, COUNT(*) AS total
    FROM GRAPH_TABLE(
        MATCH (a:user)-[ab:liked]-(b:post)-[bc:posted]-(c:user)
              -[cd:liked]-(d:post)-[de:posted]-(e:user)
        WHERE e.NODE = a.NODE
        RETURN DISTINCT a.NODE AS originator, a.user_age AS age,
               d.user_age AS post_age
    )
    GROUP BY age_group, og
)
GROUP BY age_group
```

## Bluesky: Mean Engagement

```sql
-- Mean engagement across all users
-- KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (multi_paths, true)
SELECT FLOAT(SUM(total)) / COUNT(user) AS mean_like_back FROM (
    SELECT originator AS user, COUNT(*) AS total
    FROM GRAPH_TABLE(
        MATCH (a:user)-[ab:liked]-(b:post)-[bc:posted]-(c:user)
              -[cd:liked]-(d:post)-[de:posted]-(e:user)
        WHERE e.NODE = a.NODE
        RETURN DISTINCT a.NODE AS originator, d.user_age AS post_age
    )
    GROUP BY 1
)
```

---

## Knowledge Graph (GraphRAG): BBC News

```sql
-- Create knowledge graph from extracted entities
CREATE TABLE news_nodes (
    node CHAR(64),
    label VARCHAR[]
);
INSERT INTO news_nodes (node, label) VALUES
('US Supreme Court', ARRAY['Organization', 'Judicial']),
('Trump Administration', ARRAY['Organization', 'Executive']),
('National Guard', ARRAY['Organization', 'Military']),
('Chicago', ARRAY['Location']),
('JB Pritzker', ARRAY['Person', 'Governor']);

CREATE TABLE news_edges (
    node1 CHAR(64),
    node2 CHAR(64),
    label VARCHAR[]
);
INSERT INTO news_edges (node1, node2, label) VALUES
('US Supreme Court', 'Trump Administration', ARRAY['REJECTED_BID']),
('Trump Administration', 'National Guard', ARRAY['ATTEMPTED_DEPLOY']),
('National Guard', 'Chicago', ARRAY['TARGET_LOCATION']),
('JB Pritzker', 'Trump Administration', ARRAY['OBJECTED_TO']);

CREATE OR REPLACE DIRECTED GRAPH news_graph (
    NODES => INPUT_TABLES((SELECT node, label FROM news_nodes)),
    EDGES => INPUT_TABLES((SELECT node1, node2, label FROM news_edges)),
    OPTIONS => KV_PAIRS('graph_table' = 'news_graph_table',
                        schema_node_labelkeys = 'true',
                        schema_edge_labelkeys = 'true')
)
```

## GraphRAG: Chain of Events

```sql
-- Court → Administration → National Guard chain
GRAPH news_graph
MATCH (court:Organization)-[r1]->(admin:Organization)-[r2]->(guard:Organization)
WHERE court.node = 'US Supreme Court'
RETURN court.node AS rejecting_authority,
       admin.node AS administration,
       guard.node AS target_entity
```

## GraphRAG: SOLVE_GRAPH for All Paths

```sql
-- Find all paths between two entities
SELECT * FROM TABLE(
    SOLVE_GRAPH(
        GRAPH => 'news_graph',
        SOLVER_TYPE => 'ALLPATHS',
        SOURCE_NODES => INPUT_TABLE((SELECT 'JB Pritzker' AS node)),
        DESTINATION_NODES => INPUT_TABLE((SELECT 'National Guard' AS node)),
        OPTIONS => KV_PAIRS(uniform_weights = '1')
    )
)
```

## GraphRAG: Undirected Traversal

```sql
-- Executive actions leading to locations (force undirected)
-- KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (force_undirected, true)
GRAPH news_graph
MATCH (n1:Executive)-[e1]-(n2)-[e2]-(n3:Location)
RETURN n1.node AS executor, e1.label AS action, n2.node AS person, n3.node AS place
```

---

## Logistics: Multi-Modal Graph with Geospatial Nodes

```sql
-- Create nodes with geospatial coordinates and multi-label
CREATE OR REPLACE TABLE rearm_graph_nodes (
    node INT NOT NULL,
    wktpoint GEOMETRY NOT NULL,
    label VARCHAR[] NOT NULL
);
CREATE OR REPLACE TABLE rearm_graph_edges (
    node1 INT NOT NULL,
    node2 INT NOT NULL,
    weight FLOAT NOT NULL,
    label VARCHAR[] NOT NULL
);

INSERT INTO rearm_graph_nodes(node, wktpoint, label) VALUES
(1, ST_GEOMFROMTEXT('POINT(1 1)'), string_to_array('MAINHUB', ',')),
(2, ST_GEOMFROMTEXT('POINT(2 1)'), string_to_array('USHUB', ',')),
(3, ST_GEOMFROMTEXT('POINT(3 1)'), string_to_array('USHUB', ',')),
(4, ST_GEOMFROMTEXT('POINT(2 2)'), string_to_array('SEAHUB', ',')),
(5, ST_GEOMFROMTEXT('POINT(1 2)'), string_to_array('LANDHUB', ',')),
(6, ST_GEOMFROMTEXT('POINT(2 3)'), string_to_array('LANDHUB', ',')),
(7, ST_GEOMFROMTEXT('POINT(1 3)'), string_to_array('SPOKE', ','));

INSERT INTO rearm_graph_edges(node1, node2, weight, label) VALUES
(1, 2, 3, string_to_array('AIR', ',')),
(1, 3, 5, string_to_array('AIR', ',')),
(2, 4, 4, string_to_array('AIR', ',')),
(3, 4, 3, string_to_array('AIR', ',')),
(4, 5, 8, string_to_array('SEA', ',')),
(4, 6, 9, string_to_array('SEA', ',')),
(5, 7, 5, string_to_array('LAND', ',')),
(6, 7, 7, string_to_array('LAND', ','));
```

## Logistics: Minimum Cost Path via Cypher

```sql
-- Find minimum cost path from USHUB to SPOKE using GRAPH_TABLE + OLAP
SELECT n1_node, n2_node, n3_node, n4_node, w1 + w2 + w3 AS cost
FROM GRAPH_TABLE(
    GRAPH rearm
    MATCH (n1:USHUB)-[e1]->(n2)-[e2]->(n3)-[e3]->(n4:SPOKE)
    RETURN n1.node AS n1_node, e1.weight AS w1, n2.node AS n2_node,
           e2.weight AS w2, n3.node AS n3_node, e3.weight AS w3, n4.node AS n4_node
)
ORDER BY cost ASC LIMIT 1
```

## Logistics: Variable-Length Multi-Modal Path

```sql
-- All paths from USHUBs to SPOKE via SEAHUB in 1+ hops
GRAPH rearm
MATCH (n1:USHUB)-[e1]->(n2:SEAHUB)-[e2]->{1,30}(n3:SPOKE)
RETURN n1.node AS n1_node, n2.node AS n2_node, n3.node AS n3_node
```

## Logistics: MATCH_GRAPH Supply-Demand Optimization

```sql
-- Multi-step MSDO: 8 transports, multi-modal (AIR → SEA → LAND)
DROP TABLE IF EXISTS rearm_msdo;
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'rearm',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 1 AS SUPPLY_NODE, 101 AS SUPPLY_ID, 10 AS SUPPLY_SIZE,
         'AIR' AS SUPPLY_EDGELABEL, 1 AS SUPPLY_REGION_ID,
         8 AS SUPPLY_ORDER, 1 AS SUPPLY_MAIN,
         string_to_array('pharmacy,food', ',') AS SUPPLY_SPECS),
        -- ... more supply/demand points ...
        (SELECT 7 AS DEMAND_NODE, 70 AS DEMAND_ID, 16 AS DEMAND_SIZE,
         1 AS DEMAND_REGION_ID,
         string_to_array('pharmacy,food', ',') AS DEMAND_SPECS)
    ),
    SOLVE_METHOD => 'match_supply_demand',
    SOLUTION_TABLE => 'rearm_msdo',
    OPTIONS => KV_PAIRS(
        aggregated_output = 'true', partial_loading = 'true',
        max_supply_combinations = '10000', permute_supplies = 'false',
        round_trip = 'false', multi_step = 'true'
    )
)
```

## Logistics: Supply-Demand with Geospatial Coordinates

```sql
-- Supply/demand sites specified as lat/lon points (not node IDs)
DROP TABLE IF EXISTS rearm_msdo;
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'rearm',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 6 AS DEMAND_ID, ST_GEOMFROMTEXT('POINT(2 3)') AS DEMAND_NODE,
         4 AS DEMAND_SIZE, 1 AS DEMAND_REGION_ID),
        (SELECT 7 AS DEMAND_ID, ST_GEOMFROMTEXT('POINT(1 3)') AS DEMAND_NODE,
         8 AS DEMAND_SIZE, 1 AS DEMAND_REGION_ID),
        (SELECT 3 AS SUPPLY_ID, ST_GEOMFROMTEXT('POINT(3 1)') AS SUPPLY_NODE,
         10 AS SUPPLY_SIZE, 'k2' AS SUPPLY_EDGELABEL, 1 AS SUPPLY_REGION_ID),
        (SELECT 1 AS SUPPLY_ID, ST_GEOMFROMTEXT('POINT(1 1)') AS SUPPLY_NODE,
         10 AS SUPPLY_SIZE, 'k1' AS SUPPLY_EDGELABEL, 1 AS SUPPLY_REGION_ID)
    ),
    SOLVE_METHOD => 'match_supply_demand',
    SOLUTION_TABLE => 'rearm_msdo',
    OPTIONS => KV_PAIRS(aggregated_output = 'true', round_trip = 'false')
)
```

## Logistics: Shortest Path via SOLVE_GRAPH

```sql
-- Shortest path from MAINHUB to SPOKE using weighted edges
SELECT * FROM TABLE(
    SOLVE_GRAPH(
        GRAPH => 'rearm',
        SOLVER_TYPE => 'SHORTEST_PATH',
        SOURCE_NODES => INPUT_TABLE((SELECT 1 AS NODE)),
        DESTINATION_NODES => INPUT_TABLE((SELECT 7 AS NODE)),
        SOLUTION_TABLE => 'rearm_shortest_path'
    )
)
```

---

## Geospatial Graph with WKT Nodes

```sql
-- Create graph with geographic nodes for routing
CREATE GRAPH "supply_chain"
(
    NODES => INPUT_TABLES(
        (SELECT "location_id" AS "NODE", "type" AS "LABEL",
         ST_GEOMFROMTEXT("wkt") AS "WKTNODE"
         FROM "logistics"."locations")
    ),
    EDGES => INPUT_TABLES(
        (SELECT "origin" AS "NODE1", "destination" AS "NODE2",
         "transport_mode" AS "LABEL", "cost" AS "WEIGHT_VALUESPECIFIED"
         FROM "logistics"."routes")
    )
)
```

## Geospatial: Cypher with WKT Coordinates

```sql
-- 3-hop query from specific coordinates to SPOKE nodes
GRAPH rearm
MATCH (n1 WHERE wktpoint = ST_GEOMFROMTEXT('POINT(3 1)'))
      -[e1]->(n2)-[e2]->(n3)-[e3]->(n4:SPOKE)
RETURN n1.node AS n1_node, n2.node AS n2_node, n3.node AS n3_node, n4.node AS n4_node
```
