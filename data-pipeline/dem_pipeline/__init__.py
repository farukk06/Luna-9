"""DEM inspection and terrain metrics; no automatic planetary CRS assignment."""

from .raster import Dem, DemError, RasterMetadata, read_dem, write_synthetic_dem
from .terrain import Terrain, compute_terrain

__all__ = ["Dem", "DemError", "RasterMetadata", "Terrain", "read_dem", "write_synthetic_dem", "compute_terrain"]
