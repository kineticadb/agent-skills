'use strict';

/**
 * Unit tests for scripts/modules/viz.js
 *
 * 30 test cases across 5 commands: chart, heatmap, isochrone, classbreak, wms.
 * Pattern: create mock db → call cmd.fn(db, args) → assert console.log output.
 */

const fs = require('fs');
const imagePreview = require('../modules/image-preview');
const viz = require('../modules/viz');

/** Parse the JSON string passed to console.log */
function capturedOutput(logSpy) {
  const call = logSpy.mock.calls[0];
  return JSON.parse(call[0]);
}

/** Build a minimal args object matching parseArgs shape */
function makeArgs(positional = [], flags = {}) {
  return { cmd: 'test', positional, flags };
}

/** Set up die() interception: process.exit throws so async flows halt */
function mockDie() {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit');
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return exitSpy;
}

// ---------------------------------------------------------------------------
// chart
// ---------------------------------------------------------------------------

describe('chart', () => {
  it('reports image_data_length when no output path', async () => {
    const db = createMockDb({
      visualize_image_chart: vi.fn().mockResolvedValue({
        image_data: 'aGVsbG8=',
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.chart.fn(db, makeArgs(['mytable'], {
      'x-column': 'x',
      'y-column': 'y',
    }));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.image_data_length).toBe(8);
  });

  it('writes base64-decoded image to output file', async () => {
    const b64 = Buffer.from('fakepng').toString('base64');
    const db = createMockDb({
      visualize_image_chart: vi.fn().mockResolvedValue({
        image_data: b64,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    await viz.chart.fn(db, makeArgs(['mytable'], {
      'x-column': 'x',
      'y-column': 'y',
      output: '/tmp/chart.png',
    }));

    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/chart.png',
      Buffer.from(b64, 'base64')
    );
    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.output).toBe('/tmp/chart.png');
    expect(result.size_bytes).toBe(Buffer.from(b64, 'base64').length);
  });

  it('detects raw binary PNG and writes as binary', async () => {
    const rawPng = '\x89PNG\r\n\x1a\nfakedata';
    const db = createMockDb({
      visualize_image_chart: vi.fn().mockResolvedValue({
        image_data: rawPng,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    await viz.chart.fn(db, makeArgs(['mytable'], {
      'x-column': 'x',
      'y-column': 'y',
      output: '/tmp/raw.png',
    }));

    expect(writeSpy).toHaveBeenCalledWith(
      '/tmp/raw.png',
      Buffer.from(rawPng, 'binary')
    );
    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.output).toBe('/tmp/raw.png');
  });

  it('dies when table name is missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.chart.fn(db, makeArgs([], { 'x-column': 'x', 'y-column': 'y' }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when columns are missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.chart.fn(db, makeArgs(['mytable'], {}))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes style flags to visualize_image_chart', async () => {
    const db = createMockDb({
      visualize_image_chart: vi.fn().mockResolvedValue({
        image_data: 'abc',
      }),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.chart.fn(db, makeArgs(['mytable'], {
      'x-column': 'x',
      'y-column': 'y',
      'point-color': 'FF0000',
      'point-size': '5',
      'point-shape': 'diamond',
    }));

    expect(db.visualize_image_chart).toHaveBeenCalledWith(
      'mytable',
      ['x'],
      ['y'],
      0, 0, 0, 0,
      800, 600,
      'FFFFFF',
      {
        pointcolor: ['FF0000'],
        pointsize: ['5'],
        pointshape: ['diamond'],
      },
      {}
    );
  });
});

// ---------------------------------------------------------------------------
// heatmap
// ---------------------------------------------------------------------------

describe('heatmap', () => {
  it('reports size_bytes when no output path', async () => {
    const buf = Buffer.from('fakepng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.heatmap.fn(db, makeArgs(['mytable'], {
      'x-col': 'lon',
      'y-col': 'lat',
    }));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.size_bytes).toBe(buf.length);
  });

  it('writes buffer to output file', async () => {
    const buf = Buffer.from('pngdata');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    await viz.heatmap.fn(db, makeArgs(['mytable'], {
      'x-col': 'lon',
      'y-col': 'lat',
      output: '/tmp/heat.png',
    }));

    expect(writeSpy).toHaveBeenCalledWith('/tmp/heat.png', buf);
    const result = capturedOutput(logSpy);
    expect(result.output).toBe('/tmp/heat.png');
    expect(result.size_bytes).toBe(buf.length);
  });

  it('builds correct WMS params with all options', async () => {
    const buf = Buffer.from('png');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.heatmap.fn(db, makeArgs(['mytable'], {
      'x-col': 'lon',
      'y-col': 'lat',
      'value-col': 'temp',
      'blur-radius': '10',
      colormap: 'viridis',
      srs: 'EPSG:3857',
      'min-x': '-100',
      'max-x': '100',
      'min-y': '-50',
      'max-y': '50',
      width: '1024',
      height: '768',
    }));

    expect(db.wms_request).toHaveBeenCalledWith(
      expect.objectContaining({
        REQUEST: 'GetMap',
        FORMAT: 'image/png',
        LAYERS: 'mytable',
        STYLES: 'heatmap',
        SRS: 'EPSG:3857',
        BBOX: '-100.3,-50.3,100.3,50.3',
        WIDTH: 1024,
        HEIGHT: 768,
        X_ATTR: 'lon',
        Y_ATTR: 'lat',
        VALUE_ATTR: 'temp',
        BLUR_RADIUS: '10',
        COLORMAP: 'viridis',
      })
    );
  });

  it('dies when table name is missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.heatmap.fn(db, makeArgs([], { 'x-col': 'x', 'y-col': 'y' }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when columns are missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.heatmap.fn(db, makeArgs(['mytable'], {}))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// isochrone
// ---------------------------------------------------------------------------

describe('isochrone', () => {
  it('reports image_data_length when no output and no levels-table', async () => {
    const db = createMockDb({
      visualize_isochrone: vi.fn().mockResolvedValue({
        image_data: 'base64data',
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.isochrone.fn(db, makeArgs(['mygraph'], {
      source: 'nodeA',
    }));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.image_data_length).toBe(10);
  });

  it('writes image to output file', async () => {
    const b64 = Buffer.from('isochrone-png').toString('base64');
    const db = createMockDb({
      visualize_isochrone: vi.fn().mockResolvedValue({
        image_data: b64,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    await viz.isochrone.fn(db, makeArgs(['mygraph'], {
      source: 'nodeA',
      output: '/tmp/iso.png',
    }));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.output).toBe('/tmp/iso.png');
  });

  it('skips image generation when only levels-table is provided', async () => {
    const db = createMockDb({
      visualize_isochrone: vi.fn().mockResolvedValue({}),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.isochrone.fn(db, makeArgs(['mygraph'], {
      source: 'nodeA',
      'levels-table': 'my_levels',
    }));

    expect(db.visualize_isochrone).toHaveBeenCalledWith(
      'mygraph',
      'nodeA',
      100,
      [],
      [],
      4,
      false,
      'my_levels',
      {}, {}, {}, {}
    );

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.levels_table).toBe('my_levels');
  });

  it('generates image when both output and levels-table are provided', async () => {
    const b64 = Buffer.from('png').toString('base64');
    const db = createMockDb({
      visualize_isochrone: vi.fn().mockResolvedValue({
        image_data: b64,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    await viz.isochrone.fn(db, makeArgs(['mygraph'], {
      source: 'nodeA',
      'levels-table': 'my_levels',
      output: '/tmp/iso.png',
    }));

    expect(db.visualize_isochrone).toHaveBeenCalledWith(
      'mygraph',
      'nodeA',
      100,
      [],
      [],
      4,
      true,
      'my_levels',
      {}, {}, {}, {}
    );

    const result = capturedOutput(logSpy);
    expect(result.output).toBe('/tmp/iso.png');
  });

  it('dies when graph name is missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.isochrone.fn(db, makeArgs([], { source: 'nodeA' }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when source is missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.isochrone.fn(db, makeArgs(['mygraph'], {}))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// classbreak
// ---------------------------------------------------------------------------

describe('classbreak', () => {
  it('sends inline config to wms_request', async () => {
    const config = JSON.stringify({
      LAYERS: 'mytable',
      BBOX: '-180,-90,180,90',
      CB_ATTR: 'population',
    });
    const buf = Buffer.from('cbpng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.classbreak.fn(db, makeArgs([], { config }));

    expect(db.wms_request).toHaveBeenCalledWith(
      expect.objectContaining({
        LAYERS: 'mytable',
        STYLES: 'cb_raster',
        BBOX: '-180,-90,180,90',
        CB_ATTR: 'population',
      })
    );
  });

  it('reads config from @file path', async () => {
    const configObj = { LAYERS: 'locations', BBOX: '0,0,10,10' };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(configObj));
    const buf = Buffer.from('png');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.classbreak.fn(db, makeArgs([], { config: '@config.json' }));

    expect(fs.readFileSync).toHaveBeenCalledWith('config.json', 'utf8');
    expect(db.wms_request).toHaveBeenCalledWith(
      expect.objectContaining({
        LAYERS: 'locations',
      })
    );
  });

  it('dies when config is missing', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.classbreak.fn(db, makeArgs([], {}))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when config file is not found', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.classbreak.fn(db, makeArgs([], { config: '@missing.json' }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when config file contains invalid JSON', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not json');
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.classbreak.fn(db, makeArgs([], { config: '@bad.json' }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when inline config is invalid JSON', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.classbreak.fn(db, makeArgs([], { config: '{not valid json' }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when config has no LAYERS or table', async () => {
    const config = JSON.stringify({ CB_ATTR: 'val' });
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.classbreak.fn(db, makeArgs([], { config }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// wms
// ---------------------------------------------------------------------------

describe('wms', () => {
  it('sends config with defaults to wms_request', async () => {
    const config = JSON.stringify({
      LAYERS: 'mytable',
      BBOX: '-180,-90,180,90',
    });
    const buf = Buffer.from('wmspng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.wms.fn(db, makeArgs([], { config }));

    expect(db.wms_request).toHaveBeenCalledWith(
      expect.objectContaining({
        REQUEST: 'GetMap',
        FORMAT: 'image/png',
        SRS: 'EPSG:4326',
        WIDTH: 800,
        HEIGHT: 600,
        LAYERS: 'mytable',
        BBOX: '-180,-90,180,90',
      })
    );
  });

  it('allows config to override defaults', async () => {
    const config = JSON.stringify({
      LAYERS: 'mytable',
      BBOX: '0,0,10,10',
      WIDTH: 1024,
      FORMAT: 'image/jpeg',
    });
    const buf = Buffer.from('jpg');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.wms.fn(db, makeArgs([], { config }));

    expect(db.wms_request).toHaveBeenCalledWith(
      expect.objectContaining({
        WIDTH: 1024,
        FORMAT: 'image/jpeg',
        LAYERS: 'mytable',
        BBOX: '0,0,10,10',
      })
    );
  });

  it('writes buffer to output file', async () => {
    const config = JSON.stringify({
      LAYERS: 'mytable',
      BBOX: '-180,-90,180,90',
    });
    const buf = Buffer.from('png');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    await viz.wms.fn(db, makeArgs([], { config, output: '/tmp/wms.png' }));

    expect(writeSpy).toHaveBeenCalledWith('/tmp/wms.png', buf);
    const result = capturedOutput(logSpy);
    expect(result.output).toBe('/tmp/wms.png');
  });

  it('dies when LAYERS is missing', async () => {
    const config = JSON.stringify({ BBOX: '-180,-90,180,90' });
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.wms.fn(db, makeArgs([], { config }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when BBOX is missing', async () => {
    const config = JSON.stringify({ LAYERS: 'mytable' });
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.wms.fn(db, makeArgs([], { config }))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies when no config is provided', async () => {
    const db = createMockDb();
    const exitSpy = mockDie();

    await expect(
      viz.wms.fn(db, makeArgs([], {}))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// --preview flag integration
// ---------------------------------------------------------------------------

describe('--preview flag', () => {
  it('calls renderPreview for heatmap when --preview is set', async () => {
    const renderSpy = vi.spyOn(imagePreview, 'renderPreview').mockImplementation(() => {});
    const buf = Buffer.from('fakepng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.heatmap.fn(db, makeArgs(['mytable'], {
      'x-col': 'lon',
      'y-col': 'lat',
      preview: true,
    }));

    expect(renderSpy).toHaveBeenCalledWith(buf, { maxWidth: 0 });
  });

  it('calls renderPreview for chart when --preview is set', async () => {
    const renderSpy = vi.spyOn(imagePreview, 'renderPreview').mockImplementation(() => {});
    const db = createMockDb({
      visualize_image_chart: vi.fn().mockResolvedValue({
        image_data: 'aGVsbG8=',
      }),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.chart.fn(db, makeArgs(['mytable'], {
      'x-column': 'x',
      'y-column': 'y',
      preview: true,
    }));

    expect(renderSpy).toHaveBeenCalledWith(
      expect.any(Buffer),
      { maxWidth: 0 },
    );
  });

  it('passes preview-width to renderPreview', async () => {
    const renderSpy = vi.spyOn(imagePreview, 'renderPreview').mockImplementation(() => {});
    const buf = Buffer.from('fakepng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.heatmap.fn(db, makeArgs(['mytable'], {
      'x-col': 'lon',
      'y-col': 'lat',
      preview: true,
      'preview-width': '40',
    }));

    expect(renderSpy).toHaveBeenCalledWith(buf, { maxWidth: 40 });
  });

  it('does not call renderPreview when --preview is not set', async () => {
    const renderSpy = vi.spyOn(imagePreview, 'renderPreview').mockImplementation(() => {});
    const buf = Buffer.from('fakepng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.heatmap.fn(db, makeArgs(['mytable'], {
      'x-col': 'lon',
      'y-col': 'lat',
    }));

    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('calls renderPreview for wms when --preview is set', async () => {
    const renderSpy = vi.spyOn(imagePreview, 'renderPreview').mockImplementation(() => {});
    const config = JSON.stringify({
      LAYERS: 'mytable',
      BBOX: '-180,-90,180,90',
    });
    const buf = Buffer.from('wmspng');
    const db = createMockDb({
      wms_request: vi.fn().mockResolvedValue(buf),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await viz.wms.fn(db, makeArgs([], { config, preview: true }));

    expect(renderSpy).toHaveBeenCalledWith(buf, { maxWidth: 0 });
  });
});
