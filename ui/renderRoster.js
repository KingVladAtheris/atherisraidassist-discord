export function renderRoster(raid) {
  const attend = [];
  const maybe = [];
  const absent = [];

  for (const s of raid.signups.values()) {
    const line = `• ${s.name} (${s.className} – ${s.spec})`;
    if (s.status === 'attend') attend.push(line);
    else if (s.status === 'maybe') maybe.push(line);
    else absent.push(line);
  }

  return [
    '**Attend**',
    attend.length ? attend.join('\n') : '_None_',
    '',
    '**Maybe**',
    maybe.length ? maybe.join('\n') : '_None_',
    '',
    '**Absent**',
    absent.length ? absent.join('\n') : '_None_',
  ].join('\n');
}
