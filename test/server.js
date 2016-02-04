var http = require('http');
var jsonfile = require('jsonfile');
var fs = require('fs');

var Proxy = require('../src/Proxy');

describe('server', function() {
    before(function(done) {
        this.routesDefinitionFile = __dirname + '/testRoutes.json';

        jsonfile.writeFileSync(this.routesDefinitionFile, {
            "sub1": 23456,
            "sub2": 34567
        });

        this.server = http.createServer(function(request, response) {
            response.end('response');
        });

        this.server.listen(34567, function() {
            done();
        });
    });

    after(function(done) {
        fs.unlinkSync(this.routesDefinitionFile);

        this.server.close(function() {
            this.proxy.close(function() {
                done();
            });
        }.bind(this));
    });

    it('should run a server listening on given port', function(done) {

        this.proxy = Proxy.createServer({
            domain: 'domain',
            routesDefinition: this.routesDefinitionFile
        });
        this.proxy.on('error', function(error) {
            done(error);
        });

        this.proxy.on('config_changed', function() {
        });

        this.proxy.on('targets_updated', function(targets) {
            this.proxy.listen(12345, function(port) {
                var request = http.request({
                    host: '127.0.0.1',
                    headers: {
                        host: 'sub2.domain'
                    },
                    port: 12345,
                    method: 'GET',
                    path: '/sample/path'
                });

                request.on('response', function(res) {
                    var body = '';
                    res.setEncoding('utf8');
                    res.on('data', function(chunk) {
                        body+= chunk;
                    });

                    res.on('end', function() {
                        if (body !== 'response') {
                            return done('wrong response');
                        }
                        done();
                    });
                });

                request.on('error', function(error) {
                    done(error);
                });

                request.end();
            }.bind(this));
        }.bind(this));
    });
});