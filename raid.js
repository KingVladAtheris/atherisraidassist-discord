export class Raid {
  constructor({ id, name, slots }) {
    this.id = id;
    this.name = name;

    this.slots = {
      tanks: slots.tanks || 0,
      healers: slots.healers || 0,
      dps: slots.dps || 0,
    };

    this.softReserveLimits = {
      tanks: 0,
      healers: 0,
      dps: 0,
    };

    this.signups = new Map();

    this.locked = false;
    this.messageId = null;

    this.finalSelection = {
      tanks: [],
      healers: [],
      dps: [],
    };
    this.publishedMessageId = null;
    this.importStringFile = null;
  }
}
