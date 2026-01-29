const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CLASS_EMOJIS = {
  Warrior: '🪓',
  Paladin: '🔨',
  Hunter: '🏹',
  Rogue: '🗡️',
  Priest: '🙏',
  Shaman: '⚡',
  Mage: '🔥',
  Warlock: '😈',
  Druid: '🐻',
  DeathKnight: '💀',
};

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


export function renderFinalRosterView(raid, isAdmin) {
  const hasImportFile =
    !!raid.importStringFile &&
    Buffer.isBuffer(raid.importStringFile.data) &&
    raid.importStringFile.data.length > 0 &&
    typeof raid.importStringFile.filename === 'string';

  const embed = new EmbedBuilder()
    .setTitle(`Final Roster: ${raid.name}`)
    .setDescription('🔒 **Final Roster**');

  const buildRole = (roleKey, title) => {
    const ids = raid.finalSelection[roleKey] || [];

    if (!ids.length) {
      embed.addFields({ name: title, value: '_None_', inline: true });
      return;
    }

    const players = ids
      .map(id => raid.signups.get(id))
      .filter(Boolean)
      .sort((a, b) => {
        const orderA = CLASS_ORDER.indexOf(a.className);
        const orderB = CLASS_ORDER.indexOf(b.className);
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

    const lines = players.map(s => {
      const emoji = CLASS_EMOJIS[s.className] || '❓';
      return `${emoji} **${s.name}**`;
    });

    embed.addFields({
      name: title,
      value: lines.join('\n'),
      inline: true,
    });
  };


  buildRole('tanks', '🛡️ Tanks');
  buildRole('healers', '💚 Healers');
  buildRole('dps', '⚔️ DPS');

  const rows = [];

  if (isAdmin) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('raid_upload_import')
          .setLabel('Upload Import String')
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  if (hasImportFile) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('raid_download_import')
          .setLabel('Download Import String')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return { embeds: [embed], components: rows };
}
