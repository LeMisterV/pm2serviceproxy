var yargs = require('yargs');
var nconf = require('nconf');

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

server.on('error', function (error) {
  console.error(error);
  process.exit(1);
});

server.on('proxy_error', function (error) {
  console.error(error);
});

server.on('listening', function (port) {
  console.log('Listening on port %d', port);
});

server.listen(conf.get('port'));
