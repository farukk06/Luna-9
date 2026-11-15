"""Explicitly validated, single-band, north-up metric DEM input."""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.errors import RasterioError
from rasterio.transform import Affine, array_bounds


class DemError(ValueError):
    """Invalid or unsupported DEM data or spatial metadata."""


@dataclass(frozen=True)
class RasterMetadata:
    crs: CRS
    transform: Affine
    bounds: tuple[float, float, float, float]
    resolution: tuple[float, float]
    width: int
    height: int
    nodata: float
    elevation_unit: str = "m"


@dataclass(frozen=True)
class Dem:
    elevation: np.ndarray
    valid: np.ndarray
    metadata: RasterMetadata


def _validate_spatial(crs: CRS | None, transform: Affine) -> None:
    if crs is None or not crs.is_projected:
        raise DemError("DEM must have an explicit projected CRS; geographic/missing CRS is unsupported.")
    try:
        _, factor = crs.linear_units_factor
    except (RasterioError, ValueError) as exc:
        raise DemError("Unable to verify CRS linear units.") from exc
    if not np.isclose(factor, 1.0, rtol=0, atol=1e-12):
        raise DemError("CRS horizontal units must be metres; no automatic conversion is performed.")
    if not np.isfinite(tuple(transform)).all() or transform.a <= 0 or transform.e >= 0:
        raise DemError("Resolution must be finite and positive with north-up row orientation.")
    if transform.b != 0 or transform.d != 0:
        raise DemError("Rotated/sheared rasters are unsupported; prepare a north-up raster explicitly.")


def read_dem(path: str | Path, *, elevation_unit: str) -> Dem:
    """Require caller confirmation of vertical units; CRS alone cannot establish them."""
    if elevation_unit != "m":
        raise DemError("Elevation units must be explicitly confirmed as 'm'.")
    try:
        with rasterio.open(path) as src:
            if src.driver != "GTiff" or src.count != 1:
                raise DemError("Expected a single-band DEM GeoTIFF.")
            _validate_spatial(src.crs, src.transform)
            if np.dtype(src.dtypes[0]).kind not in "iuf":
                raise DemError("DEM values must be real numeric elevations.")
            if src.nodata is None or not np.isfinite(src.nodata):
                raise DemError("DEM requires a finite, explicit NoData value.")
            if src.scales[0] != 1 or src.offsets[0] != 0:
                raise DemError("Scaled/offset DEM bands are unsupported; explicitly decode elevations to metres first.")
            if src.units[0] and src.units[0].lower() not in ("m", "metre", "meter", "metres", "meters"):
                raise DemError("Band elevation units conflict with the requested metre units.")
            if not np.isfinite(tuple(src.bounds)).all():
                raise DemError("Raster bounds must be finite.")
            masked = src.read(1, masked=True).astype(np.float64)
            valid = ~np.ma.getmaskarray(masked) & (masked.data != src.nodata)
            elevation = masked.filled(src.nodata)
            if not np.isfinite(elevation[valid]).all():
                raise DemError("Unmasked NaN/Infinity elevation values are invalid.")
            if not valid.any():
                raise DemError("DEM has no valid elevation cells.")
            metadata = RasterMetadata(src.crs, src.transform, tuple(src.bounds), tuple(src.res),
                                      src.width, src.height, float(src.nodata))
            return Dem(elevation, valid, metadata)
    except RasterioError as exc:
        raise DemError(f"Cannot read DEM GeoTIFF '{path}': {exc}") from exc


def write_synthetic_dem(path: str | Path, elevation: np.ndarray, *, crs: CRS,
                        transform: Affine, nodata: float = -9999) -> None:
    """Write a small synthetic fixture with explicit CRS; never overwrite existing data."""
    _validate_spatial(crs, transform)
    data = np.asarray(elevation, dtype=np.float64)
    if data.ndim != 2 or not all(data.shape) or not np.isfinite(data).all() or not np.isfinite(nodata):
        raise DemError("Synthetic elevation must be a nonempty finite 2D array with finite NoData.")
    if data.size > 400 * 400:
        raise DemError("Synthetic fixture exceeds the 400x400-cell size budget.")
    if Path(path).exists():
        raise DemError("Refusing to overwrite an existing raster.")
    if not np.isfinite(array_bounds(*data.shape, transform)).all():
        raise DemError("Raster bounds overflow.")
    try:
        with rasterio.open(path, "w", driver="GTiff", width=data.shape[1], height=data.shape[0],
                           count=1, dtype="float64", crs=crs, transform=transform, nodata=nodata) as dst:
            dst.write(data, 1)
            dst.update_tags(data_kind="SYNTHETIC TEST FIXTURE - NOT NASA/USGS DATA", elevation_unit="m")
    except RasterioError as exc:
        raise DemError(f"Cannot write synthetic GeoTIFF '{path}': {exc}") from exc
