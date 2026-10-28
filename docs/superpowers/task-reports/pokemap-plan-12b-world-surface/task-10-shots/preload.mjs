import net from "node:net";
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] === 5174) args[0] = 5184;
  else if (args[0] && typeof args[0] === "object" && args[0].port === 5174) args[0] = { ...args[0], port: 5184 };
  return listen.apply(this, args);
};
