var Clients = {
    clientsConnected: 0,

    new: function (conn) {
        console.log((new Date()) + ' new client from IP ' + connection.remoteAddress);
        this.clientsConnected++;
    }
};

module.exports = Clients;
