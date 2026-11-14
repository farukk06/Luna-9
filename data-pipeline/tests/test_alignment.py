"""Synthetic planetary-sphere alignment tests; fixtures are not NASA data."""
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import transform_bounds

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dem_pipeline.alignment import TargetGrid, align_raster
from dem_pipeline import DemError


class AlignmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source.tif"
        self.dest = Path(self.temp.name) / "aligned.tif"
        self.crs = CRS.from_string("+proj=eqc +R=3396190 +units=m")
        self.grid = TargetGrid(self.crs, (100, 100, 140, 140), 4, 4)

    def write(self, values, *, geographic=False, mask=None):
        crs = CRS.from_string("+proj=longlat +R=3396190") if geographic else self.crs
        bounds = transform_bounds(self.crs, crs, *self.grid.bounds) if geographic else self.grid.bounds
        from rasterio.transform import from_bounds
        with rasterio.open(self.source, "w", driver="GTiff", width=4, height=4, count=1,
                           dtype="float32", crs=crs, transform=from_bounds(*bounds, 4, 4), nodata=-9999) as dst:
            dst.write(np.asarray(values, dtype=np.float32), 1)
            if mask is not None: dst.write_mask(mask)

    def test_exact_grid_and_values(self):
        self.write(np.arange(16).reshape(4, 4))
        align_raster(self.source, self.dest, self.grid, elevation_unit="m")
        with rasterio.open(self.dest) as dst:
            self.assertEqual(dst.crs, self.crs); self.assertEqual(dst.transform, from_origin(100, 140, 10, 10))
            self.assertEqual(tuple(dst.bounds), self.grid.bounds); self.assertEqual(dst.shape, (4, 4))
            self.assertEqual(dst.units, ("m",)); np.testing.assert_array_equal(dst.read(1), np.arange(16).reshape(4, 4))

    def test_geographic_mars_to_metric(self):
        self.write(np.full((4, 4), 42), geographic=True)
        align_raster(self.source, self.dest, self.grid)
        with rasterio.open(self.dest) as dst:
            np.testing.assert_allclose(dst.read(1), 42); self.assertEqual(dst.crs, self.crs)

    def test_nodata_and_external_mask_do_not_contaminate_bilinear(self):
        values = np.full((4, 4), 20.0); values[1, 1] = -9999; values[2, 2] = 999999
        mask = np.full((4, 4), 255, dtype=np.uint8); mask[2, 2] = 0
        self.write(values, mask=mask)
        target = TargetGrid(self.crs, self.grid.bounds, 8, 8)
        align_raster(self.source, self.dest, target)
        with rasterio.open(self.dest) as dst:
            data = dst.read(1, masked=True)
            self.assertGreater(np.ma.getmaskarray(data).sum(), 0)
            np.testing.assert_allclose(data.compressed(), 20)

    def test_outside_coverage_stays_nodata(self):
        self.write(np.ones((4, 4)))
        align_raster(self.source, self.dest, TargetGrid(self.crs, (80, 80, 160, 160), 8, 8))
        with rasterio.open(self.dest) as dst:
            self.assertEqual(dst.read(1, masked=True).count(), 16)

    def test_invalid_target_rejected(self):
        for grid in [TargetGrid(self.crs, (100, 100, 100, 140), 4, 4), TargetGrid(self.crs, self.grid.bounds, 0, 4)]:
            with self.assertRaises(DemError): align_raster(self.source, self.dest, grid)

    def test_planet_radius_mismatch_rejected(self):
        self.write(np.ones((4, 4)))
        target = TargetGrid(CRS.from_string("+proj=eqc +R=6371000 +units=m"), self.grid.bounds, 4, 4)
        with self.assertRaisesRegex(DemError, "sphere radius"): align_raster(self.source, self.dest, target)

    def test_no_overwrite(self):
        self.write(np.ones((4, 4))); self.dest.write_text("keep")
        with self.assertRaises(DemError): align_raster(self.source, self.dest, self.grid)
        self.assertEqual(self.dest.read_text(), "keep")


class RealAlignmentChecks(unittest.TestCase):
    """Optional local integration check; never downloads or generates real-data fixtures."""
    def test_local_hirise_outputs_and_points(self):
        from dem_pipeline import read_dem, compute_terrain
        output = Path(__file__).resolve().parents[1] / "processed"
        dem, ortho = output / "hirise_dem_5m.tif", output / "hirise_ortho_5m.tif"
        if not dem.exists() or not ortho.exists():
            self.skipTest("Local HiRISE alignment outputs are not available")
        expected = (4589410.452260459, 1091550.893258729, 4591410.452260459, 1093550.893258729)
        with rasterio.open(dem) as d, rasterio.open(ortho) as o:
            self.assertEqual(d.crs, o.crs); self.assertEqual(d.transform, o.transform)
            self.assertEqual(d.bounds, o.bounds); self.assertEqual(d.shape, (400, 400))
            self.assertEqual(o.shape, (400, 400)); self.assertEqual(d.res, (5, 5))
            np.testing.assert_allclose(d.bounds, expected, rtol=0, atol=1e-8)
            self.assertEqual(d.read(1, masked=True).count(), 160000)
            self.assertEqual(o.read(1, masked=True).count(), 160000)
        data = read_dem(dem, elevation_unit="m")
        terrain = compute_terrain(data)
        for col, row in [(306,318), (235,265), (202,202), (146,152)]:
            self.assertTrue(data.valid[row,col])
            self.assertTrue(0 <= terrain.slope[row,col] <= 90)
