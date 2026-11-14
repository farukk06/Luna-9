"""Finite differences and masked 3x3 population standard deviation."""

from dataclasses import dataclass

import numpy as np

from .raster import Dem, DemError, _validate_spatial


@dataclass(frozen=True)
class Terrain:
    slope: np.ndarray
    roughness: np.ndarray
    stats: dict[str, float]
    nodata: float


def compute_terrain(dem: Dem) -> Terrain:
    """Calculate degree slope and metre roughness without padding or NoData arithmetic."""
    z, valid, meta = dem.elevation, dem.valid, dem.metadata
    _validate_spatial(meta.crs, meta.transform)
    if meta.elevation_unit != "m" or not np.isfinite(meta.nodata):
        raise DemError("DEM requires metre elevations and finite NoData.")
    if valid.dtype != np.bool_:
        raise DemError("DEM validity mask must be boolean.")
    if z.dtype.kind not in "iuf":
        raise DemError("DEM values must be real numeric elevations.")
    if z.shape != (meta.height, meta.width) or valid.shape != z.shape:
        raise DemError("DEM array shapes disagree with metadata.")
    if not valid.any() or not np.isfinite(z[valid]).all():
        raise DemError("DEM has no usable finite elevations.")
    dx, dy = meta.resolution
    if not np.isfinite([dx, dy]).all() or dx <= 0 or dy <= 0:
        raise DemError("Pixel resolutions must be finite positive metres.")
    if not np.allclose([dx, dy], [meta.transform.a, -meta.transform.e], rtol=1e-12, atol=0):
        raise DemError("Pixel resolution disagrees with the affine transform.")
    # Avoid unsigned/integer subtraction and source sentinels colliding with zero slope.
    z = z.astype(np.float64, copy=False)
    valid = valid & (z != meta.nodata)
    nodata = meta.nodata if meta.nodata < 0 else -9999.0
    slope = np.full(z.shape, nodata, dtype=np.float64)
    roughness = np.full(z.shape, nodata, dtype=np.float64)
    h, w = z.shape

    def derivative(r: int, c: int, dr: int, dc: int, spacing: float) -> float | None:
        before, after = (r - dr, c - dc), (r + dr, c + dc)
        has_before = 0 <= before[0] < h and 0 <= before[1] < w and valid[before]
        has_after = 0 <= after[0] < h and 0 <= after[1] < w and valid[after]
        if has_before and has_after:
            return (z[after] - z[before]) / (2 * spacing)
        if has_after:
            return (z[after] - z[r, c]) / spacing
        if has_before:
            return (z[r, c] - z[before]) / spacing
        return None

    with np.errstate(over="raise", invalid="raise", divide="raise"):
        try:
            for r, c in zip(*np.nonzero(valid)):
                window = np.s_[max(0, r - 1):min(h, r + 2), max(0, c - 1):min(w, c + 2)]
                roughness[r, c] = np.std(z[window][valid[window]], ddof=0)
                gx = derivative(r, c, 0, 1, dx)
                gy = derivative(r, c, 1, 0, dy)
                if gx is not None and gy is not None:
                    slope[r, c] = np.degrees(np.arctan(np.hypot(gx, gy)))
            slope_valid = valid & (slope != nodata)
            if not slope_valid.any():
                raise DemError("No cells have sufficient horizontal and vertical neighbours for slope statistics.")
            stats = {"elevationMin": float(z[valid].min()), "elevationMax": float(z[valid].max()),
                     "slopeMax": float(slope[slope_valid].max()),
                     "roughnessP95": float(np.percentile(roughness[valid], 95))}
        except FloatingPointError as exc:
            raise DemError("Terrain computation overflowed; inspect elevation values and units.") from exc
    return Terrain(slope, roughness, stats, nodata)
