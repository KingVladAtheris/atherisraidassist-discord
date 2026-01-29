// parsedata.js (fixed with correct path imports)
import { readFileSync } from 'fs';
import { dirname, join } from 'path'; // Added dirname here
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename); // Now works

let items = [];

try {
  const dataPath = join(__dirname, 'data', 'itemdata.json'); // Adjust if filename different
  const rawData = JSON.parse(readFileSync(dataPath, 'utf-8'));

  if (!Array.isArray(rawData)) {
    throw new Error('data.json is not an array');
  }

  items = rawData
    .filter(item => item && item.itemId && item.name && typeof item.name === 'string')
    .map(item => ({
      id: item.itemId,
      name: item.name.trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)); // Optional alphabetical sort

  console.log(`Successfully parsed ${items.length} items from data.json`);
} catch (error) {
  console.error('Failed to parse data.json:', error.message);
  console.warn('Falling back to minimal placeholder items');

}

export default items;