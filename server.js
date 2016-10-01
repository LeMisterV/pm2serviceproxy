var yargs = require('yargs');
var nconf = require('nconf');

var pm2ProcessLookup = require('./src/pm2ProcessLookup');
var Pm2HttpServiceProxy = require('./src/Pm2HttpServiceProxy');

var pkg = require('./package');

function getDisplayWidth () {
  return Math.min(yargs.terminalWidth(), 90);
}

function sanitizPort (port) {
  if (!/^\d+$/.test(port)) {
    throw new TypeError('Port should be an integer (got ' + port + ')');
  }

  return parseInt(port, 10);
}

function collectConf (optionsSchema, onError) {
  var errors = [];

  yargs(process.argv.slice(2))
    .strict()
    .fail(function (msg) {
      errors.push(msg);
    })
    .version(pkg.version)
    .wrap(getDisplayWidth())
    .usage('Run a HTTP proxy server to route requests to local pm2 http services')
    .help('help')
    .options(optionsSchema);

  nconf
    .argv(yargs)
    .env()
    .file({ file: pkg.configfile });

  try {
    nconf.set('port', sanitizPort(nconf.get('port')));
    return nconf;
  } catch (error) {
    errors.push(error.message);
  }

  if (errors.length) {
    onError(errors);
  }
}

var conf = collectConf({
  p: {
    alias: 'port',
    describe: 'Port to listen'
  },
  r: {
    alias: 'range',
    description: 'Port range for available ports requests'
  }
}, function (errors) {
  console.error('\n' + errors.join('\n\n').red + '\n');
  yargs.showHelp();
  process.exit(1);
});

var server = Pm2HttpServiceProxy.createServer(conf.get('range'));

server.on('error', (error) => {
  console.error('http server error', error);
});

server.on('proxy_error', (error) => {
  console.error('http proxy error', error);
});

server.on('request_error', (error) => {
  console.error('http request error', error);
});

server.on('listening', (port) => {
  console.log('Listening on port %d', port);
});

server.on('info', (msg, data) => {
  var simpleData = {};

  Object.keys(data).forEach((key) => {
    simpleData[key] = '' + data[key];
  });

  console.log(msg, simpleData);
});

pm2ProcessLookup.on('message', (msg) => {
  console.log(msg);
});

pm2ProcessLookup.on('warning', (msg) => {
  console.error(msg);
});

server.listen(conf.get('port'));
