import Raid from '../models/Raid.js';
import { generateExport, generateRosterExport } from '../export.js';

export async function createRaid({ channelId, name, slots }) {
  const raid = await Raid.findOneAndUpdate(
    { channelId },  // find by channelId
    {
      $set: {
        id: Date.now().toString(),  // new ID each time
        name,
        slots: {
          tanks: slots?.tanks ?? 0,
          healers: slots?.healers ?? 0,
          dps: slots?.dps ?? 0
        },
        softReserveLimits: {
          tanks: 0,
          healers: 0,
          dps: 0
        },
        signups: new Map(),                    // reset signups
        locked: false,
        messageId: null,
        finalSelection: {
          tanks: [],
          healers: [],
          dps: []
        },
        publishedMessageId: null,
        importStringFile: null,
        tempFinalize: { role: null, page: 0 }
      }
    },
    {
      upsert: true,     // create if doesn't exist
      new: true,        // return the updated/new document
      setDefaultsOnInsert: true  // apply schema defaults
    }
  );

  console.log(`Raid ${name} ${raid.isNew ? 'created' : 'overwritten'} in channel ${channelId}`);
  return raid;
}

export async function closeRaid(channelId) {
  const raid = await Raid.findOne({ channelId });
  if (!raid) return false;

  raid.locked = true;
  await raid.save();
  return true;
}


export async function exportRaid(raid) {
  if (!raid || !raid.locked) return '';
  return generateExport(raid);
}

export async function exportRoster(raid) {
  if (!raid || !raid.locked) return '';

  return generateRosterExport(raid);
}
