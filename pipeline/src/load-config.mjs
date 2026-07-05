// Load pipeline/country.json. `--bash` prints `export KEY=…` lines for shell steps;
// node steps import { config } directly.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'country.json');
export const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

if (process.argv.includes('--bash')) {
  const c = config;
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  const lines = [
    `export COUNTRY_NAME=${q(c.name)}`,
    `export EPSG=${q(c.epsg)}`,
    `export EXTRACT_URL=${q(c.extractUrl)}`,
    `export PBF_FILE=${q(c.extractUrl.split('/').pop())}`,
    `export OSM_COUNTRY_NAME=${q(c.osmCountryName)}`,
    `export ADMIN_COUNTRY=${q(c.adminLevels.country)}`,
    `export ADMIN1=${q(c.adminLevels.admin1)}`,
    `export ADMIN2=${q(c.adminLevels.admin2)}`,
    `export FRAME_XMIN=${q(c.frame.xmin)}`,
    `export FRAME_YMIN=${q(c.frame.ymin)}`,
    `export FRAME_XMAX=${q(c.frame.xmax)}`,
    `export FRAME_YMAX=${q(c.frame.ymax)}`,
    `export FRAME4326=${q(c.frame4326.join(' '))}`,
    `export DEM_LAT_MIN=${q(c.dem.latMin)}`,
    `export DEM_LAT_MAX=${q(c.dem.latMax)}`,
    `export DEM_LON_MIN=${q(c.dem.lonMin)}`,
    `export DEM_LON_MAX=${q(c.dem.lonMax)}`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
}
