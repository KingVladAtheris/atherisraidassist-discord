require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  InteractionType,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

const mongoose = require("mongoose");
const Raid = require("./models/Raid");

const {
  createRaid,
  closeRaid,
  exportRaid,
  exportRoster,
} = require("./core/raidManager");

const {
  handleSignupSubmit,
  handleSignupSelect,
} = require("./core/signupManager");

const { renderRaidView } = require("./ui/renderRaidView");
const { renderFinalRosterView } = require("./ui/renderFinalRosterView");

const items = require("./parsedata");


async function getRaid(channelId) {
  return await Raid.findOne({ channelId });
}

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 1. Global unhandled rejection handler (VERY IMPORTANT)
// ──────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
  console.error('【UNHANDLED REJECTION】', {
    reason: reason?.stack || reason,
    promise
  });
  // Optional: send to discord webhook / logging service here
});


// ──────────────────────────────────────────────────────────────────────────────
// 2. Safe interaction wrapper - automatic defer + structured error handling
// ──────────────────────────────────────────────────────────────────────────────
async function safeHandleInteraction(interaction, handlerFn) {
  // Early exit for non-repliable interactions (rare but possible)
  if (!interaction.isRepliable() && !interaction.isAutocomplete()) {
    console.warn(`Non-repliable interaction received: ${interaction.id}`);
    return;
  }

  let deferred = false;

  try {
    // Decide defer strategy based on interaction type
    if (!interaction.deferred && !interaction.replied) {
      try {
        if (interaction.isChatInputCommand() || interaction.isModalSubmit() || interaction.isAutocomplete()) {
          // Autocomplete has only 3 seconds → don't defer, handle fast
          if (!interaction.isAutocomplete()) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          }
        }
        deferred = true;
      } catch (deferErr) {
        console.warn("Failed to defer interaction:", deferErr.message);
      }
    }

    // Execute the actual handler
    await handlerFn(interaction);

  } catch (error) {
    console.error("Interaction handler error:", {
      interactionId: interaction.id,
      type: interaction.type,
      customId: interaction.customId ?? null,
      commandName: interaction.commandName ?? null,
      user: `${interaction.user.tag} (${interaction.user.id})`,
      channel: interaction.channelId,
      guild: interaction.guildId,
      error: error.stack || error.message
    });

    const errorMessage = "Sorry, something broke internally 😓 Please try again later.";

    // Try to respond even if things are already messed up
    try {
      if (interaction.deferred || interaction.replied) {
        await safeEditReply(interaction, {
          content: errorMessage,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      } else if (!interaction.isAutocomplete()) { // autocomplete can't be replied late
        await safeReply(interaction, {
          content: errorMessage,
          flags: MessageFlags.Ephemeral
        }).catch(() => {});
      }
    } catch (followUpError) {
      console.error("Also failed to send error message:", followUpError.message);
    }
  }
}


// ──────────────────────────────────────────────────────────────────────────────
// 3. Helper - safer message operations
// ──────────────────────────────────────────────────────────────────────────────
async function safeFetchMessage(channel, messageId) {
  try {
    return await channel.messages.fetch(messageId);
  } catch {
    return null;
  }
}

async function safeEditMessage(message, options) {
  try {
    await message.edit(options);
    return true;
  } catch (err) {
    console.warn(`Failed to edit message ${message.id}:`, err.message);
    return false;
  }
}

async function safeSend(channel, options) {
  try {
    return await channel.send(options);
  } catch (err) {
    console.warn("Failed to send message:", err.message);
    return null;
  }
}

async function safeReply(interaction, options) {
  try {
    return await interaction.reply(options);
  } catch (err) {
    console.warn("safeReply failed:", err.message);
    return null;
  }
}

async function safeEditReply(interaction, options) {
  try {
    await interaction.editReply(options);
    return true;
  } catch (err) {
    console.warn("safeEditReply failed:", err.message);
    return false;
  }
}

async function safeUpdate(interaction, options) {
  try {
    await interaction.update(options);
    return true;
  } catch (err) {
    console.warn("safeUpdate failed:", err.message);
    return false;
  }
}

async function safeFollowUp(interaction, options) {
  try {
    return await interaction.followUp(options);
  } catch (err) {
    console.warn("safeFollowUp failed:", err.message);
    return null;
  }
}

async function safeNoOpEdit(interaction) {
  try {
    await interaction.editReply({
      content: interaction.message?.content || null,
      embeds: interaction.message?.embeds || [],
      components: interaction.message?.components || [],
    });
  } catch (err) {
    console.warn("safeNoOpEdit failed:", err.message);
  }
}

/* Listen for upload */
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.attachments.size) return;

    const raid = await getRaid(message.channelId);
    if (!raid || !raid.publishedMessageId) return;

    if (!message.member?.permissions.has('ManageGuild')) return;

    const attachment = message.attachments.first();
    if (!attachment) return;

    // ── Hard enforce .txt only ───────────────────────────────────────
    const filenameLower = attachment.name.toLowerCase();
    if (!filenameLower.endsWith('.txt')) {
      await message.reply({
        content: '❌ Only **.txt** files are allowed for import strings.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
      return;
    }

    // Optional: extra safety - reject if filename is suspicious or too long
    if (attachment.name.length > 150 || attachment.size > 1024 * 1024 * 2) { // 2MB limit
      await message.reply({
        content: '❌ File rejected: name too long or file too large (max 2MB).',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
      return;
    }

    // ── Proceed with download ────────────────────────────────────────
    let res;
    try {
      res = await fetch(attachment.url, { 
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (fetchErr) {
      console.error('Failed to fetch attachment:', fetchErr);
      await message.reply('❌ Failed to download the file. Try again?').catch(() => {});
      return;
    }

    let buffer;
    try {
      buffer = Buffer.from(await res.arrayBuffer());
    } catch (bufferErr) {
      console.error('Buffer error:', bufferErr);
      await message.reply('❌ Could not process the file.').catch(() => {});
      return;
    }

    

    // ── Save ──────────────────────────────────────────────────────────
    raid.importStringFile = {
      filename: attachment.name,
      data: buffer
    };
    await raid.save();

    // Update published message
    const published = await safeFetchMessage(message.channel, raid.publishedMessageId);
    if (published) {
      await safeEditMessage(published, renderFinalRosterView(raid, true));
    }

    await message.reply('✅ Import string uploaded and published!').catch(() => {});

  } catch (err) {
    console.error('Upload handler error:', err);
    await message.reply('❌ Something went wrong while processing the upload...').catch(() => {});
  }
});



// In index.js - add/replace in client.once('ready', async () => { ... })
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 7500,
    socketTimeoutMS: 45000,
    family: 4,                    
    retryWrites: true,
    w: 'majority'
    });
    console.log('✅ Successfully connected to MongoDB Atlas!');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1); // optional: stop bot if DB fails
  }

  // Global registration for both commands
  const commands = [];

  // /raid (admin-only: requires Manage Server permission)
  commands.push({
    name: 'raid',
    description: 'Raid management (admin only)',
    default_member_permissions: '32', // Bitfield for ManageGuild (0x00000020)
    // Alternative: PermissionsBitField.Flags.ManageGuild (if importing PermissionsBitField)
    options: [{
      type: 1, // Subcommand
      name: 'create',
      description: 'Create a new raid signup',
      options: [
        { type: 3, name: 'name', description: 'Raid name (e.g., MC)', required: true },
        { type: 4, name: 'tanks', description: 'Tank slots', required: true, min_value: 0 },
        { type: 4, name: 'healers', description: 'Healer slots', required: true, min_value: 0 },
        { type: 4, name: 'dps', description: 'DPS slots', required: true, min_value: 0 },
      ],
    }],
  });


  // /softreserve (user-facing, no permission restrict)
  commands.push({
    name: 'softreserve',
    description: 'Manage your soft reserves for the raid',
    options: [
      {
        type: 1,
        name: 'add',
        description: 'Add an item to your soft reserves',
        options: [{
          type: 3,
          name: 'item',
          description: 'Item name',
          required: true,
          autocomplete: true,
        }],
      },
      {
        type: 1,
        name: 'list',
        description: 'List your current soft reserves',
      },
      {
        type: 1,
        name: 'remove',
        description: 'Remove an item from your soft reserves',
        options: [{
          type: 3,
          name: 'item',
          description: 'Item to remove',
          required: true,
          autocomplete: true,
        }],
      },
      {
        type: 1,
        name: 'clear',
        description: 'Clear all your soft reserves',
      },
    ],
  });

  // Register all globally (one efficient call)
  await client.application?.commands.set(commands);
  console.log('Global slash commands registered (/raid admin-only, /softreserve for all)');
});





