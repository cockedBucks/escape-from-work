// Public entry of @escape/shared: deterministic sim, rules, config schemas.
export { GAME_TITLE, ROOM_NAME } from './constants';
export { ConfigError, parseConfig } from './config/parse';
export { TuningSchema, parseTuning, type Tuning } from './config/tuning';
