var exec = require('child_process').exec;
var execSync = require('child_process').execSync;

var netstatLinePattern = /^\w+\s+\d+\s+\d+\s+[^\s]+:(\d+)\s+[^\s]+\s+[^\s]+\s+(?:(\d+)\/[^\s]+|-)/;

var portsInUse;

module.exports.getPm2ProcessByName = getPm2ProcessByName;
module.exports.getFirstAvailablePortInRange = getFirstAvailablePortInRange;
module.exports.getTcpPortsInUse = getTcpPortsInUse;
module.exports.getPidPort = getPidPort;
module.exports.getPm2ProcessList = getPm2ProcessList;
module.exports.getPortForPm2Name = getPortForPm2Name;

function getPortForPm2Name(name, range) {
    var process = getPm2ProcessByName(name);

    if (process && process.port) {
        return process.port;
    }

    return getFirstAvailablePortInRange(range);
}

function getPm2ProcessByName (name) {
    var processList = getPm2ProcessList()
        .filter(function(process) {
            return process.name === name;
        });

    return processList[0];
}

function getFirstAvailablePortInRange(range) {
    var ports = getTcpPortsInUse();
    var i;

    for (i = range[0]; i < range[1]; i++) {
        if (!ports[i]) {
            return i;
        }
    }
}

function getTcpPortsInUse() {
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
            .forEach(function(line) {
                var match = netstatLinePattern.exec(line);

                if (match) {
                    ports[match[1]] = +match[2];
                }
            });

        portsInUse = ports;

        setTimeout(function() {
            portsInUse = undefined;
        }, 500);
    }
    catch(error) {}

    return ports;
}

function getPidPort(pid) {
    var ports = getTcpPortsInUse();
    var pidPort;

    Object.keys(ports).some(function(port) {
        if (ports[port] === pid) {
            pidPort = +port;
            return true;
        }
        return false;
    });

    return pidPort;
}

function getPm2ProcessList() {
    var pm2ListOutput = execSync('pm2 list -m', {
        stdio: [null, null, 'ignore']
    });

    return parsePm2ProcessList(pm2ListOutput.toString());
}

function parsePm2ProcessList(pm2Output) {
    return pm2Output
        .split('+---')
        .reduce(function(processList, processString) {
            var values = parsePm2ProcessDetails(processString);

            if (values.name) {
                values.pid = +values.pid;

                if (values.status === 'online') {
                    values.port = getPidPort(values.pid);
                }

                processList.push(values);
            }

            return processList;
        }, []);
}

function parsePm2ProcessDetails(process) {
    process = process.split('\n');

    var values = process.slice(1).reduce(function(values, value) {
        value = value.split(':');
        if (value.length > 1) {
            values[value[0].trim()] = value[1].trim();
        }
        return values;
    }, {});

    values.name = process[0].trim();
    return values;
}