client.on('interactionCreate', async (interaction) => {
  await safeHandleInteraction(interaction, async (i) => {
    const raid = await getRaid(i.channelId).catch(() => null);
    if (!raid && !i.isAutocomplete()) {
      if (i.isRepliable()) {
        await i.reply({ content: "No active raid in this channel.", flags: MessageFlags.Ephemeral })
          .catch(() => {});
      }
      return;
    }

    /* INTERACTIONS */

    /* Create Raid */
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'raid' &&
      interaction.options.getSubcommand() === 'create'
    ) {
      if (!interaction.member.permissions.has('ManageGuild')) {
        return safeReply(interaction, {
          content: 'You need Manage Server permission.',
          flags: MessageFlags.Ephemeral
        });
      }

      const name = interaction.options.getString('name');
      const tanks = interaction.options.getInteger('tanks');
      const healers = interaction.options.getInteger('healers');
      const dps = interaction.options.getInteger('dps');

      // 0. Fetch existing raid FIRST
      const existingRaid = await getRaid(interaction.channelId);
      const oldRaidMessageId = existingRaid?.messageId || null;
      const oldPublishedMessageId = existingRaid?.publishedMessageId || null;

      // 1. Create or overwrite the raid
      const raid = await createRaid({
        channelId: interaction.channelId,
        name,
        slots: { tanks, healers, dps }
      });

      // 2. Send the NEW raid embed
      const newMsg = await safeSend(interaction.channel, renderRaidView(raid));
      if (!newMsg) {
        await safeEditReply(interaction, { content: "Failed to create raid message (permission/API issue?)" });
        return;
      }

      raid.messageId = newMsg.id;
      raid.publishedMessageId = null;
      await raid.save().catch(console.error);

      // Safer cleanup of old messages
      const delay = ms => new Promise(r => setTimeout(r, ms));
      const removeButtons = async (messageId) => {
      if (!messageId) return;
      const msg = await safeFetchMessage(interaction.channel, messageId);
      if (msg) {
        await safeEditMessage(msg, { components: [] });
        await delay(350); // crude but effective
      }
      };

      await removeButtons(oldRaidMessageId);
      await removeButtons(oldPublishedMessageId);

      await safeEditReply(interaction, {
        content: `Raid "${name}" ${oldRaidMessageId ? 'updated' : 'created'} successfully!`
      });

      return;
    }



    /* Publish Final Roster */
    if (interaction.isButton() && interaction.customId === 'raid_publish') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.member.permissions.has('ManageGuild')) {
        return safeEditReply(interaction, { content: 'No permission.' });
      }

      const isEmpty =
        !raid.finalSelection.tanks.length &&
        !raid.finalSelection.healers.length &&
        !raid.finalSelection.dps.length;

      if (isEmpty) {
        return safeEditReply(interaction, {
          content: 'Finalize the roster before publishing.',
        });
      }

      const msg = await safeSend(interaction.channel, renderFinalRosterView(raid, true));
      if (!msg) {
        await safeEditReply(interaction, { content: 'Failed to publish roster (API/permission issue)' });
        return;
      }

      raid.publishedMessageId = msg.id;
      await raid.save().catch(console.error);

      await safeEditReply(interaction, { content: '✅ Final roster published.' });
      return;
    }

    /* Raid Import String Upload */
    if (interaction.isButton() && interaction.customId === 'raid_upload_import') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.member.permissions.has('ManageGuild')) return;

      await safeEditReply(interaction, {
        content: '📎 Upload a `.txt` file containing the import string.',
      });

      return;
    }

    /* Raid Import String Download */
    if (interaction.isButton() && interaction.customId === 'raid_download_import') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!raid.importStringFile) {
        return safeEditReply(interaction, { content: 'No import string available.' });
      }

      await safeEditReply(interaction, {
        content: '📥 Import string:',
        files: [{
          attachment: raid.importStringFile.data,
          name: raid.importStringFile.filename,
        }],
      });

      return;
    }



    // Slash command /softreserve (must be in raid channel)
    if (interaction.isChatInputCommand() && interaction.commandName === 'softreserve') {
      if (!raid || raid.locked) {
        return safeEditReply(interaction, { content: 'No open raid in this channel.' });
      }

      const signup = raid.signups.get(interaction.user.id);
      if (!signup) {
        return safeEditReply(interaction, { content: 'You must sign up first.' });
      }

      const sub = interaction.options.getSubcommand();

      const roleMap = { Tank: 'tanks', Healer: 'healers', DPS: 'dps' };
      const specKey = roleMap[signup.spec] || 'dps'; // Fallback to dps
      const limit = raid.softReserveLimits[specKey] || 0;

      if (sub === 'add') {
        const itemIdStr = interaction.options.getString('item');
        const itemId = Number(itemIdStr);
        const item = items.find(i => i.id === itemId);
        if (!item) return safeEditReply(interaction, { content: 'Invalid item.' });

        if (signup.reserves.length >= limit) {
          return safeEditReply(interaction, { content: `Limit reached (${limit} items).` });
        }

        if (signup.reserves.some(r => r.id === itemId)) {
          return safeEditReply(interaction, { content: 'You already reserved this item.' });
        }

        signup.reserves.push({ id: itemId, name: item.name });
        await raid.save();
        await safeEditReply(interaction, { content: `Added **${item.name}** to your reserves (${signup.reserves.length}/${limit}).` });
        await updateRaidMessage(interaction.channel, raid, interaction.member);
      } else if (sub === 'list') {
        if (signup.reserves.length === 0) {
          return safeEditReply(interaction, { content: 'No soft reserves yet.' });
        }

        const list = signup.reserves.map((r, i) => `${i+1}. ${r.name}`).join('\n');
        await safeEditReply(interaction, { content: `Your soft reserves (${signup.reserves.length}/${limit}):\n${list}` });
      } else if (sub === 'remove') {
        const itemIdStr = interaction.options.getString('item');
        const itemId = Number(itemIdStr);
        const index = signup.reserves.findIndex(r => r.id === itemId);
        if (index === -1) return safeEditReply(interaction, { content: 'Item not in your reserves.' });

        const removed = signup.reserves.splice(index, 1)[0];
        await raid.save();
        await safeEditReply(interaction, { content: `Removed **${removed.name}** from your reserves.` });
        await updateRaidMessage(interaction.channel, raid, interaction.member);
      } else if (sub === 'clear') {
        signup.reserves = [];
        await raid.save();
        await safeEditReply(interaction, { content: 'Cleared all soft reserves.' });
        await updateRaidMessage(interaction.channel, raid, interaction.member);
      }

      return;
    }

    // Autocomplete for /softreserve
    if (interaction.isAutocomplete() && interaction.commandName === 'softreserve') {
      console.log('Autocomplete triggered!', {
        focused: interaction.options.getFocused(true),
        sub: interaction.options.getSubcommand(false)
      });

      let choices = [];

      const raid = await getRaid(interaction.channelId);
      console.log('Raid found?', !!raid);

      const signup = raid ? raid.signups.get(interaction.user.id) : null;
      console.log('Signup found?', !!signup);

      const focused = interaction.options.getFocused(true);
      if (focused.name === 'item' && raid && !raid.locked && signup) {
        const sub = interaction.options.getSubcommand(false);

        console.log('Subcommand:', sub);

        if (sub === 'remove') {
          choices = signup.reserves
            .filter(r => r && r.name)
            .map(r => ({ name: r.name.slice(0, 100), value: r.id.toString() }));
          console.log('Remove choices count:', choices.length);
        } else {
          const query = (focused.value || '').toLowerCase().trim();
          let filtered = items.filter(i => i?.name?.toLowerCase().includes(query));
          filtered = filtered.slice(0, 25);
          choices = filtered.map(i => ({
            name: i.name.slice(0, 100),
            value: i.id.toString(),
          }));
          console.log('Search choices count:', choices.length);
        }
      }

      console.log('Final choices count:', choices.length);
      await interaction.respond(choices).catch(err => {
        console.error('Respond failed:', err);
      });
      return;
    }

    if (!raid) return;

    /* SET SOFT RESERVE LIMITS */
    if (interaction.isButton() && interaction.customId === 'raid_set_sr') {
      if (!interaction.member.permissions.has('ManageGuild')) {
        return safeReply(interaction, { content: 'No permission.', flags: MessageFlags.Ephemeral });
      }

      if (raid.locked) return;

      const modal = new ModalBuilder()
        .setCustomId('raid_sr_limits_modal')
        .setTitle('Set Soft Reserve Limits')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('sr_tanks')
              .setLabel('Tanks limit')
              .setStyle(TextInputStyle.Short)
              .setValue(raid.softReserveLimits.tanks.toString())
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('sr_healers')
              .setLabel('Healers limit')
              .setStyle(TextInputStyle.Short)
              .setValue(raid.softReserveLimits.healers.toString())
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('sr_dps')
              .setLabel('DPS limit')
              .setStyle(TextInputStyle.Short)
              .setValue(raid.softReserveLimits.dps.toString())
              .setRequired(false)
          )
        );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'raid_sr_limits_modal') {
      
      if (!interaction.member.permissions.has('ManageGuild')) return;

      raid.softReserveLimits = {
        tanks: Number(interaction.fields.getTextInputValue('sr_tanks')) || 0,
        healers: Number(interaction.fields.getTextInputValue('sr_healers')) || 0,
        dps: Number(interaction.fields.getTextInputValue('sr_dps')) || 0,
      };
      await raid.save();

      await safeEditReply(interaction, { content: 'Soft reserve limits updated.', flags: MessageFlags.Ephemeral });
      await updateRaidMessage(interaction.channel, raid, interaction.member);
      return;
    }

    /* MANAGE SIGNUP */
    if (interaction.isButton() && interaction.customId === 'raid_manage') {
      if (raid.locked) {
        return safeReply(interaction, { content: 'Raid is closed.', flags: MessageFlags.Ephemeral });
      }

      const signup = raid.signups.get(interaction.user.id);

      const components = buildSignupComponents(true); // include confirm

      if (!signup) {
        const modal = new ModalBuilder()
          .setCustomId('raid_signup_modal')
          .setTitle('Raid Signup')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('charName')
                .setLabel('Character Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        return interaction.showModal(modal);
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await safeEditReply(interaction, {
        content: `Update signup for **${signup.name}**`,
        components,
      });
      return;
    }

    /* SIGNUP CONFIRM */
    if (interaction.isButton() && interaction.customId === 'signup_confirm') {
      await interaction.deferUpdate();

      const signup = raid.signups.get(interaction.user.id);
      if (!signup) return;

      if (!signup.className || !signup.spec) {
        return safeFollowUp(interaction, { content: 'Please select a class and spec first.', flags: MessageFlags.Ephemeral });
      }

      const roleMap = { Tank: 'tanks', Healer: 'healers', DPS: 'dps' };
      const specKey = roleMap[signup.spec] || 'dps'; // Fallback to dps
      const limit = raid.softReserveLimits[specKey] || 0;

      const summary = `✅ You are signed up as **${signup.name}** (${signup.className} - ${signup.spec} - ${signup.status})`;

      const reserveText = limit > 0 
        ? `\n\nSoft Reserves: You may reserve up to **${limit}** items.\nUse these commands in this channel:\n• /softreserve add <item>\n• /softreserve list\n• /softreserve remove <item>\n• /softreserve clear`
        : '';

      const changeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('signup_change')
          .setLabel('Change Signup')
          .setStyle(ButtonStyle.Primary)
      );

      await safeEditReply(interaction, {
        content: summary + reserveText,
        components: [changeRow],
      });
      await updateRaidMessage(interaction.channel, raid, interaction.member);
      return;
    }

    /* SIGNUP CHANGE */
    if (interaction.isButton() && interaction.customId === 'signup_change') {
      await interaction.deferUpdate();

      const components = buildSignupComponents(true);
      await safeEditReply(interaction, {
        content: 'Update your signup',
        components,
      });
      return;
    }

    /* MODAL SUBMIT */
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'raid_signup_modal') {
      
      if (raid.locked) {
        return safeReply(interaction, { content: 'Raid is closed.', flags: MessageFlags.Ephemeral });
      }

      const changed = handleSignupSubmit({
        raid,
        userId: interaction.user.id,
        charName: interaction.fields.getTextInputValue('charName'),
      });
      if (changed) {
        await raid.save();   
      }

      const components = buildSignupComponents(true);

      await safeEditReply(interaction, {
        content: 'Complete your signup:',
        components,
      });

      if (changed) await updateRaidMessage(interaction.channel, raid, interaction.member);
    }

    /* SELECT MENUS */
    if (interaction.isStringSelectMenu()) {
      await interaction.deferUpdate();

      const fieldMap = {
        signup_className: 'className',
        signup_spec: 'spec',
        signup_status: 'status',
      };

      const field = fieldMap[interaction.customId];
      if (!field) {
        await safeNoOpEdit(interaction);
        return;
      }

      const changed = handleSignupSelect({
        raid,
        userId: interaction.user.id,
        field,
        value: interaction.values[0],
      });

      if (changed) {
        await raid.save();
        await updateRaidMessage(interaction.channel, raid, interaction.member);
      }

      // Get the fresh/current signup data
      const currentSignup = raid.signups.get(interaction.user.id);

      // Re-render with current selections preserved
      await safeEditReply(interaction, {
        content: 'Update your signup',  // or whatever message you prefer
        components: buildSignupComponents(currentSignup, true),
      });
    }
    /* DELETE SIGNUP - INITIAL CLICK */
      if (interaction.isButton() && interaction.customId === 'raid_delete_signup') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (raid.locked) {
          return safeEditReply(interaction, { content: 'Raid is closed.' });
        }

        const signup = raid.signups.get(interaction.user.id);

        if (!signup) {
          return safeEditReply(interaction, { content: 'You are not signed up for this raid.' });
        }

        // Show confirm buttons
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('raid_delete_confirm')
            .setLabel('Confirm Delete')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('raid_delete_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        return safeEditReply(interaction, {
          content: `Are you sure you want to **delete** your signup for **${raid.name}**?\nCharacter: ${signup.name} (${signup.className ?? 'Unknown'} ${signup.spec ?? ''})`,
          components: [confirmRow],
        });
      }

      /* DELETE CONFIRM */
      if (interaction.isButton() && interaction.customId === 'raid_delete_confirm') {
        await interaction.deferUpdate();

        const signup = raid.signups.get(interaction.user.id);

        if (!signup) {
          return safeFollowUp(interaction, { content: 'You are not signed up (already deleted?).', flags: MessageFlags.Ephemeral });
        }

        raid.signups.delete(interaction.user.id);
        await raid.save();

        await safeEditReply(interaction, {
          content: '✅ Your signup has been deleted.',
          components: [],
        });

        await updateRaidMessage(interaction.channel, raid, interaction.member);
        return;
      }

      /* DELETE CANCEL */
      if (interaction.isButton() && interaction.customId === 'raid_delete_cancel') {
        await interaction.deferUpdate();

        await safeEditReply(interaction, {
          content: 'Delete cancelled.',
          components: [],
        });
        return;
      }


      /* CLOSE RAID */
      if (interaction.isButton() && interaction.customId === 'raid_close') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          if (!interaction.member.permissions.has('ManageGuild')) {
            await safeEditReply(interaction, { content: 'No permission.' });
            return;
          }

          const raid = await getRaid(interaction.channelId);
          if (!raid || raid.locked) {
            await safeEditReply(interaction, { content: 'Cannot close raid.' });
            return;
          }

          // Close in DB
          await closeRaid(interaction.channelId);

          // CRITICAL: Re-fetch to get fresh data from DB
          const updatedRaid = await getRaid(interaction.channelId);
          console.log('After close — locked:', updatedRaid.locked);  // ← should log true

          // Update message with FRESH raid object
          await updateRaidMessage(interaction.channel, updatedRaid, interaction.member);

          await safeEditReply(interaction, { content: '✅ Raid closed.' });
        } catch (error) {
          console.error('Close raid error:', error);
          await safeEditReply(interaction, { content: 'Error closing raid.' });
        }
      }

      /* ROLE-SPECIFIC FINALIZE OPEN (raid_finalize_tanks, etc.) */
      if (interaction.isButton() && interaction.customId.startsWith('raid_finalize_')) {
        try {
          if (!interaction.member.permissions.has('ManageGuild')) {
            return safeReply(interaction, { content: 'No permission.', flags: MessageFlags.Ephemeral });
          }

          const raid = await getRaid(interaction.channelId);
          if (!raid || !raid.locked) {
            return safeReply(interaction, { content: 'Raid must be locked first.', flags: MessageFlags.Ephemeral });
          }

          // Make sure tempFinalize exists
          if (!raid.tempFinalize) {
            raid.tempFinalize = { role: null, page: 0 };
          }

          const roleKey = interaction.customId.split('_')[2]; // tanks / healers / dps
          const roleMap = { tanks: 'Tank', healers: 'Healer', dps: 'DPS' };
          const emojiMap = { tanks: '🛡️', healers: '💚', dps: '⚔️' };

          // Set current role we're editing
          raid.tempFinalize.role = roleKey;
          raid.tempFinalize.page = 0;
          await raid.save();

          // Defer reply for new ephemeral
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });

          // Show the UI in the NEW ephemeral message
          await showRoleFinalize(
            interaction,
            raid,
            roleKey,
            roleMap[roleKey],
            emojiMap[roleKey],
            false // first time → edit the deferred reply
          );

        } catch (error) {
          console.error('Finalize open error:', error);
          await safeReply(interaction, { content: 'Error opening finalize view.', flags: MessageFlags.Ephemeral });
        }

        return;
      }
    

    /* SLOT TOGGLE (in role view) */
    if (interaction.isButton() && interaction.customId.startsWith('slot_')) {
      if (!raid.tempFinalize?.role) return;

      await interaction.deferUpdate();

      const [, roleKey, userId] = interaction.customId.split('_');
      const roleName = { tanks: 'Tank', healers: 'Healer', dps: 'DPS' }[roleKey];
      const maxSlots = raid.slots[roleKey];

      const arr = raid.finalSelection[roleKey];
      const index = arr.indexOf(userId);

      let blocked = false;
      if (index === -1) { // Trying to add
        if (arr.length >= maxSlots) {
          blocked = true;
          await safeFollowUp(interaction, {
            content: `❌ Cannot select more than **${maxSlots}** ${roleName}s. Deselect someone first.`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          arr.push(userId);
        }
      } else { // Deselect
        arr.splice(index, 1);
      }
      await raid.save();

      const emojiMap = { tanks: '🛡️', healers: '💚', dps: '⚔️' };

      await showRoleFinalize(interaction, raid, roleKey, roleName, emojiMap[roleKey], true);
      return;
    }

    /* PAGINATION */
    if (interaction.isButton() && interaction.customId.startsWith('finalize_page_')) {
      if (!raid.tempFinalize?.role) return;

      await interaction.deferUpdate(); // ADD THIS – acknowledges instantly

      const parts = interaction.customId.split('_');
      const roleKey = parts[2];
      const direction = parts[3];

      if (raid.tempFinalize.role !== roleKey) return;

      const roleMap = { tanks: 'Tank', healers: 'Healer', dps: 'DPS' };
      const candidates = [...raid.signups.values()]
        .filter(s => s.status === 'attend' && s.spec === roleMap[roleKey]);

      const pageSize = 20;
      const maxPage = Math.ceil(candidates.length / pageSize) - 1;

      if (direction === 'prev') {
        raid.tempFinalize.page = Math.max(0, raid.tempFinalize.page - 1);
      } else if (direction === 'next') {
        raid.tempFinalize.page = Math.min(maxPage, raid.tempFinalize.page + 1);
      }
      await raid.save();

      const emojiMap = { tanks: '🛡️', healers: '💚', dps: '⚔️' };

      await showRoleFinalize(interaction, raid, roleKey, roleMap[roleKey], emojiMap[roleKey], true);
      return;
    }

    /* BACK BUTTON */
    if (interaction.isButton() && interaction.customId === 'finalize_back') {
      try {
        await interaction.deferUpdate();

        // Clear temp state
        const raid = await getRaid(interaction.channelId);
        if (raid) {
          raid.tempFinalize = { role: null, page: 0 };
          await raid.save();
        }

        // Simply delete the ephemeral finalize message
        await interaction.deleteReply().catch(() => {});

        // Optional: send a small confirmation
        // await safeFollowUp(interaction, { content: 'Returned to main raid view.', flags: MessageFlags.Ephemeral  });

      } catch (error) {
        console.error('Back button error:', error);
      }
      return;
    }


    /* CONFIRM FULL ROSTER */
    if (interaction.isButton() && interaction.customId === 'finalize_confirm') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.member.permissions.has('ManageGuild')) {
        return safeEditReply(interaction, { content: 'No permission.' });
      }

      if (!raid.locked) {
        return safeEditReply(interaction, { content: 'Raid must be closed before finalizing.' });
      }

      // Clean any stray values
      ['tanks', 'healers', 'dps'].forEach(role => {
        raid.finalSelection[role] = raid.finalSelection[role]?.filter(id => id !== 'none') || [];
      });

      const buildRosterFromFinalSelection = (raid) => {
        const makeRole = key =>
          (raid.finalSelection[key] || [])
            .map(id => raid.signups.get(id))
            .filter(s => s && s.name)
            .map(s => ({ name: s.name, className: s.className || 'Unknown', spec: s.spec || 'Unknown', reserves: s.reserves || [] }));

        return {
          tanks: makeRole('tanks'),
          healers: makeRole('healers'),
          dps: makeRole('dps'),
        };
      };

      raid.roster = buildRosterFromFinalSelection(raid);
      await raid.save();

      await safeEditReply(interaction, { content: '✅ Roster finalized and built.' });
      await updateRaidMessage(interaction.channel, raid, interaction.member);
      return;
    }

    /* EXPORT FULL */
    if (interaction.isButton() && interaction.customId === 'raid_export_full') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.member.permissions.has('ManageGuild')) {
        return safeEditReply(interaction, { content: 'No permission.' });
      }

      const text = await exportRaid(raid);
      const buffer = Buffer.from(text, 'utf-8');

      await safeEditReply(interaction, {
        content: 'Full raid export attached below:',
        files: [{ attachment: buffer, name: `${raid.name.replace(/[^a-z0-9]/gi, '_')}_full_export.txt` }],
      });
    }

    /* EXPORT ROSTER */
    if (interaction.isButton() && interaction.customId === 'raid_export_roster') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!interaction.member.permissions.has('ManageGuild')) {
        return safeEditReply(interaction, { content: 'No permission.' });
      }

      const text = await exportRoster(raid);
      const buffer = Buffer.from(text, 'utf-8');

      await safeEditReply(interaction, {
        content: 'Roster export attached below:',
        files: [{ attachment: buffer, name: `${raid.name.replace(/[^a-z0-9]/gi, '_')}_roster_export.txt` }],
      });
    }
  })
});

