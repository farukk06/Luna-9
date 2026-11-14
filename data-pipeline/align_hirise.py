"""Explicit Stage 1C run; outputs stay in locally excluded processed/, never frontend."""
from pathlib import Path
import hashlib
import json

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.windows import Window
from rasterio.warp import transform

from dem_pipeline import read_dem, compute_terrain
from dem_pipeline.alignment import TargetGrid, align_raster

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw/NASA Space Apps Project/MarsTrek-Jezero"
DEM = RAW / "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif"
ORTHO = RAW / "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd.tif"
BOUNDS = (4589410.452260459, 1091550.893258729, 4591410.452260459, 1093550.893258729)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    import subprocess
    out = ROOT / "processed"
    # Verify the whole directory, not merely the global *.tif pattern.
    subprocess.run(["git", "check-ignore", "--quiet", "data-pipeline/processed/probe.json"], cwd=ROOT.parent, check=True)
    before = {p.name: digest(p) for p in (DEM, ORTHO)}
    with rasterio.open(DEM) as src:
        crs = src.crs
    expected = CRS.from_string("+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 +R=3396190 +units=m")
    if crs != expected: raise ValueError("Unexpected source DEM CRS")
    grid = TargetGrid(crs, BOUNDS, 400, 400)
    dem_path, ortho_path = out / "hirise_dem_5m.tif", out / "hirise_ortho_5m.tif"
    align_raster(DEM, dem_path, grid, elevation_unit="m")
    align_raster(ORTHO, ortho_path, grid)
    report = {"rasters": [], "points": [], "vertical_unit_evidence": "User supplied USGS product metadata confirmation; band unit absent in source",
              "vertical_reference": "not independently verified"}
    with rasterio.open(dem_path) as d, rasterio.open(ortho_path) as o, rasterio.open(ORTHO) as source:
        assert d.crs == o.crs == crs and d.transform == o.transform == grid.transform
        assert d.shape == o.shape == (400, 400)
        np.testing.assert_allclose(d.bounds, BOUNDS, rtol=0, atol=1e-8)
        assert d.bounds == o.bounds and d.res == o.res == (5, 5)
        for ds in (d, o):
            a = ds.read(1, masked=True)
            assert np.isfinite(a.compressed()).all() and a.count() == 160000
            report["rasters"].append(dict(file=Path(ds.name).name, bytes=Path(ds.name).stat().st_size,
                shape=list(ds.shape), crs=ds.crs.to_wkt(), transform=list(ds.transform), bounds=list(ds.bounds),
                resolution=ds.res, nodata=ds.nodata, masks=[str(x) for x in ds.mask_flag_enums],
                valid=int(a.count()), invalid=int(a.size-a.count()), min=float(a.min()), max=float(a.max())))
        terrain = compute_terrain(read_dem(dem_path, elevation_unit="m"))
        for name, col, row in [("Habitat",306,318),("Stop1",235,265),("Stop2",202,202),("Stop3",146,152)]:
            x, y = d.xy(row, col); lon, lat = transform(crs, source.crs, [x], [y])
            sr, sc = source.index(lon[0], lat[0])
            patch = source.read(1, window=Window(sc-10, sr-10, 21, 21), masked=True)
            value = float(o.read(1, window=Window(col,row,1,1))[0,0])
            assert patch.count() and float(patch.min()) <= value <= float(patch.max())
            report["points"].append(dict(name=name,col=col,row=row,x=x,y=y,
                elevation_m=float(d.read(1, window=Window(col,row,1,1))[0,0]),slope_deg=float(terrain.slope[row,col]),
                aligned_intensity=value,source_nearest=float(source.read(1,window=Window(sc,sr,1,1))[0,0]),
                source_patch_range=[float(patch.min()),float(patch.max())], valid=True))
    after = {p.name: digest(p) for p in (DEM, ORTHO)}
    assert before == after, "Source files changed"
    report["source_sha256_before_and_after"] = before
    (out / "alignment_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__": main()
