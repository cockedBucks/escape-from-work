// Public entry of @escape/shared: deterministic sim, rules, config schemas.
export { GAME_TITLE, ROOM_NAME } from './constants';
export { ConfigError, parseConfig } from './config/parse';
export {
  TuningSchema,
  parseTuning,
  type CarTuning,
  type QualityLevel,
  type QualityPreset,
  type Tuning,
} from './config/tuning';
export { CarsSchema, parseCars, type CarDef, type CarsConfig } from './config/cars';
export {
  TrackSchema,
  parseTrack,
  type TrackDef,
  type TrackPoint,
  type TrackZone,
} from './config/track';
export { Rng } from './util/rng';
export { RingBuffer } from './util/ringBuffer';
export * from './util/math';
export {
  buildTrack,
  wallsNear,
  type SectorGate,
  type Track,
  type TrackBuildConfig,
  type TrackSample,
  type WallSegment,
} from './track/build';
export { lapProgress, locateOnTrack, zonesAt, type TrackLocation } from './track/locate';
export { checkTrack, type TrackCheck, type TrackStats } from './track/validate';
export { SpatialGrid } from './track/grid';
