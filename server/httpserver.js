var websocket = require('websocket'),
    http = require('http');

var constants = require('./constants.js'),
    Clients = require('./clients.js');

var HTTPServer = {
    allowedOrigin: 'http://schnitzelverse.ajf.me',
    originIsAllowed: function (origin) {
        // undefined origin (i.e. non-web clients) always allowed
        if (!origin) {
            return true;
        } else if (constants.DEBUG_MODE) {
            return true;
        } else {
            return origin === (this.allowedOrigin + '/');
        }
    },

    server: null,
    wsServer: null,

    listen: function (port) {
        this.server.listen(port, function() {
            console.log((new Date()) + ' Server is listening on port ' + port);
        });
    }
};

// http server
HTTPServer.server = http.createServer(function(request, response) {
    var headers;

    console.log((new Date()) + ' Received request for ' + request.url);

    // CORS
    if (constants.DEBUG_MODE) {
        headers = {
            'Access-Control-Allow-Origin': '*'
        };
    } else {
        headers = {
            'Access-Control-Allow-Origin': HTTPServer.allowedOrigin
        };
    }

    // stats endpoint for login page
    if (request.url === '/stats' && request.method === 'GET') {
        response.writeHead(200, headers);
        response.end(JSON.stringify({
            clients_connected: Clients.clientsConnected
        }));
    } else {
        response.writeHead(404, headers);
        response.end();
    }
});

// websocket server
HTTPServer.wsServer = new websocket.server({
    httpServer: HTTPServer.server,
    autoAcceptConnections: false
});
HTTPServer.wsServer.on('request', function(request) {
    var connection;

    if (!HTTPServer.originIsAllowed(request.origin)) {
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    try {
        connection = request.accept('schnitzelVerse', request.origin);
    } catch (e) {
        console.log('Caught error: ' + e);
        return;
    }
    console.log((new Date()) + ' Connection accepted from IP ' + connection.remoteAddress);
    Clients.new(connection);
});

module.exports = HTTPServer;
