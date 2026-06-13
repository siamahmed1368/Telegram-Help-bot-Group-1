export const CONFIG = {
  REQUIRED_INVITES: 3,
  PROMO_USERNAME: "@Hunter11110001",
  GROUP_NAME: "Bangladeshi 18+ hot Group Chat",
  MAX_WARNINGS: 3,
  MUTE_DURATION_HOURS: 24,
  FLOOD_LIMIT: 5,
  FLOOD_WINDOW_MS: 5000,
  WARNING_AUTO_DELETE_MS: 12000,
  STORE_PATH: "/tmp/bot_store.json",
  ADMIN_CACHE_TTL_MS: 5 * 60 * 1000,
} as const;

export const FULLY_RESTRICTED = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
} as const;

export const LINK_REGEX =
  /(?:https?:\/\/|www\.)[^\s]+|t\.me\/[^\s]+|(?<![a-zA-Z0-9_])@[a-zA-Z0-9_]{5,}/g;