/* HELPERS */
function buildSignupComponents(signup = null, includeConfirm = false) {
  const rows = [];

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('signup_className')
        .setPlaceholder('Class')
        .addOptions(
          ['Warrior','Paladin','Hunter','Rogue','Priest','Shaman','Mage','Warlock','Druid','DeathKnight']
            .map(c => ({
              label: c,
              value: c,
              default: signup?.className === c
            }))
        )
    )
  );

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('signup_spec')
        .setPlaceholder('Spec')
        .addOptions(
          [
            { label: 'Tank', value: 'Tank', default: signup?.spec === 'Tank' },
            { label: 'Healer', value: 'Healer', default: signup?.spec === 'Healer' },
            { label: 'DPS', value: 'DPS', default: signup?.spec === 'DPS' }
          ]
        )
    )
  );

  rows.push(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('signup_status')
        .setPlaceholder('Status')
        .addOptions(
          [
            { label: 'Attend', value: 'attend', default: signup?.status === 'attend' },
            { label: 'Maybe', value: 'maybe', default: signup?.status === 'maybe' },
            { label: 'Absent', value: 'absent', default: signup?.status === 'absent' }
          ]
        )
    )
  );

  if (includeConfirm) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('signup_confirm')
          .setLabel('Confirm Signup')
          .setStyle(ButtonStyle.Success)
      )
    );
  }

  return rows;
}

