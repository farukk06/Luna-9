# DEM pipeline foundation

Run tests from the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s data-pipeline/tests -v
```

No new dependencies are needed. NumPy and Rasterio perform the calculations;
Pillow is available for the future image export stage. Test GeoTIFFs live only
in temporary directories and are explicitly tagged synthetic. Tests use an
explicit Earth metric CRS solely as a fixture; no Earth CRS is assigned to Mars
data. Real inputs must retain a verified source planetary CRS and confirmed
metre elevation units. Nothing is exported to the frontend.

`read_dem(path, elevation_unit="m")` returns elevation, validity mask, CRS,
resolution, affine transform, bounds and NoData metadata. Only single-band,
north-up, unrotated GeoTIFFs in a projected metric CRS with finite NoData are
supported. Geographic, non-metric and missing CRSs are rejected, not converted.
External masks are respected; unmasked NaN/Infinity is rejected.

`compute_terrain(dem)` uses central differences along the row/column axes;
at edges or beside missing data it uses the remaining one-sided difference.
If either axis has no valid immediate neighbour, slope is NoData. Slope is
`degrees(atan(hypot(dz/dx, dz/dy)))`. CONTRACT v3 does not prescribe a gradient
estimator; this choice is explicit and should be reviewed before real data use.
Roughness is population standard deviation (`ddof=0`) over valid cells in the
clipped 3x3 window, including the centre. Missing centres remain NoData in both
outputs. NoData/outside cells never enter arithmetic. Each statistic uses valid
values of its own metric. If no slopes can be calculated, processing raises an
explicit error instead of producing empty/NaN statistics.

Input elevation units must be confirmed by the caller: horizontal CRS units do
not prove vertical units. Resolution may differ along the two axes. Resampling
to square 5/10 m cells, DEM/orthophoto alignment, clipping, source provenance,
JSON rounding/serialization and PNG export remain future steps.

Quality-control notes: scaled/offset bands and contradictory band elevation units
are explicitly rejected. Raster masks and the band NoData sentinel are combined
conservatively. NaN NoData is unsupported and explicitly rejected. Terrain outputs
expose their own `nodata` sentinel: a nonnegative source sentinel becomes -9999
to avoid collision with valid zero slope/roughness. Source metadata is preserved.
The row derivative points south for north-up rasters; its sign does not affect
the gradient magnitude used for slope. Direct Dem objects are checked against
their affine resolution and integer elevations are promoted before subtraction.

Memory/performance: inputs and outputs are currently full arrays in memory;
the per-cell Python loop is intended for small study-area rasters. Large source
rasters will require explicit clipping/windowed reading and tiled computation
with a one-cell halo before this implementation is used at source-data scale.
