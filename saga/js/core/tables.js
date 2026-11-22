// The tables of the game. Each builds its flat physics table (walls, targets, sensors, ramps) and names
// the targets the shared rules use. Presentation data for each table lives in js/tables/.
import { buildTable } from './table.js';
import { buildKingdomTable } from './table-kingdom.js';

export const TABLES = {
  forest: { id: 'forest', name: 'Enchanted Forest', build: buildTable },
  kingdom: { id: 'kingdom', name: 'Forest Kingdom', build: buildKingdomTable },
};
export const TABLE_IDS = Object.keys(TABLES);

export function buildTableById(id = 'forest') {
  return (TABLES[id] || TABLES.forest).build();
}
