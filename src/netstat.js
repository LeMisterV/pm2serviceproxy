'use strict';

const exec = require('child_process').exec;
const EventEmitter = require('events');

const emitter = new EventEmitter();

const netstatLinePattern = /^\w+\s+\d+\s+\d+\s+[^\s]+:(\d+)\s+[^\s]+\s+[^\s]+(?:\s+(?:(\d+)\/[^\s]+|-))?/;

const netstat = {
  emitter: emitter,

  getRandomAvailablePortInRange (range, excludelist) {
    return netstat.getTcpPortsInUse()
      .then((portsinuse) => {
        emitter.emit('message', 'Searching for an available port in range ' + range[0] + ' to ' + range[1]);
        emitter.emit('message', 'List of ports in use:\n' + JSON.stringify(portsinuse, null, '  '));
        emitter.emit('message', 'List of ports excluded from search:\n' + JSON.stringify(excludelist, null, '  '));

        excludelist.forEach((port) => {
          if (portsinuse.indexOf(port) === -1) {
            portsinuse.push(port);
          }
        });

        var port = getRandomInt(range[0], range[1], portsinuse);

        if (port === undefined) {
          throw new Error('All ports in range used. :(');
        }

        return port;
      });
  },

  getTcpPortsInUse () {
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
        emitter.emit('message', 'netstat request done in ' + (Date.now() - time) + 'ms');
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
};

module.exports = netstat;

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
