function getPlayer(id, signups) {
  return signups?.get(id) || null;
}


function buildRosterFromFinal(raid) {
  const signups = raid.signups || new Map(); // safety fallback

  return {
    tanks: (raid.finalSelection?.tanks || [])
      .map(id => getPlayer(id, signups))
      .filter(Boolean),
    healers: (raid.finalSelection?.healers || [])
      .map(id => getPlayer(id, signups))
      .filter(Boolean),
    dps: (raid.finalSelection?.dps || [])
      .map(id => getPlayer(id, signups))
      .filter(Boolean)
  };
}

function escape(str = '') {
  if (!str) return '';

  const encoder = new TextEncoder(); // Built-in in Node.js and modern browsers
  const bytes = encoder.encode(str);

  let result = '';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    if (/[\w\s]/.test(char)) {
      // Safe ASCII alphanumeric, underscore, or whitespace → leave as-is
      result += char;
    } else {
      // Everything else → percent-encode the byte (padded, uppercase)
      result += '%' + byte.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return result;
}

export function generateExport(raid) {
  if (!raid) return '';

  const parts = [];

  parts.push(`R:${escape(raid.name)}`);

  const tanks = raid.slots?.tanks || 0;
  const healers = raid.slots?.healers || 0;
  const dps = raid.slots?.dps || 0;
  parts.push(`|S:${tanks};${healers};${dps}`);


  const roster = buildRosterFromFinal(raid);
  const rosterFlat = [
    ...roster.tanks,
    ...roster.healers,
    ...roster.dps
  ].slice(0, 40);

  for (const r of rosterFlat) {
    if (!r?.name || !r?.className) continue;
    const reserveIds = r.reserves ? r.reserves.map(re => re.id).join('|') : '';
    parts.push(`~N:${escape(`${r.name};${r.className};${r.spec};${reserveIds}`)}`);
  }

  return parts.join('');
}

export function generateRosterExport(raid) {
  if (!raid) return '';

  const parts = [];

  const roster = buildRosterFromFinal(raid);
  const rosterFlat = [
    ...roster.tanks,
    ...roster.healers,
    ...roster.dps
  ].slice(0, 40);

  for (const r of rosterFlat) {
    if (!r?.name || !r?.className) continue;
    const reserveIds = r.reserves ? r.reserves.map(re => re.id).join('|') : '';
    parts.push(`~N:${escape(`${r.name};${r.className};${r.spec};${reserveIds}`)}`);
  }

  return parts.join('');
}