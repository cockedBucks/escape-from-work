// Public entry of @escape/shared: deterministic sim, rules, config schemas.
export { DEFAULT_TRACK, GAME_TITLE, ROOM_NAME } from './constants';
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
export { createCar, createCarOnGrid, createWorld, placeAtGate } from './sim/car';
export { step, type InputsByCar } from './sim/step';
export { hashWorld } from './sim/hash';
export { botSteer, lookAheadPoint } from './bot/pilot';
export { botPedals, newBotMemory, plannedSpeed, type BotMemory } from './bot/engineer';
export { botInput } from './bot/driver';
export { runBotRace, type BotCarResult, type BotRaceOptions, type BotRaceResult } from './bot/race';
export {
  MSG,
  InputMessageSchema,
  NAME_MAX_LENGTH,
  SetNameSchema,
  SetLapsSchema,
  SetSeatSchema,
  TuningPostSchema,
  parseInputMessage,
  toCarInput,
  type InputMessage,
  type LobbyError,
} from './net/messages';
export {
  SEATS,
  carIdForSlot,
  effectiveRole,
  occupants,
  seatProblem,
  suggestSeat,
  usedSlots,
  type Role,
  type Seat,
  type SeatedPlayer,
} from './race/seats';
export { getTuningValue, tuningFields, type TuningField } from './config/tuningFields';
export { ROLE_CONTROLS, mayUse, mergeCarInput, type Control, type InputPart } from './net/permissions';
export { gridSpot, type GridSpot } from './race/grid';
export { collideCars } from './sim/carCollisions';
export { carStateFromView, type CarViewLike } from './bot/fromView';
export {
  RACE_PHASES,
  chooseHost,
  countdownLeft,
  countdownTicks,
  inputsAllowed,
  lapsProblem,
  newFlow,
  seatChangesAllowed,
  startCountdown,
  startProblem,
  stepFlow,
  toLobby,
  type RaceFlow,
  type RacePhase,
} from './race/flow';
