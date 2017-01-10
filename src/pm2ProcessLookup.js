'use strict';

const EventEmitter = require('events');

const pm2 = require('./pm2');
const netstat = require('./netstat');

const bookingTime = 300000;
const simpleDomainVar = 'DOMAIN';
const simplePortVar = 'PORT';
const complexVar = 'HOSTNAME_TO_PORT';

const emitter = new EventEmitter();

module.exports.defaultRange = [8801, 9000];
module.exports.on = emitter.on.bind(emitter);
module.exports.getPortForDomain = getPortForDomain;

const bookedPorts = {};

function bookAPort (domain, range) {
  if (bookedPorts[domain]) {
    emitter.emit('message', 'port ' + bookedPorts[domain] + ' booked for this domain');
    return bookedPorts[domain];
  }

  let willGetPort = netstat.getRandomAvailablePortInRange(
    range,
    Object.keys(bookedPorts).map((domain) => bookedPorts[domain])
  );

  willGetPort
    .then((port) => {
      emitter.emit('message', 'register port booking for domain "' + domain + '" on port ' + port);
      bookedPorts[domain] = port;
      setTimeout(() => {
        emitter.emit('message', 'port booking expired for domain "' + domain + '" on port ' + port);
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
