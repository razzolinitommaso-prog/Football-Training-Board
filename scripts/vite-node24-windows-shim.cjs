const childProcess = require("node:child_process");

const originalExec = childProcess.exec;

childProcess.exec = function exec(command, options, callback) {
  const normalizedCommand = String(command).trim().toLowerCase();
  if (normalizedCommand === "net use") {
    const done = typeof options === "function" ? options : callback;
    if (typeof done === "function") {
      queueMicrotask(() => done(null, "", ""));
    }
    return {
      kill() {},
      on() {
        return this;
      },
      once() {
        return this;
      },
    };
  }

  return originalExec.apply(this, arguments);
};
