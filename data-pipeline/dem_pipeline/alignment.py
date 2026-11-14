"""Bounded-memory, mask-aware alignment on an explicitly selected planetary grid."""

from dataclasses import dataclass
from pathlib import Path
import tempfile

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling
from rasterio.windows import Window

from .raster import DemError, _validate_spatial


@dataclass(frozen=True)
class TargetGrid:
    crs: CRS
    bounds: tuple[float, float, float, float]
    width: int
    height: int

    @property
    def transform(self):
        return from_bounds(*self.bounds, self.width, self.height)

    def validate(self):
        if not all(isinstance(v, int) and not isinstance(v, bool) and v > 0 for v in (self.width, self.height)):
            raise DemError("Target dimensions must be positive integers.")
        if not np.isfinite(self.bounds).all() or self.bounds[0] >= self.bounds[2] or self.bounds[1] >= self.bounds[3]:
            raise DemError("Target bounds must be finite and ordered.")
        _validate_spatial(self.crs, self.transform)


def align_raster(source: str | Path, destination: str | Path, target: TargetGrid,
                 *, elevation_unit: str | None = None) -> None:
    """Bilinear alignment; caller explicitly supplies 'm' for elevation products.

    A temporary tiled raster combines band NoData and masks before GDAL warping.
    This avoids a dataset mask overriding a band sentinel during interpolation.
    """
    target.validate()
    source, destination = Path(source), Path(destination)
    if destination.exists() or source.resolve() == destination.resolve():
        raise DemError("Refusing to overwrite an existing raster.")
    if elevation_unit not in (None, "m"):
        raise DemError("Elevation units must be explicitly confirmed as metres.")
    with rasterio.Env(GDAL_CACHEMAX=64 * 1024 * 1024), rasterio.open(source) as src:
        if src.driver != "GTiff" or src.count != 1 or src.crs is None:
            raise DemError("Expected a single-band GeoTIFF with explicit CRS.")
        if src.scales[0] != 1 or src.offsets[0] != 0:
            raise DemError("Decode scale/offset explicitly before alignment.")
        if elevation_unit == "m" and src.units[0] and src.units[0].lower() not in ("m", "metre", "meter", "metres", "meters"):
            raise DemError("Source band units contradict metre elevations.")
        if np.dtype(src.dtypes[0]).kind not in "iuf":
            raise DemError("Only real numeric raster bands are supported.")
        if not np.isfinite(tuple(src.transform)).all() or src.transform.b != 0 or src.transform.d != 0 or src.transform.a <= 0 or src.transform.e >= 0:
            raise DemError("Source must have a finite north-up transform without skew.")
        # Require explicit equal spherical radii; never substitute a terrestrial datum.
        source_params, target_params = src.crs.to_dict(), target.crs.to_dict()
        radius = source_params.get("R")
        if radius is None or radius != target_params.get("R"):
            raise DemError("Source and target must explicitly use the same planetary sphere radius.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="alignment-", dir=destination.parent) as tmp:
            normalized_path = Path(tmp) / "masked_source.tif"
            profile = dict(driver="GTiff", width=src.width, height=src.height, count=1,
                           dtype="float64", crs=src.crs, transform=src.transform, nodata=float("nan"),
                           tiled=True, blockxsize=256, blockysize=256, compress="deflate")
            valid_count = 0
            with rasterio.open(normalized_path, "w", **profile) as normalized:
                for row in range(0, src.height, 256):
                    for col in range(0, src.width, 256):
                        window = Window(col, row, min(256, src.width-col), min(256, src.height-row))
                        values = src.read(1, window=window).astype(np.float64)
                        valid = (src.read_masks(1, window=window) > 0) & np.isfinite(values)
                        if src.nodata is not None:
                            valid &= values != src.nodata
                        valid_count += int(valid.sum())
                        values[~valid] = np.nan
                        normalized.write(values, 1, window=window)
            if valid_count == 0:
                raise DemError("Source contains no valid samples.")
            output_nodata = -9999.0
            with rasterio.open(normalized_path) as normalized:
                profile.update(width=target.width, height=target.height, crs=target.crs,
                               transform=target.transform, dtype="float32", nodata=output_nodata)
                with rasterio.open(destination, "w", **profile) as dst:
                    reproject(source=rasterio.band(normalized, 1), destination=rasterio.band(dst, 1),
                              src_nodata=float("nan"), dst_nodata=output_nodata,
                              resampling=Resampling.bilinear, warp_mem_limit=64, num_threads=1,
                              ERROR_THRESHOLD=0.0)
                    dst.update_tags(source_file=source.name, resampling="bilinear",
                                    vertical_reference="not independently verified")
                    if elevation_unit == "m":
                        dst.set_band_unit(1, "m")
