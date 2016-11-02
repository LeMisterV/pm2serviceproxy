'use strict';

const exec = require('child_process').exec;
const EventEmitter = require('events');

const pm2 = require('pm2');

const emitter = new EventEmitter();

const netstatLinePattern = /^\w+\s+\d+\s+\d+\s+[^\s]+:(\d+)\s+[^\s]+\s+[^\s]+(?:\s+(?:(\d+)\/[^\s]+|-))?/;
const bookingTime = 300000;
const simpleDomainVar = 'DOMAIN';
const simplePortVar = 'PORT';
const complexVar = 'HOSTNAME_TO_PORT';

module.exports.defaultRange = [8801, 9000];
module.exports.on = emitter.on.bind(emitter);
module.exports.getPortForDomain = getPortForDomain;

var bookedPorts = {};

function bookAPort (domain, range) {
  if (bookedPorts[domain]) {
    return bookedPorts[domain];
  }

  let willGetPort = getRandomAvailablePortInRange(range);

  willGetPort
    .then((port) => {
      bookedPorts[domain] = port;
      setTimeout(() => {
        delete bookedPorts[domain];
      }, bookingTime).unref();
    });

  return willGetPort;
}

function findPm2ProcessOnDomain (domain, item) {
  var envDomain = item.pm2_env.env[simpleDomainVar] && item.pm2_env.env[simpleDomainVar].toString().toLowerCase();
  var simplePortRelation = (envDomain === domain) && (simplePortVar in item.pm2_env.env);

  if (simplePortRelation) {
    item.domainToPort = {
      [domain]: item.pm2_env.env[simplePortVar]
    };
    return true;
  }

  item.domainToPort = parseHostnameToPortValue(item.pm2_env.env[complexVar]);

  return item.domainToPort && item.domainToPort[domain];
}

function getPortForDomain (domain, range) {
  domain = domain.toLowerCase();
  emitter.emit('message', 'Searching port for domain "' + domain + '"');
  if (range) {
    emitter.emit('message', 'For free port, it will be selected in range ' + range[0] + ' to ' + range[1]);
  }

  return getPm2ProcessList()
  .then((list) => {
    var listFormated = list.map((item) => item.name + ':' + item.pm2_env.env[simplePortVar]);

    emitter.emit('message', 'pm2 process list:\n' + JSON.stringify(listFormated, null, '  '));

    let found = list.find(findPm2ProcessOnDomain.bind(null, domain));

    if (!found) {
      emitter.emit('message', 'No process using this domain');
      if (!range) {
        return Promise.reject('No process using this domain');
      }

      return bookAPort(domain, range);
    }

    emitter.emit('message', 'Found a process using this domain and listening a port');
    emitter.emit('message', 'process name: ' + found.name);
    emitter.emit('message', 'process id: ' + found.pid);
    emitter.emit('message', 'process pm2 id: ' + found.pm_id);
    emitter.emit('message', 'process port: ' + found.domainToPort[domain]);
    return found.domainToPort[domain];
  });
}

function parseHostnameToPortValue (value) {
  return value && value.split(',').reduce((map, item) => {
    item = item.split(':');
    if (item.length === 2) {
      map[item[0].toLowerCase()] = item[1];
    }
    return map;
  }, {});
}

function getPm2Access () {
  return new Promise((resolve, reject) => {
    emitter.emit('message', 'connecting to pm2');
    pm2.connect((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

var willGetPm2List;
function getPm2List () {
  return new Promise((resolve, reject) => {
    emitter.emit('message', 'getting pm2 process list');
    pm2.list((err, list) => {
      emitter.emit('message', 'disconnect from pm2');
      pm2.disconnect();
      if (err) return reject(err);
      resolve(list);
    });
  });
}

function getPm2ProcessList () {
  if (willGetPm2List) {
    return willGetPm2List;
  }

  willGetPm2List = getPm2Access()
    .then(getPm2List);

  willGetPm2List.then(() => {
    willGetPm2List = undefined;
  }, () => {
    willGetPm2List = undefined;
  });

  return willGetPm2List;
}

function getRandomInt (min, max, forbidden) {
  var delta = max - min;
  var int = Math.floor(Math.random() * (delta + 1)) + +min;

  for (let i = 0; i < delta; i++) {
    let result = i + int;
    if (result > max) {
      result -= delta;
    }

    if (forbidden.indexOf(result) === -1) {
      return result;
    }
  }
}

function getRandomAvailablePortInRange (range) {
  return getTcpPortsInUse()
    .then((ports) => {
      emitter.emit('message', 'List of ports in use:\n' + JSON.stringify(ports, null, '  '));
      emitter.emit('message', 'List of ports booked:\n' + JSON.stringify(bookedPorts, null, '  '));
      emitter.emit('message', 'Searching for an available port in range ' + range[0] + ' to ' + range[1]);

      Object.keys(bookedPorts).forEach((port) => { if (ports.indexOf(port) === -1) { ports.push(port); } });
      var port = getRandomInt(range[0], range[1], ports);

      if (port === undefined) {
        throw new Error('All ports in range used. :(');
      }

      return port;
    });
}

function getTcpPortsInUse () {
  return new Promise((resolve, reject) => {
    emitter.emit('message', 'Getting list of active ports using netstat');

    var time = Date.now();
    // arguments -lnt:
    // -l : show only listening ports
    // -n : show numeric values: no domain for adress, no protocol for ports, no user names
    // -t : show only tpc protocol
    exec('netstat -lnt', {
      stdio: [null, null, 'ignore']
    }, function (error, output) {
      emitter.emit('message', 'netstat process done in ' + (Date.now() - time) + 'ms');
      if (error) {
        return reject(error);
      }

      return resolve(output.toString().split('\n'));
    });
  }).then((output) => {
    return output.reduce((ports, line) => {
      var match = netstatLinePattern.exec(line);

      if (match) {
        ports.push(+match[1]);
      }

      return ports;
    }, []);
  });
}

/*
function getFirstAvailablePortInRange (range) {
  return getTcpPortsInUseWithPid()
    .then((ports) => {
      emitter.emit('message', 'List of ports in use:\n' + JSON.stringify(ports, null, '  '));
      emitter.emit('message', 'Searching for an available port in range ' + range[0] + ' to ' + range[1]);
      for (let i = +range[0]; i < +range[1]; i++) {
        if (!ports[i]) {
          return i;
        }
      }

      throw new Error('All ports in range used. :(');
    });
}

function getTcpPortsInUseWithPid () {
  return new Promise((resolve, reject) => {
    emitter.emit('message', 'Getting list of active ports and pid using netstat');

    var time = Date.now();
    // arguments -plnt:
    // -p : show PID
    // -l : show only listening ports
    // -n : show numeric values: no domain for adress, no protocol for ports, no user names
    // -t : show only tpc protocol
    exec('netstat -plnt', {
      stdio: [null, null, 'ignore']
    }, function (error, output) {
      emitter.emit('message', 'netstat process done in ' + (Date.now() - time) + 'ms');
      if (error) {
        return reject(error);
      }

      return resolve(output.toString().split('\n'));
    })
  }).then((output) => {
    var ports = {};

    output.forEach(function (line) {
      var match = netstatLinePattern.exec(line);

      if (match) {
        ports[match[1]] = +match[2];
      }
    });

    return ports;
  });
}
*/
