"""Build real-data MVP assets without modifying frontend source or raw inputs."""
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from PIL import Image, PngImagePlugin

from align_hirise import BOUNDS, DEM, ORTHO, ROOT, digest
from dem_pipeline import read_dem
from dem_pipeline.alignment import TargetGrid, align_raster
from dem_pipeline.export import make_grid, write_grid_layers


def main():
    processed = ROOT / "processed"
    output = ROOT.parent / "frontend/public/data"
    report = json.loads((processed / "alignment_report.json").read_text())
    before = {p.name: digest(p) for p in (DEM, ORTHO)}
    assert before == report["source_sha256_before_and_after"]
    dem = read_dem(processed / "hirise_dem_5m.tif", elevation_unit="m")
    with rasterio.open(processed / "hirise_ortho_5m.tif") as ortho, rasterio.open(ORTHO) as original:
        assert ortho.crs == dem.metadata.crs and ortho.transform == dem.metadata.transform
        assert tuple(ortho.bounds) == tuple(dem.metadata.bounds) == BOUNDS
        assert ortho.shape == dem.elevation.shape == (400, 400) and ortho.res == (5, 5)
        archive = "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
        source = dict(dem=DEM.name + " — USGS Mars 2020 TRN HiRISE DTM mosaic; https://doi.org/10.5066/P9REJ9JN; " + archive + DEM.name + "; processed from supplied local subset, not verified byte-identical to archive; vertical reference not independently verified",
                      ortho=ORTHO.name + " — USGS Mars 2020 TRN HiRISE orthomosaic (geographic variant); https://doi.org/10.5066/P9QJDP48; " + archive + ORTHO.name + "; processed from supplied local subset, not verified byte-identical to archive",
                      crs=dem.metadata.crs.to_wkt(), bounds=list(BOUNDS),
                      boundsLonLat=list(transform_bounds(dem.metadata.crs, original.crs, *BOUNDS)))
    grid = make_grid(dem, source)
    assert all(len(grid[k]) == 160000 for k in ("elevation", "slope", "roughness"))
    write_grid_layers(grid, output)
    high_res = processed / "hirise_ortho_1_25m.tif"
    target = TargetGrid(dem.metadata.crs, BOUNDS, 1600, 1600)
    if not high_res.exists():
        align_raster(ORTHO, high_res, target)
    with rasterio.open(high_res) as src:
        assert src.crs == target.crs and src.transform == target.transform and src.shape == (1600, 1600)
        a = src.read(1, masked=True)
        assert np.isfinite(a.compressed()).all()
        px = np.zeros((1600, 1600, 4), dtype=np.uint8)
        gray = np.floor(np.clip(a.filled(0), 0, 255) + 0.5).astype(np.uint8)
        px[..., :3] = gray[..., None]
        px[..., 3] = np.where(np.ma.getmaskarray(a), 0, 255)
        info = PngImagePlugin.PngInfo()
        info.add_text("source", source["ortho"])
        info.add_text("bounds", json.dumps(list(BOUNDS)))
        Image.fromarray(px).save(output / "ortho.png", pnginfo=info)
    # Decoded bytes allow exact cross-language comparison with frontend color functions.
    for name in ("slope", "roughness"):
        with Image.open(output / f"{name}.png") as im:
            im.verify()
        with Image.open(output / f"{name}.png") as im:
            assert im.size == (400, 400)
            (processed / f"{name}.rgba").write_bytes(im.tobytes())
    assert before == {p.name: digest(p) for p in (DEM, ORTHO)}
    print(json.dumps(dict(stats=grid["stats"], files={p.name:p.stat().st_size for p in output.iterdir()},
                         source_unchanged=True, ortho_resolution_m=1.25), indent=2))


if __name__ == "__main__": main()
