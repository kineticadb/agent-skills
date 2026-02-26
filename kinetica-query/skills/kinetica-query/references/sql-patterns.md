# SQL Query Patterns

Use these with `toolbelt_sql` for common analytical queries.

## Aggregation
```sql
-- Total by category
SELECT category, SUM(amount) as total
FROM transactions
GROUP BY category
ORDER BY total DESC;

-- Top N items
SELECT product_name, revenue
FROM products
ORDER BY revenue DESC
LIMIT 10;

-- Percentage of total
SELECT region,
  SUM(sales) as region_sales,
  ROUND(SUM(sales) * 100.0 / (SELECT SUM(sales) FROM orders), 2) as pct
FROM orders
GROUP BY region;
```

## Filtering
```sql
-- Date range
SELECT * FROM events
WHERE event_date BETWEEN '2024-01-01' AND '2024-03-31';

-- Multi-value filter
SELECT * FROM orders
WHERE status IN ('pending', 'processing');

-- Pattern matching
SELECT * FROM customers
WHERE email LIKE '%@company.com';
```

## JOINs
```sql
-- Inner join
SELECT o.order_id, c.name, o.total
FROM orders o
JOIN customers c ON o.customer_id = c.id;

-- Left join with aggregation
SELECT c.name, COUNT(o.id) as order_count
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;
```

## Window Functions
```sql
-- Running total
SELECT date, amount,
  SUM(amount) OVER (ORDER BY date) as running_total
FROM transactions;

-- Rank within group
SELECT department, name, salary,
  RANK() OVER (PARTITION BY department ORDER BY salary DESC) as rank
FROM employees;
```
