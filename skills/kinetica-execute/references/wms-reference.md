# Kinetica WMS Reference

The `/wms` endpoint renders map tiles as PNG images. It replaces the deprecated
`visualize_image_heatmap` and `visualize_image_classbreak` endpoints.
Official docs: [WMS REST](https://docs.kinetica.com/7.2/api/rest/wms_rest/)

**Response:** Raw PNG bytes (Buffer in Node.js, bytes in Python). Write directly to file — no base64 decoding needed.

---

## Request Basics

| Request Type | Description |
|--------------|-------------|
| `GetMap` | Render a map tile (primary use case) |
| `GetCapabilities` | Return service metadata (XML) |

- **VERSION:** Only `1.1.1` is supported
- **FORMAT:** Only `image/png` is supported
- **JOB_USER_DATA:** User-defined request tracking tag (any string without `&`)

---

## Common Parameters

| Parameter | Required | Default | Allowed Values | Description |
|-----------|----------|---------|----------------|-------------|
| `REQUEST` | Yes | — | `GetMap`, `GetCapabilities` | Request type |
| `SRS` | Yes | — | See SRS values below | Spatial reference system |
| `LAYERS` | Yes | — | `[schema.]table` (comma-separated for multi-layer) | Source table(s) |
| `BBOX` | Yes | — | `minX,minY,maxX,maxY` | Bounding box |
| `WIDTH` | Yes | — | 64–8192 | Image width in pixels |
| `HEIGHT` | Yes | — | 64–8192 | Image height in pixels |
| `STYLES` | No | `raster` | `heatmap`, `raster`, `cb_raster`, `contour`, `labels`, `isochrones` | Rendering style |
| `FORMAT` | No | `image/png` | `image/png` | Output format |
| `TRANSPARENT` | No | **TRUE** | `TRUE`, `FALSE` | Background transparency |
| `X_ATTR` | No | `x` | Numeric column or expression | X/longitude column |
| `Y_ATTR` | No | `y` | Numeric column or expression | Y/latitude column |
| `GEO_ATTR` | No | — | WKT geometry column or expression | Geometry column (mutually exclusive with `X_ATTR`/`Y_ATTR`) |
| `SYMBOL_ATTR` | No | `SYMBOLCODE` | String column or expression (supports `if()`, `case()`) | Symbol attribute column |
| `VERSION` | No | `1.1.1` | `1.1.1` | WMS version (only 1.1.1 supported) |
| `JOB_USER_DATA` | No | — | Any string (no `&`) | User-defined tracking tag |

### Supported SRS Values

All 9 supported spatial reference system identifiers:

| SRS Value | Projection |
|-----------|------------|
| `PLATE_CARREE` | Equirectangular |
| `EPSG:4326` | WGS 84 (same as PLATE_CARREE) |
| `WEB_MERCATOR` | Web Mercator |
| `900913` | Web Mercator (legacy) |
| `EPSG:900913` | Web Mercator (legacy) |
| `102100` | Web Mercator (Esri) |
| `EPSG:102100` | Web Mercator (Esri) |
| `3857` | Web Mercator (standard) |
| `EPSG:3857` | Web Mercator (standard) |

### Coordinate Attribute Rules

- **`X_ATTR`/`Y_ATTR`** and **`GEO_ATTR`** are mutually exclusive — use one or the other
- `GEO_ATTR` references a WKT geometry column; `X_ATTR`/`Y_ATTR` reference separate lon/lat numeric columns
- Defaults: `X_ATTR=x`, `Y_ATTR=y`

---

## Color Format

Colors use hex notation without a `#` prefix:

| Format | Example | Description |
|--------|---------|-------------|
| `RRGGBB` | `FF0000` | Red (opaque) |
| `AARRGGBB` | `B3FF0000` | Semi-transparent red (AA = alpha: `00`=fully transparent, `FF`=fully opaque) |
| `-1` | `-1` | No fill (used in SHAPEFILLCOLORS, label colors, etc.) |

---

## Rendering Styles

### heatmap

Renders intensity-weighted heat visualization.

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `VAL_ATTR` | — | Column, expression, or aggregation (see below) | Value for intensity weighting |
| `BLUR_RADIUS` | `5` | 1–32 | Gaussian blur radius |
| `COLORMAP` | `jet` | See [Available Colormaps](#available-colormaps) | Predefined color scheme |
| `GRADIENT_START_COLOR` | `000000` | `RRGGBB` or `AARRGGBB` | Custom gradient start (overrides `COLORMAP`) |
| `GRADIENT_END_COLOR` | `000000` | `RRGGBB` or `AARRGGBB` | Custom gradient end (overrides `COLORMAP`) |
| `REVERSE_COLORMAP` | `FALSE` | `TRUE`, `FALSE` | Reverse colormap direction |

#### VAL_ATTR Expressions

`VAL_ATTR` supports aggregation functions and a `log()` wrapper:

| Expression | Behavior |
|------------|----------|
| `count(column)` | Count of records per pixel |
| `sum(column)` | Sum of values per pixel |
| `avg(column)` / `mean(column)` | Average of values per pixel |
| `min(column)` | Minimum value per pixel |
| `max(column)` | Maximum value per pixel |
| `log(sum(column))` | Log-scaled sum |
| `log(avg(column))` | Log-scaled average |
| `log(min(column))` | Log-scaled minimum |
| `log(max(column))` | Log-scaled maximum |

**Colormap priority:** `COLORMAP` > `GRADIENT_START_COLOR`/`GRADIENT_END_COLOR` > default `jet`
If both `COLORMAP` and `GRADIENT_*` colors are specified, `COLORMAP` takes precedence.

---

### raster

Basic point, shape, and track rendering.

#### Point Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `DOPOINTS` | `TRUE` | `TRUE`, `FALSE` | Render points |
| `POINTCOLORS` | `FF0000` | `RRGGBB` or `AARRGGBB` | Point color |
| `POINTSIZES` | `3` | 0–20 | Point size in pixels |
| `POINTSHAPES` | — | `none`, `circle`, `dash`, `diamond`, `dot`, `hollowcircle`, `hollowdiamond`, `hollowsquare`, `hollowsquarewithplus`, `pipe`, `plus`, `square` | Point shape |
| `POINTOFFSET_X` | `0` | Signed integer | Horizontal point offset |
| `POINTOFFSET_Y` | `0` | Signed integer | Vertical point offset |

#### Shape Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `DOSHAPES` | `TRUE` | `TRUE`, `FALSE` | Render shapes (WKT polygons/lines) |
| `SHAPEFILLCOLORS` | `-1` | `RRGGBB`, `AARRGGBB`, or `-1` (no fill) | Polygon fill color |
| `SHAPELINECOLORS` | `FFFF00` | `RRGGBB` or `AARRGGBB` | Shape outline color |
| `SHAPELINEWIDTHS` | `3` | 0–20 | Shape line width |
| `SHAPELINEPATTERNS` | `0` | Unsigned 64-bit hex integer | Dash pattern (bits control on/off segments) |
| `SHAPELINEPATTERNLENS` | `0` | 1–64 | Number of pattern bits to use |
| `ANTIALIASING` | `FALSE` | `TRUE`, `FALSE` | Smooth WKT outlines |
| `HASHLINECOLORS` | (SHAPELINECOLOR) | `RRGGBB`, `AARRGGBB`, or `-1` | Hash line color |
| `HASHLINEWIDTHS` | `3` | Positive integer | Hash line width |
| `HASHLINEINTERVALS` | `20` | Positive integer | Distance between hash lines |
| `HASHLINELENS` | `0` | Non-negative integer | Hash line length |
| `HASHLINEANGLES` | `0` | Any real number | Hash line rotation angle |

#### Track Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `DOTRACKS` | `TRUE` | `TRUE`, `FALSE` | Render tracks |
| `TRACK_ID_ATTR` | `TRACKID` | String or date column/expression | Track ID column |
| `TRACK_ORDER_ATTR` | `TIMESTAMP` | Numeric or date column/expression | Track ordering column |
| `TRACKHEADCOLORS` | `FFFFFF` | `RRGGBB` or `AARRGGBB` | Track head marker color |
| `TRACKHEADSHAPES` | `circle` | Same as POINTSHAPES | Track head shape |
| `TRACKHEADSIZES` | `10` | 0–20 | Track head size |
| `TRACKLINECOLORS` | `00FF00` | `RRGGBB` or `AARRGGBB` | Track line color |
| `TRACKLINEWIDTHS` | `3` | 0–20 | Track line width |
| `TRACKMARKERCOLORS` | `0000FF` | `RRGGBB` or `AARRGGBB` | Track point marker color |
| `TRACKMARKERSHAPES` | `none` | Same as POINTSHAPES, or `SYMBOLCODE` | Track marker shape |
| `TRACKMARKERSIZES` | `2` | 0–20 | Track point marker size |

#### Symbol & Advanced Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `DOSYMBOLOGY` | `FALSE` | `TRUE`, `FALSE` | Enable symbol rendering |
| `SYMBOLROTATIONS` | — | Numeric column/expression | Symbol rotation angle column |
| `ORDER_LAYERS` | — | `true`, `false` | Render layers in specified order |
| `WORLDLAYERS` | — | Comma-separated table names | Additional world context layers |

---

### cb_raster

Class-break rendering — assigns colors/sizes/shapes per classified value ranges.

**Inherits all raster parameters** except `SYMBOLROTATIONS` and `ORDER_LAYERS`.

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `CB_ATTR` | **(required)** | Column or expression | Classification attribute |
| `CB_VALS` | **(required)** | Values or ranges (e.g., `0:5,5:10,<other>`) | Class break values |
| `CB_DELIMITER` | `,` | Any character | Separator for class values |
| `ORDER_CLASSES` | `FALSE` | `TRUE`, `FALSE` | Render classes in specified order |
| `USE_POINT_RENDERER` | `FALSE` | `TRUE`, `FALSE` | Render points larger than 1px |
| `ALPHA_BLENDING` | `FALSE` | `TRUE`, `FALSE` | Enable alpha blending |
| `CB_POINTCOLOR_ATTR` | — | Column/expression | Class break attribute for point color |
| `CB_POINTCOLOR_VALS` | — | Values/ranges | Point color value ranges |
| `CB_POINTSIZE_ATTR` | — | Column/expression | Class break attribute for point size |
| `CB_POINTSIZE_VALS` | — | Values/ranges | Point size value ranges |
| `CB_POINTSHAPE_ATTR` | — | Column/expression | Class break attribute for point shape |
| `CB_POINTSHAPE_VALS` | — | Values/ranges | Point shape value ranges |
| `CB_POINTALPHA_ATTR` | — | Column/expression | Class break attribute for point alpha |
| `CB_POINTALPHA_VALS` | — | Values/ranges | Alpha value ranges |
| `CB_POINTALPHAS` | — | 0–255 per class | Alpha opacity values (0=transparent, 255=opaque) |

#### The `<other>` Keyword

Use `<other>` in `CB_VALS` as a catch-all class for values not matching any defined range:

```
CB_VALS=A,B,C,<other>
POINTCOLORS=FF0000,00FF00,0000FF,888888
```

Records with `CB_ATTR` values other than A, B, or C render in gray (`888888`).

---

### contour

Isoline rendering via inverse-distance-power gridding.

**Constraint:** `X_ATTR`, `Y_ATTR`, and `VAL_ATTR` must be direct column references — no expressions.

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `GRIDDING_METHOD` | **(required)** | `INV_DST_POW` | Gridding algorithm |
| `VAL_ATTR` | **(required)** | Direct column reference (int, double, float, long, decimal) | Value column for isolines |
| `NUM_LEVELS` | `10` | >= 10 | Number of isolines |
| `MIN_LEVEL` | `-1` | Any number | Minimum isoline value (`-1` = auto) |
| `MAX_LEVEL` | `-1` | Any number | Maximum isoline value (`-1` = auto) |
| `ADJUST_LEVELS` | `true` | `true`, `false` | Auto-compute min/max from viewport |
| `COLORMAP` | `jet` | See [Available Colormaps](#available-colormaps) | Color scheme for contours |
| `COLOR` | `FF000000` | `RRGGBB` or `AARRGGBB` | Single isoline color |
| `BG_COLOR` | `00000000` | `RRGGBB` or `AARRGGBB` | Background color (default: transparent) |
| `LINE_SIZE` | `2` | Pixels | Isoline thickness |
| `GRID_SIZE` | `100` | Integer | X-axis grid subdivisions |
| `SEARCH_RADIUS` | `10` | % of image/grid | Neighborhood influence percentage |
| `SMOOTHING_FACTOR` | `0.000001` | 0–1 | Point contribution smoothing |
| `RENDER_OUTPUT_GRID` | `false` | `true`, `false` | Show flooded-contour fill |
| `ADD_LABELS` | `false` | `true`, `false` | Add value labels to isolines |
| `LABELS_FONT_SIZE` | `12` | 4–48 | Label font size |
| `LABELS_FONT_FAMILY` | `Sans` | System font names | Label font family |
| `ADJUST_GRID` | `false` | `true`, `false` | Auto-vary grid size |
| `ADJUST_GRID_SIZE` | `20` | Integer | Grid size adjustment factor |
| `MIN_GRID_SIZE` | `10` | Cells | Lower grid size limit |
| `MAX_GRID_SIZE` | `500` | Cells | Upper grid size limit |
| `MAX_SEARCH_CELLS` | `100` | Cells | Max cells in neighborhood search |
| `LABELS_INTERLEVEL_SEPARATION` | `25` | 0–50 (% of window) | Min spacing between labels of different levels |
| `LABELS_INTRALEVEL_SEPARATION` | `4` | 1–8 (multiples of font size) | Min spacing between labels of same level |
| `LABELS_MAX_ANGLE` | `60` | 0–90 degrees | Max label rotation angle |
| `LABELS_SEARCH_WINDOW` | `4` | 1–8 (multiples of font size) | Label placement search radius |
| `TEXT_COLOR` | `FF000000` | `RRGGBB` or `AARRGGBB` | Label text color |

---

### labels

Text label overlay rendering. **Labels and WKT shapes cannot render in the same WMS call.**

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `LABEL_LAYER` | **(required)** | `[schema.]table` | Source table for labels |
| `LABEL_TEXT_STRING` | (no text) | Printable characters, column name, or expression | Label text content |
| `LABEL_X_ATTR` | `x` | Numeric column/expression | X position column |
| `LABEL_Y_ATTR` | `y` | Numeric column/expression | Y position column |
| `LABEL_FONT` | (server default) | `"Name Style(s) Size"` (e.g., `"Arial Bold 12"`) | Font specification |
| `LABEL_TEXT_COLOR` | `FF000000` | `RRGGBB`, `AARRGGBB`, or `-1` | Text color |
| `LABEL_FILL_COLOR` | `FF000000` | `RRGGBB`, `AARRGGBB`, or `-1` | Box fill color |
| `LABEL_LINE_COLOR` | `FF000000` | `RRGGBB`, `AARRGGBB`, or `-1` | Box/leader line color |
| `LABEL_LINE_WIDTH` | `1` | Integer | Line thickness |
| `LABEL_TEXT_ANGLE` | `0` | Degrees (clockwise) | Label rotation |
| `LABEL_TEXT_SCALE` | `1` | Number | Text scaling factor |
| `LABEL_DRAW_BOX` | `0` | **`0` or `1` only** | Draw box around label |
| `LABEL_DRAW_LEADER` | `0` | **`0` or `1` only** | Draw leader line to point |
| `LABEL_LEADER_X_ATTR` | — | Numeric column/expression | Leader line X termination |
| `LABEL_LEADER_Y_ATTR` | — | Numeric column/expression | Leader line Y termination |
| `LABEL_X_OFFSET` | — | Number | Horizontal label offset |
| `LABEL_Y_OFFSET` | — | Number | Vertical label offset |
| `LABEL_FILTER` | — | Boolean expression (SQL-like) | Filter which records get labels |

> **GOTCHA:** `LABEL_DRAW_BOX` and `LABEL_DRAW_LEADER` accept `0`/`1` only — `TRUE`/`FALSE` are **not valid** and will be silently ignored.

#### Expression Support

All label parameters **except** `LABEL_LAYER`, `LABEL_X_ATTR`, `LABEL_Y_ATTR`, `LABEL_LEADER_X_ATTR`, and `LABEL_LEADER_Y_ATTR` support expressions (including `if()`, `case()`, and standard SQL functions). Color expression results must resolve to 6 or 8 hex digits — 6-digit values auto-prepend alpha `FF`.

#### Font Requirement

TrueType fonts must be installed in `/usr/share/fonts` on **all** cluster nodes. A Kinetica restart is required after adding new fonts.

---

### isochrones

Renders travel-time/cost isolines from a graph solve operation. Requires an existing graph resource.

> **Cross-reference:** See [graph-functions.md](graph-functions.md) for graph creation and the `MATCH_GRAPH` isochrone solver.

#### Core Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `GRAPH_NAME` | — | Valid graph identifier | Graph resource name |
| `SOURCE_NODE` | — | Vertex identifier | Starting vertex for isochrone calculation |
| `SOLVE_TABLE` | `""` | `[schema.]table` | Table name for solve results |
| `SOLVE_DIRECTION` | — | `from_source`, `to_source` | Direction of traversal |
| `NUM_LEVELS` | `1` | Positive integer | Number of isochrone levels |
| `LEVELS_TABLE` | — | `[schema.]table` | Output table for level data |
| `MAX_SOLUTION_RADIUS` | `-1.0` | Number (`-1.0` = unrestricted) | Max search radius |
| `IS_REPLICATED` | `true` | `true`, `false` | Replicate result table |

#### Rendering Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `GENERATE_IMAGE` | `true` | `true`, `false` | Generate PNG output |
| `WIDTH` | `512` | Pixels | Image width |
| `HEIGHT` | `-1` | Pixels (`-1` = auto) | Image height |
| `PROJECTION` | — | Same as SRS values | Output projection |
| `BG_COLOR` | `00000000` | `RRGGBB` or `AARRGGBB` | Background color (default: transparent) |
| `COLOR` | `FF000000` | `RRGGBB` or `AARRGGBB` | Isoline color |
| `COLORMAP` | `jet` | See [Available Colormaps](#available-colormaps) | Color scheme |
| `COLOR_ISOLINES` | `true` | `true`, `false` | Color isolines by level |
| `LINE_SIZE` | `3` | 0–20 pixels | Isoline thickness |
| `CONCAVITY_LEVEL` | `0.5` | 0–1 (0=convex, 1=concave) | Hull concavity |

#### Grid & Search Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `GRID_SIZE` | `100` | Integer | X-axis grid subdivisions |
| `SEARCH_RADIUS` | `20` | % of image/grid | Neighborhood search percentage |
| `DATA_MIN_X` | (auto) | Number | Lower X bound |
| `DATA_MAX_X` | (auto) | Number | Upper X bound |
| `DATA_MIN_Y` | (auto) | Number | Lower Y bound |
| `DATA_MAX_Y` | (auto) | Number | Upper Y bound |

#### Label Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `ADD_LABELS` | `false` | `true`, `false` | Add value labels to isolines |
| `LABELS_FONT_FAMILY` | `Sans` | System font names | Label font family |
| `LABELS_FONT_SIZE` | `12` | 4–48 | Label font size |
| `LABELS_INTERLEVEL_SEPARATION` | `25` | 0–50 (% of window) | Min spacing between levels |
| `LABELS_INTRALEVEL_SEPARATION` | `4` | 1–8 (multiples of font size) | Min spacing within level |
| `LABELS_MAX_ANGLE` | `60` | 0–90 degrees | Max label angle |
| `LABELS_SEARCH_WINDOW` | `4` | 1–8 (multiples of font size) | Label search radius |
| `TEXT_COLOR` | `FF000000` | `RRGGBB` or `AARRGGBB` | Label text color |

#### Graph Constraint Parameters

| Parameter | Default | Allowed Values | Description |
|-----------|---------|----------------|-------------|
| `UNIFORM_WEIGHTS` | — | Number | Uniform edge weight value |
| `WEIGHTS_ON_EDGES` | — | Edge identifiers with weights | Custom edge weight assignments |
| `RESTRICTIONS` | — | Node/edge restriction identifiers | Graph traversal restrictions |
| `RESTRICTION_THRESHOLD_VALUE` | — | Number | Threshold for value-based restrictions |
| `REMOVE_PREVIOUS_RESTRICTIONS` | `false` | `true`, `false` | Clear prior restrictions |

---

## Available Colormaps

77 colormaps available for `heatmap`, `contour`, and `isochrones` styles.

### Perceptually-Uniform
`viridis` `inferno` `plasma` `magma`

### Sequential I (multi-hue)
`Blues` `BuGn` `BuPu` `GnBu` `Greens` `Greys` `Oranges` `OrRd` `PuBu` `PuBuGn` `PuRd` `Purples` `RdPu` `Reds` `YlGn` `YlGnBu` `YlOrBr` `YlOrRd`

### Sequential II (single-hue)
`afmhot` `autumn` `bone` `cool` `copper` `gist_heat` `gray` `gist_gray` `gist_yarg` `binary` `hot` `pink` `spring` `summer` `winter`

### Diverging
`BrBG` `bwr` `coolwarm` `PiYG` `PRGn` `PuOr` `RdBu` `RdGy` `RdYlBu` `RdYlGn` `Spectral` `seismic`

### Qualitative
`Accent` `Dark2` `Paired` `Pastel1` `Pastel2` `Set1` `Set2` `Set3`

### Miscellaneous
`gist_earth` `terrain` `ocean` `gist_stern` `brg` `CMRmap` `cubehelix` `gnuplot` `gnuplot2` `gist_ncar` `spectral` `nipy_spectral` `jet` `rainbow` `gist_rainbow` `hsv` `flag` `prism`

---

## Usage Notes & Gotchas

### Multi-Layer Styling

When `LAYERS` contains multiple tables, style parameters accept comma-separated values — one per layer in order:

```
LAYERS=roads,buildings
SHAPELINECOLORS=FF0000,0000FF
SHAPELINEWIDTHS=2,1
```

If fewer values than layers, defaults apply for unlisted layers.

### Labels + Shapes Conflict

Labels and WKT shapes **cannot render in the same WMS call**. To overlay labels on shapes, make two separate requests and composite the PNG images.

### Symbol Handling

1. **Upload symbols** via the `/insert/symbol` endpoint (SVG path data or raw SVG bytes)
2. **Reference symbols** by adding a `SYMBOLCODE` column (string type) to your data table
3. **Conditional symbols** via `SYMBOL_ATTR` with expressions:
   ```
   SYMBOL_ATTR=case(vendor_id,{'YCAB','NYC'},{'taxi_blue','taxi_green'},'taxi_black')
   ```
4. `TRACKMARKERSHAPES=SYMBOLCODE` renders the symbol from each record's `SYMBOLCODE` column

### GEO_ATTR vs X_ATTR/Y_ATTR

- `GEO_ATTR` references a WKT geometry column — enables shapes, lines, and polygons
- `X_ATTR`/`Y_ATTR` reference separate numeric columns — for point data only
- These are mutually exclusive; do not set both

---

## CLI Command Routing

The kinetica-execute CLI provides several `viz` commands. Each supports a different subset of WMS parameters:

| CLI Command | WMS Style | Parameter Support |
|-------------|-----------|-------------------|
| `viz heatmap` | `heatmap` | Only `VAL_ATTR`, `BLUR_RADIUS`, `COLORMAP` via flags. For `GRADIENT_*` or `REVERSE_COLORMAP`, use `viz wms` instead. |
| `viz classbreak` | `cb_raster` | Full — all uppercase WMS keys pass through JSON config. |
| `viz wms` | Any | Full — all WMS parameters pass through JSON config. **Use this for raster, contour, labels, isochrones, or advanced heatmap params.** |
| `viz isochrone` | — | Uses `db.visualize_isochrone()` SDK method, not WMS. Only supports `--source`, `--max-radius`, `--num-levels`, `--weights-on-edges`, `--restrictions`. |

### CLI Examples

```bash
# Heatmap with log-scaled values (simple — use viz heatmap)
viz heatmap sensor_data --x-col longitude --y-col latitude \
  --value-col 'log(sum(temperature))' --colormap viridis --output heatmap.png

# Heatmap with custom gradient (needs viz wms — gradient flags not on viz heatmap)
viz wms --config '{"LAYERS":"sensor_data","BBOX":"-122.5,37.7,-122.3,37.8","STYLES":"heatmap","X_ATTR":"longitude","Y_ATTR":"latitude","VAL_ATTR":"temperature","GRADIENT_START_COLOR":"0000FF","GRADIENT_END_COLOR":"FF0000"}' --output gradient.png

# Class-break with <other> catch-all
viz classbreak --config '{"LAYERS":"my_table","BBOX":"-180,-90,180,90","CB_ATTR":"category","CB_VALS":"A,B,C,<other>","X_ATTR":"lon","Y_ATTR":"lat","POINTCOLORS":"FF0000,00FF00,0000FF,888888"}' --output classbreak.png

# Contour (no dedicated CLI command — use viz wms)
viz wms --config '{"LAYERS":"elevation","BBOX":"-122.5,37.7,-122.3,37.8","STYLES":"contour","X_ATTR":"longitude","Y_ATTR":"latitude","VAL_ATTR":"elevation","GRIDDING_METHOD":"INV_DST_POW","NUM_LEVELS":"15","COLORMAP":"terrain","ADD_LABELS":"true","RENDER_OUTPUT_GRID":"true"}' --output contour.png

# Raster with shapes (no dedicated CLI command — use viz wms)
viz wms --config '{"LAYERS":"parcels","BBOX":"-122.5,37.7,-122.3,37.8","STYLES":"raster","GEO_ATTR":"geom","SHAPEFILLCOLORS":"80FF0000","SHAPELINECOLORS":"FF0000","SHAPELINEWIDTHS":"2","ANTIALIASING":"TRUE"}' --output raster.png

# Labels (no dedicated CLI command — use viz wms)
viz wms --config '{"LAYERS":"cities","BBOX":"-125,32,-114,42","STYLES":"labels","LABEL_LAYER":"cities","LABEL_TEXT_STRING":"name","LABEL_X_ATTR":"longitude","LABEL_Y_ATTR":"latitude","LABEL_FONT":"Arial Bold 12","LABEL_TEXT_COLOR":"000000","LABEL_DRAW_BOX":"1"}' --output labels.png
```

> **Routing rule:** Use `viz heatmap` for simple heatmaps (value, blur, colormap). For everything else — contour, raster, labels, isochrones via WMS, or heatmaps with gradients — use `viz wms` with a full JSON config.

---

## Code Examples

### Node.js

The Node.js SDK provides `db.wms_request(params)` which returns a raw PNG Buffer.

```javascript
// Heatmap with log-scaled values
const buffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:4326',
  LAYERS: 'sensor_data',
  BBOX: '-122.5,37.7,-122.3,37.8',
  WIDTH: 800,
  HEIGHT: 600,
  STYLES: 'heatmap',
  X_ATTR: 'longitude',
  Y_ATTR: 'latitude',
  VAL_ATTR: 'log(sum(temperature))',
  BLUR_RADIUS: 5,
  COLORMAP: 'viridis',
});
require('fs').writeFileSync('heatmap.png', buffer);

// Class-break with <other> catch-all
const cbBuffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:4326',
  LAYERS: 'my_table',
  BBOX: '-180,-90,180,90',
  WIDTH: 800,
  HEIGHT: 600,
  STYLES: 'cb_raster',
  X_ATTR: 'lon',
  Y_ATTR: 'lat',
  CB_ATTR: 'category',
  CB_VALS: 'A,B,C,<other>',
  POINTCOLORS: 'FF0000,00FF00,0000FF,888888',
});

// Raster with shapes
const rasterBuffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:3857',
  LAYERS: 'parcels',
  BBOX: '-13630000,4544000,-13620000,4554000',
  WIDTH: 800,
  HEIGHT: 600,
  STYLES: 'raster',
  GEO_ATTR: 'geom',
  SHAPEFILLCOLORS: '80FF0000',
  SHAPELINECOLORS: 'FF0000',
  SHAPELINEWIDTHS: 2,
  ANTIALIASING: 'TRUE',
});

// Contour with labels
const contourBuffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:4326',
  LAYERS: 'elevation_data',
  BBOX: '-122.5,37.7,-122.3,37.8',
  WIDTH: 800,
  HEIGHT: 600,
  STYLES: 'contour',
  X_ATTR: 'longitude',
  Y_ATTR: 'latitude',
  VAL_ATTR: 'elevation',
  GRIDDING_METHOD: 'INV_DST_POW',
  NUM_LEVELS: 15,
  COLORMAP: 'terrain',
  ADD_LABELS: 'true',
  LABELS_FONT_SIZE: 10,
  RENDER_OUTPUT_GRID: 'true',
});

// Isochrone from graph
const isoBuffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:4326',
  LAYERS: 'road_network',
  BBOX: '-122.5,37.7,-122.3,37.8',
  WIDTH: 800,
  HEIGHT: 600,
  STYLES: 'isochrones',
  GRAPH_NAME: 'road_graph',
  SOURCE_NODE: 'POINT(-122.4 37.75)',
  SOLVE_DIRECTION: 'from_source',
  NUM_LEVELS: 5,
  COLORMAP: 'RdYlGn',
  CONCAVITY_LEVEL: 0.3,
  ADD_LABELS: 'true',
});
```

### Python

```python
import urllib.parse
import urllib.request

# Heatmap with log-scaled values
params = {
    'REQUEST': 'GetMap',
    'FORMAT': 'image/png',
    'SRS': 'EPSG:4326',
    'LAYERS': 'sensor_data',
    'BBOX': '-122.5,37.7,-122.3,37.8',
    'WIDTH': '800',
    'HEIGHT': '600',
    'STYLES': 'heatmap',
    'X_ATTR': 'longitude',
    'Y_ATTR': 'latitude',
    'VAL_ATTR': 'log(sum(temperature))',
    'BLUR_RADIUS': '5',
    'COLORMAP': 'viridis',
}
url = f"{db.host}/wms?{urllib.parse.urlencode(params)}"
req = urllib.request.Request(url)
# Add auth header (Bearer or Basic) as needed
with urllib.request.urlopen(req) as resp:
    png_bytes = resp.read()
with open('heatmap.png', 'wb') as f:
    f.write(png_bytes)

# Class-break with <other> catch-all
params = {
    'REQUEST': 'GetMap',
    'FORMAT': 'image/png',
    'SRS': 'EPSG:4326',
    'LAYERS': 'my_table',
    'BBOX': '-180,-90,180,90',
    'WIDTH': '800',
    'HEIGHT': '600',
    'STYLES': 'cb_raster',
    'X_ATTR': 'lon',
    'Y_ATTR': 'lat',
    'CB_ATTR': 'category',
    'CB_VALS': 'A,B,C,<other>',
    'POINTCOLORS': 'FF0000,00FF00,0000FF,888888',
}
url = f"{db.host}/wms?{urllib.parse.urlencode(params)}"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as resp:
    png_bytes = resp.read()
with open('classbreak.png', 'wb') as f:
    f.write(png_bytes)

# Contour with labels
params = {
    'REQUEST': 'GetMap',
    'FORMAT': 'image/png',
    'SRS': 'EPSG:4326',
    'LAYERS': 'elevation_data',
    'BBOX': '-122.5,37.7,-122.3,37.8',
    'WIDTH': '800',
    'HEIGHT': '600',
    'STYLES': 'contour',
    'X_ATTR': 'longitude',
    'Y_ATTR': 'latitude',
    'VAL_ATTR': 'elevation',
    'GRIDDING_METHOD': 'INV_DST_POW',
    'NUM_LEVELS': '15',
    'COLORMAP': 'terrain',
    'ADD_LABELS': 'true',
    'LABELS_FONT_SIZE': '10',
    'RENDER_OUTPUT_GRID': 'true',
}
url = f"{db.host}/wms?{urllib.parse.urlencode(params)}"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as resp:
    png_bytes = resp.read()
with open('contour.png', 'wb') as f:
    f.write(png_bytes)

# Isochrone from graph
params = {
    'REQUEST': 'GetMap',
    'FORMAT': 'image/png',
    'SRS': 'EPSG:4326',
    'LAYERS': 'road_network',
    'BBOX': '-122.5,37.7,-122.3,37.8',
    'WIDTH': '800',
    'HEIGHT': '600',
    'STYLES': 'isochrones',
    'GRAPH_NAME': 'road_graph',
    'SOURCE_NODE': 'POINT(-122.4 37.75)',
    'SOLVE_DIRECTION': 'from_source',
    'NUM_LEVELS': '5',
    'COLORMAP': 'RdYlGn',
    'CONCAVITY_LEVEL': '0.3',
    'ADD_LABELS': 'true',
}
url = f"{db.host}/wms?{urllib.parse.urlencode(params)}"
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as resp:
    png_bytes = resp.read()
with open('isochrone.png', 'wb') as f:
    f.write(png_bytes)
```
