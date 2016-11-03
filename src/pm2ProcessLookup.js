'use strict';

const exec = require('child_process').exec;
const EventEmitter = require('events');

const pm2 = require('./pm2');

const netstatLinePattern = /^\w+\s+\d+\s+\d+\s+[^\s]+:(\d+)\s+[^\s]+\s+[^\s]+(?:\s+(?:(\d+)\/[^\s]+|-))?/;
const bookingTime = 300000;
const simpleDomainVar = 'DOMAIN';
const simplePortVar = 'PORT';
const complexVar = 'HOSTNAME_TO_PORT';

const emitter = new EventEmitter();

pm2.emitter.on('message', emitter.emit.bind(emitter, 'message'));

module.exports.defaultRange = [8801, 9000];
module.exports.on = emitter.on.bind(emitter);
module.exports.getPortForDomain = getPortForDomain;

const bookedPorts = {};

function bookAPort (domain, range) {
  if (bookedPorts[domain]) {
    emitter.emit('message', 'port ' + bookedPorts[domain] + ' booked for this domain');
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
    emitter.emit('message', 'An available port will be selected in range ' + range[0] + ' to ' + range[1]);
  }

  return pm2.getProcessList()
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
    .then((portsInUse) => {
      emitter.emit('message', 'List of ports in use:\n' + JSON.stringify(portsInUse, null, '  '));
      emitter.emit('message', 'List of ports booked:\n' + JSON.stringify(bookedPorts, null, '  '));
      emitter.emit('message', 'Searching for an available port in range ' + range[0] + ' to ' + range[1]);

      Object.keys(bookedPorts).forEach((domain) => {
        let port = bookedPorts[domain];
        if (portsInUse.indexOf(port) === -1) {
          portsInUse.push(port);
        }
      });

      var port = getRandomInt(range[0], range[1], portsInUse);

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
