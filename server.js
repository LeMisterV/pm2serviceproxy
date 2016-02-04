var yargs = require('yargs');
var nconf = require('nconf');
var colors = require('colors');

var Proxy = require('./src/Proxy');

var pkg = require('./package');

function getDisplayWidth() {
    return Math.min(yargs.terminalWidth(), 90);
}

function sanitizPort(port) {
    if (!/^\d+$/.test(port)) {
        throw new TypeError('Port should be an integer (got ' + port + ')');
    }

    return parseInt(port);
}

function collectConf(optionsSchema, onError) {
    var errors = [];

    yargs(process.argv.slice(2))
        .strict()
        .fail(function(msg) {
            errors.push(msg);
        })
        .version(pkg.version)
        .wrap(getDisplayWidth())
        .usage('Run a HTTP proxy server to route requests to local services')
        .help('help')
        .options(optionsSchema);

    nconf
        .argv(yargs)
        .env()
        .file({ file: pkg.configfile });

    if (!nconf.get('domain')) {
        throw new Error('Missing config value domain');
    }

    if (!nconf.get('range')) {
        throw new Error('Missing config value range');
    }

    if (!/^\d+\,\d+$/.test(nconf.get('range'))) {
        throw new TypeError('Range should be like "<firstPort>,<lastPort>"');
    }

    try {
        nconf.set('port', sanitizPort(nconf.get('port')));
        return nconf;
    }
    catch(error) {
        errors.push(error.message);
    }

    if (errors.length) {
        onError(errors);
    }
}

var conf = collectConf({
    d: {
        alias: 'domain',
        describe: 'domain for which we handle sub-domains'
    },
    r: {
        alias: 'range',
        describe: 'port range allowed as targets'
    },
    p: {
        alias: 'port',
        describe: 'Port to listen'
    },
    c: {
        alias: 'routesDefinition',
        describe: 'Path to proxy config'
    }
}, function(errors) {
    console.error('\n' + errors.join('\n\n').red + '\n');
    yargs.showHelp();
    process.exit(1);
});

var server = Proxy.createServer({
    domain: conf.get('domain'),
    range: conf.get('range'),
    routesDefinition: conf.get('routesDefinition')
});

server.on('error', function(error) {
    console.error(error);
    process.exit(1);
});

server.on('proxy-error', function(error) {
    console.error(error);
});

server.on('config_changed', function() {
    console.log('config changed');
});

server.on('targets_updated', function(targets) {
    console.log('targets updated', targets);
});

server.on('listening', function(port) {
    console.log('Listening on port %d', port);
});

server.listen(conf.get('port'));
