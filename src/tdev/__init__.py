"""Command-first, exact-source MCP controller."""
from pathlib import Path
import tomllib

__version__ = tomllib.loads((Path(__file__).resolve().parents[2] / "Cargo.toml").read_text())["package"]["version"]