async function showRoleFinalize(interaction, raid, roleKey, roleName, emoji, isUpdate = false) {
  let candidates = [...raid.signups.values()]
    .filter(s => s.status === 'attend' && s.spec === roleName);

  // Sort candidates by class order, then name
  candidates = candidates.sort((a, b) => {
    const orderA = CLASS_ORDER.indexOf(a.className || 'Unknown');
    const orderB = CLASS_ORDER.indexOf(b.className || 'Unknown');
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  const pageSize = 20;
  const page = raid.tempFinalize?.page || 0;
  const paginated = candidates.slice(page * pageSize, (page + 1) * pageSize);

  // ── 1. Split selected / unselected ───────────────────────────────
  const selectedUsers = [];
  const unselectedUsers = [];

  for (const s of candidates) {
    if (raid.finalSelection[roleKey].includes(s.userId)) {
      selectedUsers.push(s);
    } else {
      unselectedUsers.push(s);
    }
  }

  // For pagination we still use full candidates list, but show selected first
  const displayOrder = [...selectedUsers, ...unselectedUsers];
  const paginatedDisplay = displayOrder.slice(page * pageSize, (page + 1) * pageSize);

  // ── 2. Build class count summary for SELECTED players only ───────
  const classCountMap = {};
  for (const s of selectedUsers) {
    const cls = s.className || 'Unknown';
    classCountMap[cls] = (classCountMap[cls] || 0) + 1;
  }

  // Sort classes by the same CLASS_ORDER
  const classSummaryLines = CLASS_ORDER
    .filter(cls => classCountMap[cls] > 0)
    .map(cls => `${cls}: ${classCountMap[cls]}`);

  const classSummary = classSummaryLines.length > 0
    ? classSummaryLines.join(' • ')
    : '_no one selected yet_';

  // ── 3. Buttons ────────────────────────────────────────────────────
  const components = [];

  // Player buttons - 5 per row
  for (let i = 0; i < paginatedDisplay.length; i += 5) {
    const row = new ActionRowBuilder();
    paginatedDisplay.slice(i, i + 5).forEach(s => {
      const classEmoji = CLASS_EMOJIS[s.className] || '❓';
      const isSelected = raid.finalSelection[roleKey].includes(s.userId);

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`slot_${roleKey}_${s.userId}`)
          .setLabel(`${classEmoji} ${s.name}`)
          .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Primary)
      );
    });
    components.push(row);
  }

  // ── 4. Navigation + Back ──────────────────────────────────────────
  const navRow = new ActionRowBuilder();

  if (candidates.length > pageSize) {
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`finalize_page_${roleKey}_prev`)
        .setLabel('◀ Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`finalize_page_${roleKey}_next`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled((page + 1) * pageSize >= candidates.length)
    );
  }

  navRow.addComponents(
    new ButtonBuilder()
      .setCustomId('finalize_back')
      .setLabel('Back to Raid')
      .setStyle(ButtonStyle.Danger)
  );

  components.push(navRow);

  // ── 5. Final content ──────────────────────────────────────────────
  const maxSlots = raid.slots[roleKey];
  const selectedCount = selectedUsers.length;

  const header = `**Finalize ${roleName}s**  (${selectedCount}/${maxSlots})`;

  const pageInfo = candidates.length > pageSize
    ? `   Page ${page + 1}/${Math.ceil(candidates.length / pageSize)}`
    : '';

  const content = [
    `${emoji} ${header}${pageInfo}`,
    '',
    `**Selected classes:** ${classSummary}`,
    '',
    selectedCount === 0 ? '_Click buttons to select players_ → green = selected' : ''
  ].filter(Boolean).join('\n');

  const messageOptions = {
    content,
    components,
    flags: MessageFlags.Ephemeral,
  };

  // ── Send / Update ─────────────────────────────────────────────────
  try {
    if (isUpdate || interaction.deferred || interaction.replied) {
      await safeEditReply(interaction, messageOptions).catch(() => false);
    } else {
      await safeReply(interaction, messageOptions);
    }
  } catch (err) {
    console.error('Error showing finalize UI:', err);
    await safeFollowUp(interaction, {
      content: "Failed to display finalize interface. Try again.",
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }
}

export async function updateRaidMessage(channel, raid, member) {
  if (!raid?.messageId) return;

  const msg = await safeFetchMessage(channel, raid.messageId);
  if (!msg) {
    console.warn(`Raid message ${raid.messageId} not found in channel ${channel.id}`);
    return;
  }

  const isAdmin = member?.permissions.has('ManageGuild') ?? false;

  const success = await safeEditMessage(msg, renderRaidView(raid));
  if (!success) {
    console.warn(`Failed to update main raid message ${raid.messageId}`);
  }
}


client.login(process.env.DISCORD_TOKEN);