# Time-Series Query Examples

## Daily trend
```sql
SELECT DATE_TRUNC('day', created_at) as day,
  COUNT(*) as order_count,
  SUM(total) as daily_revenue
FROM orders
WHERE created_at >= NOW() - INTERVAL '30 DAYS'
GROUP BY day
ORDER BY day;
```

## Hourly bucketing
```sql
SELECT DATETIME_BUCKET(timestamp, INTERVAL '1 HOUR') as hour_bucket,
  AVG(temperature) as avg_temp,
  MAX(temperature) as max_temp,
  MIN(temperature) as min_temp
FROM sensor_readings
WHERE timestamp >= '2024-01-01'
GROUP BY hour_bucket
ORDER BY hour_bucket;
```

## 7-day moving average
```sql
SELECT date, daily_sales,
  AVG(daily_sales) OVER (
    ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as moving_avg_7d
FROM (
  SELECT DATE_TRUNC('day', created_at) as date,
    SUM(amount) as daily_sales
  FROM transactions
  GROUP BY date
) daily
ORDER BY date;
```

## Period-over-period comparison
```sql
SELECT
  DATE_TRUNC('month', created_at) as month,
  SUM(revenue) as current_revenue,
  LAG(SUM(revenue)) OVER (ORDER BY DATE_TRUNC('month', created_at)) as prev_month,
  ROUND(
    (SUM(revenue) - LAG(SUM(revenue)) OVER (ORDER BY DATE_TRUNC('month', created_at)))
    * 100.0 / LAG(SUM(revenue)) OVER (ORDER BY DATE_TRUNC('month', created_at)),
    2
  ) as pct_change
FROM orders
GROUP BY month
ORDER BY month;
```

## Peak hours analysis
```sql
SELECT EXTRACT(HOUR FROM created_at) as hour_of_day,
  COUNT(*) as request_count,
  AVG(response_time_ms) as avg_response_ms
FROM api_logs
WHERE created_at >= NOW() - INTERVAL '7 DAYS'
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

## Latest record per group
```sql
SELECT * FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY timestamp DESC) as rn
  FROM sensor_data
) ranked
WHERE rn = 1;
```
