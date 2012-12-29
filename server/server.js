var constants = require('./constants.js'),
    HTTPServer = require('./httpserver.js');

HTTPServer.listen(constants.DEFAULT_PORT);
