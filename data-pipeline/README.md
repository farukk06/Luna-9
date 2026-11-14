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

## Stage 1C alignment

`dem_pipeline.alignment.TargetGrid` and `align_raster` align one-band rasters
with an explicit equal planetary sphere radius. Input scale/offset is rejected,
not guessed. Source data and masks are combined in 256x256 windows into a
temporary tiled raster before bilinear warping. Temporary data is removed on
exit; GDAL cache and warp workspace are each limited to 64 MB. This uses disk
space proportional to source size, not a full in-memory source array.

Run `.\.venv\Scripts\python.exe data-pipeline/align_hirise.py` from the repo
root after locally excluding `/data-pipeline/processed/` in `.git/info/exclude`.
The script refuses to overwrite outputs. It writes two aligned float32 TIFFs
and a JSON validation report under `processed/`, checks the approved 400x400,
5 m grid, evaluates four points, and compares source SHA-256 before/after.
Ortho samples are checked against nearby source intensity ranges; this is a
sanity check, not proof of perfect visual/geodetic registration.

DEM metre units rely on the user-supplied confirmation of the official USGS
product metadata; its source TIFF has no band unit. The vertical reference
surface is not independently established. Bilinear downsampling smooths local
relief: reported slopes describe the 5 m output, not native-resolution hazards.

## Stage 1D MVP assets

Run `python data-pipeline/export_mvp.py` with the project virtual environment
from the repository root after Stage 1C. It verifies source digests and aligned
metadata, calculates terrain metrics, serializes row-major CONTRACT v3 arrays,
and writes grid.json, layers.json and three PNGs to frontend/public/data/.
Statistics are computed from the rounded serialized arrays. JSON rejects
NaN/Infinity. A 1600x1600 ortho is warped directly from the original source
at 1.25 projection metres per pixel, not enlarged from the 400x400 image.

Run `node data-pipeline/verify_mvp.mjs` to invoke existing frontend modules via
the installed Vite runtime: validate the grid, compare every slope/roughness
RGBA pixel with the frontend palette, and calculate three routes using the
actual A* engine and DEFAULT_OPTIONS. Reports and decoded validation buffers
stay in locally excluded processed/. No new dependency is installed.

Colors use the current frontend's fixed default 25-degree scenario limit and
P95 roughness normalization. They are not safety classifications. The current
frontend renders roughness from grid values; exact pixel parity is verified.
Its mock habitat and stop coordinates still need Person 1 integration. The
official USGS archive lists both source filenames; source text includes those
archive URLs and product metadata DOIs (DEM P9REJ9JN, ortho P9QJDP48).
The local inputs cover smaller extents than the archived products and are not
claimed to be byte-identical to them. Elevation metre units use the supplied USGS
metadata confirmation, with no claim about the vertical reference surface.
