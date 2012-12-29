var websocket = require('websocket');
var http = require('http');

var debugMode = process.argv.hasOwnProperty('2') && process.argv[2] === '--debug';

var allowedOrigin = 'http://schnitzelverse.ajf.me/';

var server = http.createServer(function(request, response) {
    var headers;

    console.log((new Date()) + ' Received request for ' + request.url);
    if (debugMode) {
        headers = {
            'Access-Control-Allow-Origin': '*'
        };
    } else {
        headers = {
            'Access-Control-Allow-Origin': allowedOrigin
        };
    }
    if (request.url === '/stats' && request.method === 'GET') {
        response.writeHead(200, headers);
        response.end(JSON.stringify({
            users_online: Math.floor(Math.random() * 128) + 64
        }));
    } else {
        response.writeHead(404, headers);
        response.end();
    }
});
server.listen(9002, function() {
    console.log((new Date()) + ' Server is listening on port 9001');
});

wsServer = new websocket.server({
    httpServer: server,
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    // undefined origin (i.e. non-web clients) always allowed
    if (!origin) {
        return true;
    } else if (debugMode) {
        return true;
    } else {
        return origin === allowedOrigin;
    }
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    try {
        var connection = request.accept('schnitzelVerse', request.origin);
    } catch (e) {
        console.log('Caught error: ' + e);
        return;
    }
    console.log((new Date()) + ' Connection accepted from IP ' + connection.remoteAddress);
});
