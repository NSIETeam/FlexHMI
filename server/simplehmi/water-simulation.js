'use strict';
// Closed two-tank transfer demonstrator. Volumes are m³; time is seconds.
// This is a process simulation, not a replacement for a PLC safety interlock.
const CAPACITY_SOURCE = 5, CAPACITY_DESTINATION = 3;
const MIN_SOURCE = CAPACITY_SOURCE * 0.05, MAX_DESTINATION = CAPACITY_DESTINATION * 0.95;
const PUMP_M3_H = 36;
function stepWater(previous, command, seconds = 1) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 60) throw Error('供水模拟步长必须为 0–60 秒');
  const state = previous ? {...previous} : {sourceVolume: 3.25, destinationVolume: 0.9};
  for (const key of ['sourceVolume','destinationVolume']) if (!Number.isFinite(state[key])) throw Error('水箱容积状态无效');
  if (state.sourceVolume < 0 || state.sourceVolume > CAPACITY_SOURCE || state.destinationVolume < 0 || state.destinationVolume > CAPACITY_DESTINATION) throw Error('水箱容积超出范围');
  const enabled = Number(command) === 1;
  const dryBefore = state.sourceVolume <= MIN_SOURCE + 1e-9, fullBefore = state.destinationVolume >= MAX_DESTINATION - 1e-9;
  const transfer = enabled && !dryBefore && !fullBefore ? Math.min(PUMP_M3_H / 3600 * seconds, state.sourceVolume - MIN_SOURCE, MAX_DESTINATION - state.destinationVolume) : 0;
  state.sourceVolume -= transfer;
  state.destinationVolume += transfer;
  const dry = state.sourceVolume <= MIN_SOURCE + 1e-9, full = state.destinationVolume >= MAX_DESTINATION - 1e-9;
  const running = enabled && !dry && !full;
  const values={source_level:state.sourceVolume / CAPACITY_SOURCE * 100,destination_level:state.destinationVolume / CAPACITY_DESTINATION * 100,
    source_volume:state.sourceVolume,destination_volume:state.destinationVolume,total_volume:state.sourceVolume+state.destinationVolume,
    pump_running:running?1:0,transfer_flow:running?PUMP_M3_H:0,source_low:dry?1:0,destination_high:full?1:0,
    interval_transfer:transfer};
  // FUXA tags use two decimal places; publish stable precision without rounding the physical state.
  for(const key of Object.keys(values)) values[key]=Math.round(values[key]*100)/100;
  return {state,values};
}
module.exports={stepWater,CAPACITY_SOURCE,CAPACITY_DESTINATION,PUMP_M3_H};
