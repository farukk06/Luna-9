from pathlib import Path
import sys
import tempfile
import unittest
import json

import numpy as np
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dem_pipeline import write_synthetic_dem, read_dem
from dem_pipeline.export import make_grid, grid_images, rgba, SLOPE_STOPS, write_grid_layers


class ExportTests(unittest.TestCase):
    def test_rounding_row_order_nodata_and_png_roundtrip(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'synthetic.tif'
            values = np.arange(25, dtype=float).reshape(5,5) * 0.12345
            values[2,2] = -9999
            write_synthetic_dem(source, values, crs=CRS.from_epsg(32631), transform=from_origin(100,100,5,5))
            grid = make_grid(read_dem(source, elevation_unit='m'), {'dem':'synthetic', 'ortho':'synthetic'})
            self.assertEqual(grid['elevation'][1], 0.12)
            for name in ['elevation','slope','roughness']:
                self.assertEqual(len(grid[name]),25); self.assertEqual(grid[name][12],-9999)
            write_grid_layers(grid, root / 'out')
            decoded = json.loads((root / 'out/grid.json').read_text())
            self.assertEqual(decoded,grid)
            for name in ['slope','roughness']:
                with Image.open(root / f'out/{name}.png') as im:
                    self.assertEqual(im.size,(5,5)); self.assertEqual(im.getpixel((2,2))[3],0)

    def test_palette_stops_and_impassable_match(self):
        values = np.array([[0,10,20,25]])
        pixels = rgba(values, np.ones_like(values,dtype=bool), SLOPE_STOPS)
        self.assertEqual(pixels[0].tolist(),[[43,131,186,255],[171,221,164,255],[253,174,97,255],[215,25,28,255]])
        grid = {'height':1,'width':2,'slope':[25,25.1],'roughness':[0,0], 'elevation':[0,0], 'stats':{'roughnessP95':0}}
        slope, roughness = grid_images(grid)
        self.assertEqual(slope[0,1].tolist(),[122,31,143,255])
        self.assertTrue(np.isfinite(roughness).all())

    def test_local_mvp_files(self):
        output = Path(__file__).resolve().parents[2] / 'frontend/public/data'
        if not (output/'ortho.png').exists(): self.skipTest('MVP outputs not generated locally')
        grid = json.loads((output/'grid.json').read_text())
        self.assertEqual((grid['width'],grid['height'],grid['cellSize']),(400,400,5))
        for key in ['elevation','slope','roughness']:
            a = np.array(grid[key]); self.assertEqual(a.size,160000); self.assertTrue(np.isfinite(a).all())
        for name,size in [('ortho',1600),('slope',400),('roughness',400)]:
            with Image.open(output/f'{name}.png') as im:
                self.assertEqual(im.size,(size,size)); im.verify()
