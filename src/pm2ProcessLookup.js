var exec = require('child_process').exec;
var execSync = require('child_process').execSync;

var netstatLinePattern = /^\w+\s+\d+\s+\d+\s+[^\s]+:(\d+)\s+[^\s]+\s+[^\s]+\s+(?:(\d+)\/[^\s]+|-)/;

var portsInUse;

module.exports.getPm2ProcessByName = getPm2ProcessByName;
module.exports.getPm2ProcessByNameSync = getPm2ProcessByNameSync;
module.exports.getFirstAvailablePortInRange = getFirstAvailablePortInRange;
module.exports.getFirstAvailablePortInRangeSync = getFirstAvailablePortInRangeSync;
module.exports.getTcpPortsInUseSync = getTcpPortsInUseSync;
module.exports.getPidPortSync = getPidPortSync;
module.exports.getPidPort = getPidPort;
module.exports.getPm2ProcessList = getPm2ProcessList;
module.exports.getTcpPortsInUse = getTcpPortsInUse;
module.exports.getPm2ProcessListSync = getPm2ProcessListSync;
module.exports.getPortForPm2Name = getPortForPm2Name;
module.exports.getPortForPm2NameSync = getPortForPm2NameSync;

function getPortForPm2Name (name, range, callback) {
  getPm2ProcessByName(name, true, function (error, process) {
    if (error) {
      callback(error);
      return;
    }

    if (process && process.port) {
      callback(null, process.port);
    }

    getFirstAvailablePortInRange(range, callback);
  });
}

function getPortForPm2NameSync (name, range) {
  var process = getPm2ProcessByNameSync(name, true);

  if (process && process.port) {
    return process.port;
  }

  return getFirstAvailablePortInRangeSync(range);
}

function getPm2ProcessByName (name, online, callback) {
  getPm2ProcessList(online, function (error, processList) {
    if (error) {
      callback(error);
      return;
    }
    processList = processList
    .filter(function (process) {
      return process.name === name;
    });

    callback(null, processList[0]);
  });
}

function getPm2ProcessByNameSync (name, online) {
  var processList = getPm2ProcessListSync(online)
    .filter(function (process) {
      return process.name === name;
    });

  return processList[0];
}

function getFirstAvailablePortInRange (range, callback) {
  getTcpPortsInUse(function (error, ports) {
    if (error) {
      callback('no port found');
      return;
    }
    var i;

    for (i = +range[0]; i < +range[1]; i++) {
      if (!ports[i]) {
        callback(null, i);
        return;
      }
    }

    callback('no port found');
  });
}

function getFirstAvailablePortInRangeSync (range) {
  var ports = getTcpPortsInUseSync();
  var i;

  for (i = +range[0]; i < +range[1]; i++) {
    if (!ports[i]) {
      return i;
    }
  }
}

function getTcpPortsInUse (callback) {
  if (portsInUse) {
    callback(null, portsInUse);
    return;
  }
  exec('netstat -plnt', {
    stdio: [null, null, 'ignore']
  }, function (error, netstat) {
    var ports = {};
    if (error) {
      callback(error);
      return;
    }

    netstat
      .toString()
      .split('\n')
      .forEach(function (line) {
        var match = netstatLinePattern.exec(line);

        if (match) {
          ports[match[1]] = +match[2];
        }
      });

    portsInUse = ports;

    setTimeout(function () {
      portsInUse = undefined;
    }, 500);

    callback(null, ports);
  });
}

function getTcpPortsInUseSync () {
  if (portsInUse) {
    return portsInUse;
  }

  var ports = {};
  var netstat;

  try {
    netstat = execSync('netstat -plnt', {
      stdio: [null, null, 'ignore']
    });
    netstat
      .toString()
      .split('\n')
      .forEach(function (line) {
        var match = netstatLinePattern.exec(line);

        if (match) {
          ports[match[1]] = +match[2];
        }
      });

    portsInUse = ports;

    setTimeout(function () {
      portsInUse = undefined;
    }, 500);
  } catch (error) {}

  return ports;
}

function getPidPort (pid, callback) {
  getTcpPortsInUse(function (error, ports) {
    var pidPort;
    if (error) {
      callback(error);
      return;
    }

    Object.keys(ports).some(function (port) {
      if (ports[port] === pid) {
        pidPort = +port;
        return true;
      }
      return false;
    });

    callback(null, pidPort);
  });
}

function getPidPortSync (pid) {
  var ports = getTcpPortsInUseSync();
  var pidPort;

  Object.keys(ports).some(function (port) {
    if (ports[port] === pid) {
      pidPort = +port;
      return true;
    }
    return false;
  });

  return pidPort;
}

function getPm2ProcessList (online, callback) {
  if (typeof online === 'function') {
    callback = online;
    online = undefined;
  }

  exec('pm2 list -m', {
    stdio: [null, null, 'ignore']
  }, function (error, pm2ListOutput) {
    if (error) {
      callback(error);
      return;
    }

    parsePm2ProcessList(pm2ListOutput.toString(), function (error, list) {
      if (error) {
        callback(error);
        return;
      }

      if (online !== undefined) {
        list = list.filter(function (process) {
          return process.online === online;
        });
      }

      callback(null, list);
    });
  });
}

function getPm2ProcessListSync (online) {
  var pm2ListOutput = execSync('pm2 list -m', {
    stdio: [null, null, 'ignore']
  });

  var list = parsePm2ProcessListSync(pm2ListOutput.toString());

  if (online !== undefined) {
    list = list.filter(function (process) {
      return process.online === online;
    });
  }

  return list;
}

function parsePm2ProcessList (pm2Output, callback) {
  var waiting = 0;
  var async = false;

  var list = pm2Output
    .split('+---')
    .reduce(function (processList, processString) {
      var values = parsePm2ProcessDetails(processString);

      if (values.name) {
        values.pid = +values.pid;
        values.online = values.status === 'online';
        delete values.port;

        if (values.online) {
          waiting += 1;
          getPidPort(values.pid, function (error, port) {
            if (error) {
              delete values.port;
            }

            values.port = port;

            waiting -= 1;

            if (async && !waiting) {
              callback(null, list);
            }
          });
        }

        processList.push(values);
      }

      return processList;
    }, []);

  async = !!waiting;

  if (!async) {
    callback(null, list);
  }
}

function parsePm2ProcessListSync (pm2Output) {
  return pm2Output
    .split('+---')
    .reduce(function (processList, processString) {
      var values = parsePm2ProcessDetails(processString);

      if (values.name) {
        values.pid = +values.pid;
        values.online = values.status === 'online';

        if (values.online) {
          values.port = getPidPortSync(values.pid);
        } else {
          delete values.port;
        }

        processList.push(values);
      }

      return processList;
    }, []);
}

function parsePm2ProcessDetails (process) {
  process = process.split('\n');

  var values = process.slice(1).reduce(function (values, value) {
    value = value.split(':');
    if (value.length > 1) {
      values[value[0].trim()] = value[1].trim();
    }
    return values;
  }, {});

  values.name = process[0].trim();
  return values;
}
