"""CONTRACT v3 arrays and RGBA layers using the frontend's existing palettes."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .raster import Dem, DemError
from .terrain import compute_terrain

SLOPE_STOPS = [(0, "#2b83ba"), (10, "#abdda4"), (20, "#fdae61"), (25, "#d7191c")]
ROUGHNESS_STOPS = [(0, "#f7f4c3"), (0.5, "#e8a33d"), (1, "#8e2a1d")]


def rgba(values, valid, stops):
    values = np.asarray(values, dtype=float)
    rgb = np.array([[int(color[i:i+2], 16) for i in (1, 3, 5)] for _, color in stops])
    result = np.zeros((*values.shape, 4), dtype=np.uint8)
    for channel in range(3):
        interpolated = np.interp(values, [v for v, _ in stops], rgb[:, channel])
        result[..., channel] = np.floor(interpolated + 0.5).astype(np.uint8)
    result[..., 3] = np.where(valid, 255, 0)
    result[~valid] = 0
    return result


def make_grid(dem: Dem, source: dict) -> dict:
    terrain = compute_terrain(dem)
    meta = dem.metadata
    if meta.resolution[0] != meta.resolution[1]:
        raise DemError("CONTRACT grid requires square metric cells.")
    arrays = {}
    for name, data, decimals in [("elevation", dem.elevation, 2), ("slope", terrain.slope, 1),
                                  ("roughness", terrain.roughness, 2)]:
        valid = dem.valid & (data != (meta.nodata if name == "elevation" else terrain.nodata))
        if not np.isfinite(data[valid]).all() or np.any(np.round(data[valid], decimals) == -9999):
            raise DemError("Nonfinite data or output NoData collision.")
        arrays[name] = np.where(valid, np.round(data, decimals), -9999)
    # Statistics describe the serialized values, so displayed bounds are reproducible.
    valid_values = {key: a[a != -9999] for key, a in arrays.items()}
    stats = {"elevationMin": float(valid_values["elevation"].min()),
             "elevationMax": float(valid_values["elevation"].max()),
             "slopeMax": float(valid_values["slope"].max()),
             "roughnessP95": float(np.percentile(valid_values["roughness"], 95))}
    return dict(version=1, width=meta.width, height=meta.height, cellSize=meta.resolution[0], nodata=-9999,
                **{key: a.ravel(order="C").tolist() for key, a in arrays.items()}, stats=stats, source=source)


def grid_images(grid):
    shape = (grid["height"], grid["width"])
    slope = np.array(grid["slope"]).reshape(shape)
    roughness = np.array(grid["roughness"]).reshape(shape)
    elevation = np.array(grid["elevation"]).reshape(shape)
    slope_rgba = rgba(slope, (slope != -9999) & (elevation != -9999), SLOPE_STOPS)
    slope_rgba[(slope > 25) & (slope != -9999)] = [122, 31, 143, 255]
    p95 = grid["stats"]["roughnessP95"]
    normalized = np.zeros(shape) if p95 <= 0.001 else np.clip(roughness / p95, 0, 1)
    return slope_rgba, rgba(normalized, (roughness != -9999) & (elevation != -9999), ROUGHNESS_STOPS)


def write_grid_layers(grid: dict, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    (output / "grid.json").write_text(json.dumps(grid, allow_nan=False, separators=(",", ":")), encoding="utf-8")
    slope, roughness = grid_images(grid)
    Image.fromarray(slope).save(output / "slope.png")
    Image.fromarray(roughness).save(output / "roughness.png")
    layers = [dict(id="ortho", title="HiRISE orthophoto", file="ortho.png", source=grid["source"]["ortho"]),
              dict(id="slope", title="Slope (5 m DEM; scenario limit 25 degrees)", file="slope.png",
                   source=grid["source"]["dem"] + " (derived)", unit="°",
                   legend=[dict(value=v, color=c, label=f"{v}°") for v, c in SLOPE_STOPS]
                   + [dict(value=25, color="#7a1f8f", label=">25° (scenario impassable)")]),
              dict(id="roughness", title="Roughness (P95-normalized)", file="roughness.png",
                   source=grid["source"]["dem"] + " (derived)", unit="m",
                   legend=[dict(value=v * grid["stats"]["roughnessP95"], color=c,
                                label=f"{v * grid['stats']['roughnessP95']:.3f} m" + ("+" if v == 1 else ""))
                           for v, c in ROUGHNESS_STOPS])]
    (output / "layers.json").write_text(json.dumps(layers, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
