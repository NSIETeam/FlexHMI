"use strict";
const path = require("node:path");
// FUXA receives a writable per-user directory; installed program files stay read-only.
require(path.join(__dirname, "../server/main.js"));
const shutdown = () => process.emit("SIGINT");
process.on("message", (msg) => {
  if (msg?.type === "shutdown") shutdown();
});
process.on("disconnect", shutdown);
