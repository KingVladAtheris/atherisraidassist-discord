import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

// More accurate/representative unicode emojis for WoW classes (best possible without custom)
const CLASS_EMOJIS = {
  Warrior: '🪓',   // Axe (your current choice)
  Paladin: '🔨',   // Hammer (Holy/Ret)
  Hunter: '🏹',    // Bow
  Rogue: '🗡️',    // Dagger
  Priest: '🙏',    // Praying hands
  Shaman: '⚡',    // Lightning
  Mage: '🔥',     // Fire (arcane/frost intensity)
  Warlock: '😈',   // Devil
  Druid: '🐻',    // Bear
  DeathKnight: '💀', // Skull — perfect unholy/death theme (iconic for DK)
};

// Standard class order for sorting
const CLASS_ORDER = [
  'Warrior',
  'DeathKnight',
  'Paladin',
  'Druid',
  'Priest',
  'Shaman',
  'Hunter',
  'Rogue',
  'Mage',
  'Warlock',
];

function hasFinalRoster(raid) {
  return (
    raid.finalSelection.tanks.length ||
    raid.finalSelection.healers.length ||
    raid.finalSelection.dps.length
  );
}

export function renderRaidView(raid) {
  const embed = new EmbedBuilder()
    .setTitle(`Raid: ${raid.name}`);
  
  // Top row: Status | Slots | Soft Reserves (always shown, inline for alignment)
  embed.addFields(
    {
      name: 'Status',
      value: raid.locked ? '🔒 Locked' : '🟢 Open',
      inline: true,
    },
    {
      name: 'Slots',
      value: `T:${raid.slots.tanks} H:${raid.slots.healers} D:${raid.slots.dps}`,
      inline: true,
    },
    {
      name: 'Soft Reserves',
      value: `T:${raid.softReserveLimits.tanks} H:${raid.softReserveLimits.healers} D:${raid.softReserveLimits.dps}`,
      inline: true,
    }
  );

  // 3-column attend with sorting + bold names + icons
  const { tanks, healers, dps } = buildRoleFields(raid);

  embed.addFields(
    { name: '🛡️ Tanks', value: tanks || '_None_', inline: true },
    { name: '💚 Healers', value: healers || '_None_', inline: true },
    { name: '⚔️ DPS', value: dps || '_None_', inline: true }
  );

  // Maybe / Absent: flat, with icons + bold names
  embed.addFields(
    buildSimpleRosterField(raid, 'maybe', '🟡 Maybe'),
    buildSimpleRosterField(raid, 'absent', '🔴 Absent')
  );

  embed.setTimestamp();

  const rows = [];

  if (!raid.locked) {
    // Open state buttons
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('raid_manage').setLabel('Manage Signup').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('raid_delete_signup').setLabel('Delete Signup').setStyle(ButtonStyle.Danger)
      )
    );

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('raid_set_sr').setLabel('Set Soft Reserve Limits').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('raid_close').setLabel('Close Raid').setStyle(ButtonStyle.Danger)
      )
    );
  } else {
    // Locked state buttons
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('raid_finalize_tanks').setLabel('Finalize Tanks').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('raid_finalize_healers').setLabel('Finalize Healers').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('raid_finalize_dps').setLabel('Finalize DPS').setStyle(ButtonStyle.Primary)
      )
    );

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('finalize_confirm').setLabel('Confirm Roster').setStyle(ButtonStyle.Success)
      )
    );

    if (hasFinalRoster(raid)) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('raid_publish').setLabel('Publish Raid').setStyle(ButtonStyle.Success)
        )
      );
    }

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('raid_export_full').setLabel('Export Raid').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('raid_export_roster').setLabel('Export Roster').setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return { embeds: [embed], components: rows };
}

/* helpers */
function buildRoleFields(raid) {
  const attend = [...raid.signups.values()].filter(s => s.status === 'attend');

  const tanks = attend.filter(s => s.spec === 'Tank');
  const healers = attend.filter(s => s.spec === 'Healer');
  const dps = attend.filter(s => s.spec === 'DPS');

  const sortPlayers = (list) => {
    return list.sort((a, b) => {
      const orderA = CLASS_ORDER.indexOf(a.className);
      const orderB = CLASS_ORDER.indexOf(b.className);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  };

  const formatList = (list) => {
    if (!list.length) return '_None_';

    const sorted = sortPlayers(list);

    return sorted
      .map(s => {
        const emoji = CLASS_EMOJIS[s.className] || '❓';
        const reserves = s.reserves.length
          ? ` [${s.reserves.slice(0, 2).map(r => r.name).join(', ')}${s.reserves.length > 2 ? '...' : ''}]`
          : '';
        return `${emoji} **${s.name}**`;
      })
      .join('\n');
  };

  return {
    tanks: formatList(tanks),
    healers: formatList(healers),
    dps: formatList(dps),
  };
}

function buildSimpleRosterField(raid, status, title) {
  const entries = [...raid.signups.values()]
    .filter(s => s.status === status)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => {
      const emoji = CLASS_EMOJIS[s.className] || '❓';
      return `${emoji} **${s.name}**`;
    });

  return {
    name: title,
    value: entries.length ? entries.join('\n') : '_None_',
    inline: false,
  };
}