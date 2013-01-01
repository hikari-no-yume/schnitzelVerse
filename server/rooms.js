var fs = require('fs');

var User = require('./user.js');

var Rooms = {
    rooms: {},
    roomUserCounts: {},

    init: function () {
        var data, that = this;

        try {
            data = JSON.parse(fs.readFileSync('data/rooms.json'));
        } catch (e) {
            console.log('Error loading rooms, skipped');
            return;
        }
        this.rooms = data.rooms;
        console.log('Loaded rooms');
    },
    save: function () {
        fs.writeFileSync('data/rooms.json', JSON.stringify({
            rooms: this.rooms
        }));
        console.log('Saved rooms');
    },
    has: function (name) {
        return this.rooms.hasOwnProperty(name);
    },
    get: function (name) {
        if (!this.has(name)) {
            throw new Error('There is no room with the name "' + name + '"');
        }

        return this.rooms[name];
    },
    getUserCount: function (name) {
        if (this.roomUserCounts.hasOwnProperty(name)) {
            return this.roomUserCounts[name];
        } else {
            return 0;
        }
    },
    setUserCount: function (name, value) {
        if (value) {
            this.roomUserCounts[name] = value;
        } else {
            delete this.roomUserCounts[name];
        }
    },
    incrementUserCount: function (name) {
        this.setUserCount(name, this.getUserCount(name) + 1);
    },
    decrementUserCount: function (name) {
        this.setUserCount(name, this.getUserCount(name) - 1);
    },
    create: function (name, owner) {
        this.setUserCount(name, 0);
        this.rooms[name] = {
            objects: {},
            objectOrder: [],
            owner: owner,
            publicEdit: false,
            name: name
        };
        this.save();
        return this.rooms[name];
    },
    onLeave: function (name) {
        if (this.rooms.hasOwnProperty(name)) {
            this.decrementUserCount(name);
            if (this.getUserCount(name) <= 0 && this.rooms[name].objectOrder.length === 0) {
                delete this.rooms[name];
                this.save();
            }
        }
    },
    getList: function () {
        var list = [];
        for (var name in this.rooms) {
            if (this.rooms.hasOwnProperty(name)) {
                list.push({
                    name: name,
                    user_count: this.getUserCount(name)
                });
            }
        }
        return list;
    },
    doRoomChange: function (roomName, user) {
        var room, oldRoom;

        if (this.has(roomName)) {
            room = this.rooms[roomName];
        } else {
            room = this.create(roomName, user.nick);
        }

        oldRoom = user.room;

        // don't if in null room (lobby)
        if (oldRoom !== null) {
            // tell clients in old room that client has left
            User.forEach(function (iterUser) {
                if (iterUser.room === oldRoom && iterUser.nick !== user.nick) {
                    iterUser.send({
                        type: 'die',
                        nick: user.nick
                    });
                }
            });
            // decrease user count of old room
            this.onLeave(oldRoom);
        }

        // set current room to new room
        user.room = roomName;

        // increase user count of new room
        this.incrementUserCount(roomName);

        // tell client it has changed room and tell room details
        user.send({
            type: 'room_change',
            data: room
        });

        User.forEach(function (iterUser) {
            if (iterUser.room === user.room) {
                if (iterUser.nick !== user.nick) {
                    // tell client about other clients in room
                    user.send({
                        type: 'appear',
                        obj: iterUser.obj,
                        nick: iterUser.nick,
                        special: iterUser.special,
                        joining: false
                    });
                    // tell other clients in room about client
                    iterUser.send({
                        type: 'appear',
                        obj: user.obj,
                        nick: user.nick,
                        special: user.special,
                        joining: true
                    });
                }
            }
        });

        // tell client about room list & user count
        user.send({
            type: 'room_list',
            list: this.getList(),
            user_count: User.userCount,
            mod_count: User.modCount
        });
    },
    sanitiseObject: function sanitiseObject(obj, nick) {
        obj.owner = nick;
        return obj;
    },
    hasObject: function (roomName, objectName) {
        var room = this.get(roomName);

        return room.objects.hasOwnProperty(objectName);
    },
    addObject: function (roomName, owner, objectName, object) {
        var room = this.get(roomName);

        object = this.sanitiseObject(object, owner);
        room.objectOrder.push(objectName);
        room.objects[objectName] = object;
        this.save();

        // broadcast new state to other clients in same room
        User.forEach(function (iterUser) {
            if (iterUser.room === roomName) {
                iterUser.send({
                    type: 'object_add',
                    data: object,
                    name: objectName
                });
            }
        });
    },
    updateObject: function (roomName, objectName, object) {
        var room = this.get(roomName);

        object = this.sanitiseObject(object, room.objects[objectName].owner);
        room.objects[objectName] = object;
        this.save();

        // broadcast new state to other clients in same room
        User.forEach(function (iterUser) {
            if (iterUser.room === roomName) {
                iterUser.send({
                    type: 'object_update',
                    data: object,
                    name: objectName
                });
            }
        });
    },
    deleteObject: function (roomName, objectName) {
        var room = this.get(roomName);

        room.objectOrder.splice(room.objectOrder.indexOf(objectName), 1);
        delete room.objects[objectName];
        this.save();

        // broadcast new state to other clients in same room
        User.forEach(function (iterUser) {
            if (iterUser.room === roomName) {
                iterUser.send({
                    type: 'object_delete',
                    name: objectName
                });
            }
        });
    },
    canCreateObject: function (roomName, nick) {
        var room = this.get(roomName);

        return (room.owner === nick || User.isModerator(nick) || room.publicEdit);
    },
    canEditObject: function (roomName, nick, objectName) {
        var room = this.get(roomName), object = room.objects[objectName];

        return (room.owner === nick || object.owner === nick || User.isModerator(nick));
    }
};

Rooms.init();

module.exports = Rooms;
