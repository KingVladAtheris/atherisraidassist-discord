import mongoose from 'mongoose';

const signupSchema = new mongoose.Schema({
  userId:     String,
  name:       String,
  className:      String,   
  spec:       String,
  status:     { type: String, default: 'attend' },
  reserves:   [{ id: Number, name: String }]
});

const finalSelectionSchema = new mongoose.Schema({
  tanks:    [String],   // array of userIds
  healers:  [String],
  dps:      [String]
});

const raidSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    unique: true,           // one raid per channel
    index: true             // faster lookups
  },

  id:                     String,
  name:                   String,

  slots: {
    tanks:    { type: Number, default: 0 },
    healers:  { type: Number, default: 0 },
    dps:      { type: Number, default: 0 }
  },

  softReserveLimits: {
    tanks:    { type: Number, default: 0 },
    healers:  { type: Number, default: 0 },
    dps:      { type: Number, default: 0 }
  },

  signups: {
    type: Map,
    of: signupSchema
  },

  locked:                 { type: Boolean, default: false },
  messageId:              String,
  finalSelection:         finalSelectionSchema,
  publishedMessageId:     String,

  // Optional: if you want to store uploaded import file as binary
  importStringFile: {
    filename: String,
    data:     Buffer      // binary content
  },
  tempFinalize: {
    role: String,
    page: { type: Number, default: 0 }
  }
}, {
  timestamps: true        // automatically adds createdAt & updatedAt
});



const Raid = mongoose.model('Raid', raidSchema);

export default Raid;