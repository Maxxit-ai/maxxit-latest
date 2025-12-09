#!/usr/bin/env ts-node
/**
 * Load Ostium pairs JSON into NeonDB table ostium_available_pairs.
 * Usage: ts-node scripts/sync-ostium-available-pairs.ts path/to/ostium-pairs.json
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

interface PairInput {
  id: number | string;
  symbol?: string;
  maxLeverage?: number | string;
  makerMaxLeverage?: number | string;
  group?: string | null;
}

function toNumber(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return Number.isNaN(num) ? null : num;
}

async function main() {
  const jsonPath = process.argv[2] || 'ostium-pairs-20251208-130226.json';
  const resolved = path.resolve(jsonPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  const data = JSON.parse(raw) as PairInput[];

  console.log(`🔄 Loading ${data.length} pairs from ${resolved}`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const pair of data) {
    const idNum = Number(pair.id);
    const symbol = pair.symbol || '';
    const maxLev = toNumber(pair.maxLeverage);
    const makerMaxLev = toNumber((pair as any).makerMaxLeverage);
    const group = pair.group || null;

    if (!symbol || Number.isNaN(idNum)) {
      console.warn(`  ⚠️  Skipping invalid entry: ${JSON.stringify(pair)}`);
      errors++;
      continue;
    }

    try {
      const res = await prisma.ostium_available_pairs.upsert({
        where: { id: idNum },
        update: {
          symbol,
          max_leverage: maxLev,
          maker_max_leverage: makerMaxLev,
          group,
        },
        create: {
          id: idNum,
          symbol,
          max_leverage: maxLev,
          maker_max_leverage: makerMaxLev,
          group,
        },
      });

      if (res.created_at.getTime() === res.updated_at.getTime()) created++;
      else updated++;
      console.log(`  ✅ ${symbol} (id ${idNum})`);
    } catch (err: any) {
      console.error(`  ❌ ${symbol} (id ${idNum}): ${err.message}`);
      errors++;
    }
  }

  console.log('\nSummary');
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors:  ${errors}`);
  console.log(`  Total:   ${data.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });

