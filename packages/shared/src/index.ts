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
export { NO_INPUT, type CarInput, type CarState, type CarStats, type SimEvent, type World } from './sim/types';
export { createCar, createWorld, placeAtGate } from './sim/car';
export { step, type InputsByCar } from './sim/step';
export { hashWorld } from './sim/hash';
export { botSteer, lookAheadPoint } from './bot/pilot';
export { botPedals, newBotMemory, plannedSpeed, type BotMemory } from './bot/engineer';
export { botInput } from './bot/driver';
export { runBotRace, type BotCarResult, type BotRaceOptions, type BotRaceResult } from './bot/race';
export { MSG, InputMessageSchema, TuningPostSchema, parseInputMessage, toCarInput, type InputMessage } from './net/messages';
export { getTuningValue, tuningFields, type TuningField } from './config/tuningFields';
