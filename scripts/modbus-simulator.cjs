// An actual Modbus TCP slave used to test FUXA's unchanged protocol driver.
const Modbus = require('../server/node_modules/modbus-serial');
const registers = new Map([[0,236],[1,62],[2,1],[3,45]]);
const coils = new Map([[0,true]]);
const server = new Modbus.ServerTCP({
  getHoldingRegister: a => { if(a>99) throw Object.assign(new Error('Illegal address'), {modbusErrorCode:2}); return registers.get(a)||0; },
  getInputRegister: a => registers.get(a)||0,
  getCoil: a => coils.get(a)||false,
  getDiscreteInput: a => coils.get(a)||false,
  setRegister: (a,v) => registers.set(a,v),
  setCoil: (a,v) => coils.set(a,v)
}, {host:'127.0.0.1',port:Number(process.env.MODBUS_PORT||1502),unitID:1});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.on('socketError',e=>console.error(e.message));
console.log('Modbus TCP 测试从站：127.0.0.1:'+(process.env.MODBUS_PORT||1502)+'，Unit ID 1，保持寄存器 1=236、2=62、3=1、4=45。');
