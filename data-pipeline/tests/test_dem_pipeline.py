"""Controlled synthetic fixtures only; no real planetary measurements."""

from pathlib import Path
from dataclasses import replace
import sys
import tempfile
import unittest

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine, from_origin

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dem_pipeline import DemError, compute_terrain, read_dem, write_synthetic_dem


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "synthetic.tif"
        # Earth CRS is an explicit synthetic fixture, never an inferred Mars CRS.
        self.crs = CRS.from_epsg(32631)
        self.transform = from_origin(500000, 1000, 5, 10)

    def dem(self, values):
        write_synthetic_dem(self.path, np.asarray(values), crs=self.crs, transform=self.transform)
        return read_dem(self.path, elevation_unit="m")

    def raw(self, *, crs=None, transform=None, nodata=-9999, count=1, values=None):
        with rasterio.open(self.path, "w", driver="GTiff", width=3, height=3, count=count,
                           dtype="float64", crs=crs, transform=transform or self.transform, nodata=nodata) as dst:
            dst.write(np.ones((3, 3)) if values is None else values, 1)

    def test_metadata_round_trip(self):
        dem = self.dem(np.full((3, 4), 100.0))
        self.assertEqual(dem.metadata.crs, self.crs)
        self.assertEqual(dem.metadata.transform, self.transform)
        self.assertEqual(dem.metadata.resolution, (5, 10))
        self.assertEqual(dem.metadata.bounds, (500000, 970, 500020, 1000))
        self.assertEqual(dem.metadata.nodata, -9999)
        self.assertEqual(dem.metadata.elevation_unit, "m")
        self.assertEqual(dem.elevation.shape, (3, 4))
        with rasterio.open(self.path) as src:
            self.assertIn("SYNTHETIC", src.tags()["data_kind"])

    def test_flat_terrain_including_edges(self):
        result = compute_terrain(self.dem(np.full((4, 4), -2500.0)))
        np.testing.assert_array_equal(result.slope, 0)
        np.testing.assert_array_equal(result.roughness, 0)
        self.assertEqual(result.stats, {"elevationMin": -2500, "elevationMax": -2500,
                                        "slopeMax": 0, "roughnessP95": 0})

    def test_known_plane_rectangular_pixels_and_edges(self):
        rows, cols = np.indices((5, 5))
        z = 0.2 * cols * 5 + 0.3 * rows * 10
        result = compute_terrain(self.dem(z))
        expected = np.degrees(np.arctan(np.hypot(0.2, 0.3)))
        np.testing.assert_allclose(result.slope, expected, atol=1e-12)
        self.assertAlmostEqual(result.roughness[2, 2], np.std(z[1:4, 1:4], ddof=0))
        self.assertAlmostEqual(result.roughness[0, 0], np.std(z[:2, :2], ddof=0))
        self.assertEqual(result.slope.shape, z.shape)
        self.assertTrue(np.isfinite(result.slope).all())
        self.assertTrue(np.isfinite(list(result.stats.values())).all())

    def test_single_nodata_and_neighbours(self):
        rows, cols = np.indices((5, 5))
        z = cols.astype(float) * 5
        z[2, 2] = -9999
        result = compute_terrain(self.dem(z))
        self.assertEqual(result.slope[2, 2], -9999)
        self.assertEqual(result.roughness[2, 2], -9999)
        self.assertAlmostEqual(result.slope[2, 1], 45)
        window = z[1:4, :3]
        self.assertAlmostEqual(result.roughness[2, 1], np.std(window[window != -9999]))
        self.assertEqual(result.stats["elevationMin"], 0)
        self.assertEqual(result.stats["elevationMax"], 20)

    def test_missing_axis_marks_only_slope_invalid(self):
        z = np.zeros((5, 5)); z[2, 1] = z[2, 3] = -9999
        result = compute_terrain(self.dem(z))
        self.assertEqual(result.slope[2, 2], -9999)
        self.assertEqual(result.roughness[2, 2], 0)
        self.assertEqual(result.stats["slopeMax"], 0)

    def test_no_usable_slope_raises(self):
        with self.assertRaisesRegex(DemError, "sufficient"):
            compute_terrain(self.dem(np.zeros((1, 3))))

    def test_all_nodata_raises(self):
        with self.assertRaisesRegex(DemError, "no valid"):
            self.dem(np.full((3, 3), -9999))

    def test_missing_and_geographic_crs_rejected(self):
        for crs in [None, CRS.from_epsg(4326)]:
            with self.subTest(crs=crs):
                self.raw(crs=crs)
                with self.assertRaisesRegex(DemError, "projected CRS"):
                    read_dem(self.path, elevation_unit="m")

    def test_nonmetric_crs_rejected(self):
        self.raw(crs=CRS.from_epsg(2263))
        with self.assertRaisesRegex(DemError, "metres"):
            read_dem(self.path, elevation_unit="m")

    def test_bad_resolution_and_rotation_rejected(self):
        for transform in [Affine(0, 0, 10, 0, -5, 10), Affine(-5, 0, 10, 0, -5, 10),
                          Affine(5, 0, 10, 0, 5, 10), Affine(5, 1, 10, 0, -5, 10)]:
            with self.subTest(transform=transform), self.assertRaises(DemError):
                write_synthetic_dem(self.path, np.zeros((3, 3)), crs=self.crs, transform=transform)

    def test_wrong_vertical_units_rejected(self):
        with self.assertRaisesRegex(DemError, "Elevation units"):
            read_dem(self.path, elevation_unit="ft")

    def test_missing_nodata_rejected(self):
        self.raw(crs=self.crs, nodata=None)
        with self.assertRaisesRegex(DemError, "NoData"):
            read_dem(self.path, elevation_unit="m")

    def test_unmasked_nonfinite_rejected(self):
        values = np.ones((3, 3)); values[1, 1] = np.nan
        self.raw(crs=self.crs, values=values)
        with self.assertRaisesRegex(DemError, "NaN/Infinity"):
            read_dem(self.path, elevation_unit="m")

    def test_multiband_rejected(self):
        self.raw(crs=self.crs, count=2)
        with self.assertRaisesRegex(DemError, "single-band"):
            read_dem(self.path, elevation_unit="m")

    def test_unreadable_source_rejected(self):
        with self.assertRaisesRegex(DemError, "Cannot read"):
            read_dem(self.path, elevation_unit="m")
        self.path.write_text("not a raster")
        with self.assertRaises(DemError):
            read_dem(self.path, elevation_unit="m")

    def test_external_mask_respected(self):
        self.raw(crs=self.crs)
        with rasterio.open(self.path, "r+") as dst:
            mask = np.full((3, 3), 255, dtype=np.uint8); mask[1, 1] = 0
            dst.write_mask(mask)
        dem = read_dem(self.path, elevation_unit="m")
        self.assertFalse(dem.valid[1, 1])
        self.assertEqual(dem.elevation[1, 1], -9999)

    def test_fixture_does_not_overwrite_source(self):
        self.dem(np.zeros((3, 3)))
        with self.assertRaisesRegex(DemError, "overwrite"):
            write_synthetic_dem(self.path, np.ones((3, 3)), crs=self.crs, transform=self.transform)

    def test_nan_nodata_explicitly_rejected(self):
        self.raw(crs=self.crs, nodata=float("nan"))
        with self.assertRaisesRegex(DemError, "finite, explicit NoData"):
            read_dem(self.path, elevation_unit="m")

    def test_scale_offset_and_band_unit_conflicts_rejected(self):
        self.raw(crs=self.crs)
        with rasterio.open(self.path, "r+") as dst:
            dst.scales = (0.1,)
        with self.assertRaisesRegex(DemError, "Scaled/offset"):
            read_dem(self.path, elevation_unit="m")
        with rasterio.open(self.path, "r+") as dst:
            dst.scales = (1,); dst.offsets = (100,)
        with self.assertRaisesRegex(DemError, "Scaled/offset"):
            read_dem(self.path, elevation_unit="m")
        with rasterio.open(self.path, "r+") as dst:
            dst.offsets = (0,); dst.set_band_unit(1, "ft")
        with self.assertRaisesRegex(DemError, "units conflict"):
            read_dem(self.path, elevation_unit="m")

    def test_mask_cannot_override_band_nodata(self):
        values = np.ones((3, 3)); values[1, 1] = -9999
        self.raw(crs=self.crs, values=values)
        with rasterio.open(self.path, "r+") as dst:
            dst.write_mask(np.full((3, 3), 255, dtype=np.uint8))
        dem = read_dem(self.path, elevation_unit="m")
        self.assertFalse(dem.valid[1, 1])
        result = compute_terrain(dem)
        self.assertEqual(result.roughness[1, 1], result.nodata)
        self.assertEqual(result.stats["roughnessP95"], 0)

    def test_zero_source_nodata_does_not_collide_with_flat_outputs(self):
        values = np.ones((3, 3)); values[1, 1] = 0
        self.raw(crs=self.crs, nodata=0, values=values)
        result = compute_terrain(read_dem(self.path, elevation_unit="m"))
        self.assertEqual(result.nodata, -9999)
        self.assertEqual(result.slope[1, 1], result.nodata)
        self.assertEqual(result.stats["slopeMax"], 0)

    def test_north_up_plane_using_actual_map_coordinates(self):
        rows, cols = np.indices((4, 4))
        x = 500000 + (cols + 0.5) * 5
        y = 1000 - (rows + 0.5) * 10
        result = compute_terrain(self.dem(0.4 * x - 0.2 * y))
        expected = np.degrees(np.arctan(np.sqrt(0.4**2 + 0.2**2)))
        np.testing.assert_allclose(result.slope, expected, atol=1e-10)

    def test_reader_rejects_skewed_geotiff(self):
        self.raw(crs=self.crs, transform=Affine(5, 1, 10, 0, -10, 20))
        with self.assertRaisesRegex(DemError, "Rotated/sheared"):
            read_dem(self.path, elevation_unit="m")

    def test_direct_dem_metadata_mismatch_rejected(self):
        dem = self.dem(np.ones((3, 3)))
        with self.assertRaisesRegex(DemError, "disagrees"):
            compute_terrain(replace(dem, metadata=replace(dem.metadata, resolution=(1, 1))))
        with self.assertRaisesRegex(DemError, "boolean"):
            compute_terrain(replace(dem, valid=np.ones((3, 3), dtype=np.uint8)))

    def test_isolated_cell_has_population_std_zero_and_nodata_slope(self):
        values = np.full((6, 6), -9999.0); values[:2, :2] = 10; values[4, 4] = 42
        result = compute_terrain(self.dem(values))
        self.assertEqual(result.roughness[4, 4], 0)
        self.assertEqual(result.slope[4, 4], result.nodata)
        self.assertEqual(result.stats["elevationMax"], 42)

    def test_integer_dem_differences_do_not_wrap(self):
        dem = self.dem(np.ones((3, 3)))
        values = np.array([[30, 20, 10]] * 3, dtype=np.uint16)
        result = compute_terrain(replace(dem, elevation=values))
        np.testing.assert_allclose(result.slope, np.degrees(np.arctan(2)))


if __name__ == "__main__":
    unittest.main()
