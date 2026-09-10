'use strict';
// Demonstration-only process dynamics; these are not PLC interlocks or design setpoints.
// Every output is written to FUXA's FuxaServer tags by the existing adapter.
function stepWaste(previous, commands, now = Date.now()) {
  const s = previous || {load:0, temperature:180, steam:0, pressure:0, power:0, last:now};
  const dt = Math.max(0, Math.min(3, (now - s.last) / 1000));
  const run = !!commands.run;
  const fault = !!commands.fault;
  const approach = (value, goal, speed) => value + (goal - value) * Math.min(1, dt * speed);
  const load = approach(s.load, run ? 1 : 0, run ? .3 : .45);
  const temperature = approach(s.temperature, run ? (fault ? 1005 : 892) : 180, .30);
  const wave = Math.sin(now / 4500);
  const steam = approach(s.steam, load * 450, .4);
  const pressure = approach(s.pressure, load * 4.4, .35);
  const power = approach(s.power, load * 6.8, .32);
  const n = {load,temperature,steam,pressure,power,last:now};
  const round = (v,d=1) => Number(v.toFixed(d));
  return {state:n,values:{
    plant_run:run?1:0,temperature_fault:fault?1:0,
    furnace_temp:round(temperature + wave * load * 3),
    steam_temp:round(steam),steam_pressure:round(pressure,2),power_mw:round(power,2),
    feed_rate:round(14.5*load + wave*.3*load),flue_temp:round(35+load*112+wave*load),
    pit_level:round(64+Math.sin(now/24000)*2),load_pct:round(load*100),
    air_fan:run?1:0,induced_fan:load>.03?1:0,recirc_fan:load>.25?1:0,
    furnace_on:load>.06?1:0,boiler_on:load>.15?1:0,turbine_on:load>.5?1:0,
    lime_pump:load>.1?1:0,carbon_feed:load>.1?1:0,filter_on:load>.08?1:0,
    lime_rate:round(load*160+wave*2*load),carbon_rate:round(load*22+wave*.5*load),
    recirc_pct:round(load*12),ash_rate:round(load*2.8,2),flyash_rate:round(load*.42,2),
    temp_alarm:temperature>=950?1:0,
  }};
}
module.exports={stepWaste};
