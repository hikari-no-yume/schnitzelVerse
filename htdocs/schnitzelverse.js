(function () {
    'use strict';

    var socket, connected = false, connecting = false, ignoreDisconnect = false, pageFocussed = false, billyMays = false, unseenHighlights = 0,
        me, myNick, myRoom = null, mySpecialStatus, inventory = [], friends = [],
        roomObjects = {}, roomObjectOrder = [],
        blockMovement = false, moveInterval = null, oldImgIndex = 0,
        cameraX = 0, cameraY = 0,
        editing = false, selected = null,
        currentUser = null,
        lastmove = (new Date().getTime()),
        globalUserCount = 0, globalModCount = 0,
        openProfiles = {}, openPMLogs = {},
        stars = [];

    var container,
        worldcanvas, ctx,
        topbuttons,
        roomsettingsbutton, roomsettings, publiceditlabel, publicedit, eighteenpluslabel, eighteenplus,
        editbutton, editdlg, objectlist, newobjectbtn, editprops, editpropshead, editpropsupdate, editpropsdelete,
        accountsettings, accountsettingsbutton, changepassbutton, rmpassbutton, sethomebutton,
        bitcount,
        inventorylist, inventorylistbutton,
        friendslist, friendslistbutton,
        uploader, uploaderiframe,
        roomlistbutton, roomlist, refreshbutton, homebutton,
        chatbar, chatbox, chatboxholder, chatbutton, chatlog, chatloglock, chatloglocked = false;

    var userManager = {
        users: {},
        userCount: 0,
        userCounter: null,

        initGUI: function () {
            this.userCounter = document.createElement('div');
            this.userCounter.id = 'usercounter';
            this.userCounter.style.display = 'none';
            this.updateCounter();
            container.appendChild(this.userCounter);
        },
        showUserCounter: function () {
            this.userCounter.style.display = 'block';
        },
        add: function (nick, obj, special, me, doLog) {
            if (this.has(nick)) {
                throw new Error("There is already a user with the same nick.");
            }

            this.users[nick.toLowerCase()] = {
                obj: obj,
                nick: nick,
                special: special,
                lastMsg: null,
                lastMsgTime: secs(),
                lastPosX: 0,
                lastPosY: 0,
                lastPosTime: secs()
            };

            this.update(nick, obj);
            this.userCount++;
            this.updateCounter();
            if (doLog) {
                logJoinInChat(nick, special);
            }
        },
        update: function (nick, obj) {
            this.hasCheck(nick);

            var user = this.users[nick.toLowerCase()];

            // log chat message if it has changed
            if (obj.chat !== user.lastMsg) {
                if (obj.chat !== '' && user.lastMsg !== null) {
                    logInChat(nick, obj.chat, user.special);
                }
                user.lastMsg = obj.chat;
                user.lastMsgTime = secs();
            }

            // note if moved
            if (obj.x !== user.lastPosX || obj.y !== user.lastPosY) {
                user.lastPosX = user.obj.x;
                user.lastPosY = user.obj.y;
                user.lastPosTime = secs();
            }

            user.obj = obj;
            if (nick === myNick) {
                me = obj;
            }
        },
        kill: function (nick, doLog) {
            this.hasCheck(nick);

            var user = this.users[nick.toLowerCase()];
            this.userCount--;
            this.updateCounter();
            if (doLog) {
                logLeaveInChat(nick, user.special);
            }
            delete this.users[nick.toLowerCase()];
        },
        get: function (nick) {
            nick = nick.toLowerCase();
            this.hasCheck(nick);
            return this.users[nick];
        },
        has: function (nick) {
            nick = nick.toLowerCase();
            return this.users.hasOwnProperty(nick);
        },
        hasCheck: function (nick) {
            if (!this.has(nick)) {
                throw new Error('There is no user with the nick: "' + nick + '"');
            }
        },
        forEach: function (callback) {
            for (var nick in this.users) {
                if (this.users.hasOwnProperty(nick)) {
                    if (callback(this.users[nick]) === 'stop') {
                        return;
                    }
                }
            }
        },
        updateCounter: function () {
            this.userCounter.innerHTML = '';
            var str;
            if (myRoom !== null) {
                str = myRoom.name;
                str += ' (owned by "' + myRoom.owner + '" - open to ' + (myRoom.eighteenPlus ? '18+ only' : 'everyone') + ' - public editing ' + (myRoom.publicEdit ? 'enabled' : 'disabled') + ')';
                str += ' - ' + this.userCount + '/' + globalUserCount + ' users';
            } else {
                str = globalUserCount + ' users online';
            }
            str += ' (' + globalModCount + ' mods online)';
            appendText(this.userCounter, str);
        }
    };

    var imageCache = {
        cache: {},

        get: function (id) {
            var img, that = this;

            if (!id) {
                return null;
            }
            if (!this.cache.hasOwnProperty(id)) {
                img = document.createElement('img');
                if (window.location.hostname === 'localhost') {
                    img.src = 'http://localhost:9002/assets/' + id;
                } else {
                    img.src = 'http://schnitzelverse.ajf.me/assets/' + id;
                }
                this.cache[id] = null;
                img.onload = function () {
                    that.cache[id] = {
                        img: img,
                        width: img.width,
                        height: img.height
                    };
                };
            }
            return this.cache[id];
        }
    };

    function shallowCopy(obj) {
        var copy = {}, property;

        for (property in obj) {
            if (obj.hasOwnProperty(property)) {
                copy[property] = obj[property];
            }
        }

        return copy;
    }

    function secs() {
        return new Date().getTime() / 1000;
    }

    function amModerator() {
        var status = mySpecialStatus;
        return (status === 'moderator' || status === 'developer' || status === 'creator' || status === 'bot');
    }

    function pushState() {
        if (connected) {
            socket.send(JSON.stringify({
                type: 'update',
                obj: me
            }));
        }
    }

    function pushAndUpdateState(newState) {
        userManager.update(myNick, newState);
        pushState();
    }

    function translateViewport(x, y) {
        var vpW = window.innerWidth, vpH = window.innerHeight - 36;

        cameraX = Math.floor(vpW / 2 - x);
        cameraY = Math.floor(vpH / 2 - y);
    }

    function appendText(parent, text) {
        parent.appendChild(document.createTextNode(text));
    }

    function appendNickname(parent, nick, special) {
        var nickname = document.createElement('span');
        nickname.className = 'nickname';
        if (special !== false) {
            nickname.className += ' ' + special;
        }
        nickname.onclick = function () {
            socket.send(JSON.stringify({
                type: 'profile_get',
                nick: nick
            }));
        };
        appendText(nickname, nick);
        parent.appendChild(nickname);
    }

    function appendTextAutoLink(parent, text) {
        var pos;
        while (((pos = text.indexOf('http://')) !== -1) || ((pos = text.indexOf('https://')) !== -1)) {
            var pos2 = text.indexOf(' ', pos);
            var anchor = document.createElement('a');
            anchor.className = 'chat-link';
            anchor.target = '_blank';
            if (pos2 === -1) {
                appendText(parent, text.substr(0, pos));
                anchor.href = text.substr(pos);
                appendText(anchor, text.substr(pos));

                text = '';
            } else {
                appendText(parent, text.substr(0, pos));
                anchor.href = text.substr(pos, pos2 - pos);
                appendText(anchor, text.substr(pos, pos2 - pos));
                text = text.substr(pos2);
            }
            parent.appendChild(anchor);
        }
        appendText(parent, text);
    }

    function tabNotify() {
        if (!pageFocussed) {
            unseenHighlights++;
            document.title = '(' + unseenHighlights + ') schnitzelVerse';
        }
    }

    function chatPrint(targets, bits, className) {
        for (var i = 0; i < targets.length; i++) {
            var target = targets[i];

            var span = document.createElement('span');
            span.className = 'chat-line';

            if (className) {
                span.className += ' ' + className;
            }

            for (var j = 0; j < bits.length; j++) {
                var bit = bits[j];

                if (bit[0] === 'nick') {
                    appendNickname(span, bit[1], bit[2]);
                } else if (bit[0] === 'text') {
                    appendTextAutoLink(span, bit[1]);
                }
            }

            span.appendChild(document.createElement('br'));

            if (target === 'chatlog') {
                if (chatloglocked) {
                    var ph = chatlog.scrollHeight;
                    chatlog.insertBefore(span, chatlog.firstChild);
                    if (chatlog.scrollTop !== 0) {
                        var increase = chatlog.scrollHeight - ph;
                        chatlog.scrollTop += increase;
                    }
                } else {
                    chatlog.insertBefore(span, chatlog.firstChild);
                }
            } else {
                target.appendChild(span);
            }
        }
    }

    function highlightCheck(msg) {
        if (msg.indexOf(myNick) !== -1) {
            tabNotify();
            return 'highlight';
        }
        return '';
    }

    function modCheck(special) {
        if (special !== false) {
            return 'modspeak';
        }
        return '';
    }

    function logInChat(nick, msg, special) {
        chatPrint(['chatlog'], [
            ['nick', nick, special],
            ['text', ': ' + msg]
        ], highlightCheck(msg) + ' ' + modCheck(special));
    }

    function logKickNoticeInChat(modNick, modSpecial, kickeeNick, kickeeSpecial, reason) {
        var lines = [
            ['nick', kickeeNick, kickeeSpecial],
            ['text', ' was kicked by '],
            ['nick', modNick, modSpecial]
        ];
        if (reason) {
            lines.push(['text', ' because: "' + reason + '"']);
        }
        chatPrint(['chatlog'], lines, 'kick');
    }

    function logKickBanNoticeInChat(modNick, modSpecial, kickeeNick, kickeeSpecial, reason) {
        var lines = [
            ['nick', kickeeNick, kickeeSpecial],
            ['text', ' was kicked and banned by '],
            ['nick', modNick, modSpecial]
        ];
        if (reason) {
            lines.push(['text', ' because: "' + reason + '"']);
        }
        chatPrint(['chatlog'], lines, 'kick');
    }

    function logBroadcastInChat(msg) {
        chatPrint(['chatlog'], [
            ['text', 'BROADCAST: ' + msg]
        ], 'broadcast');
    }

    function logSentConsoleCommandInChat(msg) {
        chatPrint(['chatlog'], [
            ['text', 'CONSOLE <- /' + msg]
        ], 'console');
    }

    function logConsoleMessageInChat(msg) {
        chatPrint(['chatlog'], [
            ['text', 'CONSOLE -> ' + msg]
        ], 'console');
    }

    function logJoinInChat(nick, special) {
        chatPrint(['chatlog'], [
            ['nick', nick, special],
            ['text', ' joined']
        ], 'leave-join');
    }

    function logLeaveInChat(nick, special) {
        chatPrint(['chatlog'], [
            ['nick', nick, special],
            ['text', ' left']
        ], 'leave-join');
    }

    function logRoomJoinInChat(name) {
        chatPrint(['chatlog'], [
            ['nick', myNick, mySpecialStatus],
            ['text', ' joined the room "' + name + '"']
        ], 'leave-join');
    }

    function updateRoomList(rooms) {
        var preview, img, title;
        roomlist.content.innerHTML = '';

        // refresh button
        var refreshbutton = document.createElement('button');
        appendText(refreshbutton, 'Refresh list');
        refreshbutton.onclick = function () {
            socket.send(JSON.stringify({
                type: 'room_list'
            }));
        };
        roomlist.content.appendChild(refreshbutton);

        // create new button
        var newbtn = document.createElement('button');
        appendText(newbtn, 'Create new room');
        newbtn.onclick = function () {
            var roomName = prompt('Choose a room name (cannot contain spaces)', '');
            if (roomName.indexOf(' ') === -1) {
                socket.send(JSON.stringify({
                    type: 'room_change',
                    name: roomName
                }));
                roomlist.hide();
            } else {
                alert('Room names cannot contain spaces.');
            }
        };
        roomlist.content.appendChild(newbtn);

        var outer = document.createElement('ul');
        for (var i = 0; i < rooms.length; i++) {
            var data = rooms[i];
            var item = document.createElement('li');
            if (data.pinned) {
                item.className = 'pinned';
            } else if (!data.user_count) {
                item.className = 'empty-room';
            } else {
                if (data.eighteen_plus) {
                    item.className = 'eighteen-plus';
                } else {
                    item.className = 'open-to-everyone';
                }
            }
            appendText(item, '"' + data.name + '" (' + data.user_count + ' users) - ' + (data.eighteen_plus ? '18+ ONLY' : 'open to everyone'));
            
            (function (name) {
                item.onclick = function () {
                    socket.send(JSON.stringify({
                        type: 'room_change',
                        name: name
                    }));
                    roomlist.hide();
                };
            }(data.name));
            
            outer.appendChild(item);
        }
        roomlist.content.appendChild(outer);

        // show list button
        roomlistbutton.disabled = false;
    }

    function changeRoom(room) {
        // clear users
        userManager.forEach(function (iterUser) {
            userManager.kill(iterUser.nick, false);
        });

        myRoom = room;

        // jump to room centre
        me.x = me.y = 0;

        // add me
        userManager.add(myNick, me, mySpecialStatus, true, false);

        // push state
        pushAndUpdateState(me);

        logRoomJoinInChat(room.name);

        // update URL hash
        window.location.hash = room.name;

        // check if I own this room
        if (room.owner === myNick) {
            // enable room settings
            roomsettingsbutton.disabled = false;

            // update checkbox value
            publicedit.checked = room.publicEdit;
            eighteenplus.checked = room.eighteenPlus;
        } else {
            // disable room settings
            roomsettingsbutton.disabled = true;

            // hide room settings dialog
            roomsettings.hide();
        }

        // check if I can edit
        if (room.owner === myNick || amModerator() || room.publicEdit) {
            // enable edit button
            editbutton.disabled = false;
        } else {
            // disable edit button
            editbutton.disabled = true;

            // hide edit dialog
            editdlg.hide();
        }

        // enable set home button
        sethomebutton.disabled = false;

        // update object list
        refreshObjectList();
    }

    function showPMLog(nick) {
        function log (from, body, special) {
            chatPrint([messages], [
                ['nick', from, special],
                ['text', ': ' + body]
            ]);
            messages.scrollTop = messages.scrollHeight;
        }
        function logFail () {
            chatPrint([messages], [
                ['text', 'warning: sending the previous message failed - user is not online']
            ], 'leave-join');
            messages.scrollTop = messages.scrollHeight;
        }
        function doSend () {
            if (replybox.value) {
                socket.send(JSON.stringify({
                    type: 'priv_msg',
                    nick: nick,
                    msg: replybox.value
                }));

                log(myNick, replybox.value, mySpecialStatus);

                replybox.value = '';
            }
        }

        if (openPMLogs.hasOwnProperty(nick)) {
            openPMLogs[nick].popup.show();
        } else {
            var popup = makePopup('.pm-log', 'PRIVMSG - ' + nick, true, 250, 250, true, function () {
                delete openPMLogs[nick];
                popup.destroy();
            });

            var messages = document.createElement('div');
            messages.className = 'pm-log-messages';
            popup.content.appendChild(messages);

            var replybox = document.createElement('input');
            replybox.type = 'text';
            replybox.className = 'pm-log-replybox';
            replybox.onkeypress = function (e) {
                // enter
                if (e.which === 13) {
                    doSend();
                    e.preventDefault();
                    replybox.blur();
                    return false;
                }
            };
            replybox.onfocus = function () {
                blockMovement = true;
            };
            replybox.onblur = function () {
                blockMovement = false;
            };
            popup.content.appendChild(replybox);

            var replybtn = document.createElement('button');
            replybtn.className = 'pm-log-replybtn';
            appendText(replybtn, 'Send');
            replybtn.onclick = function () {
                doSend();
            };
            popup.content.appendChild(replybtn);

            var pmlog = {
                popup: popup,
                replybox: replybox,
                replybtn: replybtn,
                messages: messages,
                log: log,
                logFail: logFail
            };

            openPMLogs[nick] = pmlog;
        }
    }

    function logPrivmsgInChat(nick, msg, special) {
        showPMLog(nick);
        openPMLogs[nick].log(nick, msg, special);
        tabNotify();
    }

    function logPrivmsgFailInChat(nick) {
        showPMLog(nick);
        openPMLogs[nick].logFail();
    }

    function showProfile(profile, modMode) {
        if (openProfiles.hasOwnProperty(profile.nick)) {
            openProfiles[profile.nick].hide();
        }

        var popup = makePopup('.profile', 'Profile - ' + profile.nick, true, 250, 250, true, function () {
            delete openProfiles[profile.nick];
            popup.destroy();
        });

        var h3 = document.createElement('h3');
        appendText(h3, profile.nick);
        popup.content.appendChild(h3);

        if (profile.online) {
            appendText(popup.content, profile.nick + ' is online');
        } else {
            appendText(popup.content, profile.nick + " isn't online");
        }

        var button;

        if (friends.indexOf(profile.nick) !== -1) {
            button = document.createElement('button');
            appendText(button, 'Remove friend');
            button.onclick = function (e) {
                socket.send(JSON.stringify({
                    type: 'friend_remove',
                    nick: profile.nick
                }));
                popup.hide();
            };
            popup.content.appendChild(button);
        } else {
            button = document.createElement('button');
            appendText(button, 'Add friend');
            button.onclick = function (e) {
                socket.send(JSON.stringify({
                    type: 'friend_add',
                    nick: profile.nick
                }));
                popup.hide();
            };
            popup.content.appendChild(button);
        }

        button = document.createElement('button');
        var icon = document.createElement('img');
        icon.src = '/media/icons/house.png';
        icon.className = 'house-link';
        button.appendChild(icon);
        appendText(button, 'Go to home');
        button.onclick = function (e) {
            socket.send(JSON.stringify({
                type: 'home_go',
                nick: profile.nick
            }));
            popup.hide();
        };
        popup.content.appendChild(button);

        button = document.createElement('button');
        appendText(button, 'Report to moderators');
        button.onclick = function () {
            var reason = prompt('This will report this person to the moderators.\nOnly do this if you believe they have done something wrong.\nIf you abuse this feature moderators may take action against you.\n\nReason for reporting:', '');
            if (reason !== null) {
                socket.send(JSON.stringify({
                    type: 'user_report',
                    nick: profile.nick,
                    reason: reason
                }));
                alert('Your report has been sent and will be reviewed shortly.');
                popup.hide();
            } else {
                alert('You must specify a reason for reporting them.');
            }
        };
        popup.content.appendChild(button);

        if (profile.online) {
            button = document.createElement('button');
            appendText(button, 'Send private message');
            button.onclick = function (e) {
                showPMLog(profile.nick);
                popup.hide();
            };
            popup.content.appendChild(button);

            button = document.createElement('button');
            appendText(button, 'Go to current room');
            button.onclick = function (e) {
                socket.send(JSON.stringify({
                    type: 'room_change',
                    name: profile.room
                }));
                popup.hide();
            };
            if (profile.room === null) {
                button.disabled = true;
            }
            popup.content.appendChild(button);

            if (modMode) {
                popup.content.appendChild(document.createElement('hr'));

                button = document.createElement('button');
                appendText(button, 'Kick');
                button.onclick = function (e) {
                    var reason = prompt('Kick reason:', '');
                    if (reason !== null) {
                        socket.send(JSON.stringify({
                            type: 'console_command',
                            cmd: 'kick ' + profile.nick + ' ' + reason
                        }));
                        popup.hide();
                    }
                };
                popup.content.appendChild(button);

                button = document.createElement('button');
                appendText(button, 'Kickban');
                button.onclick = function (e) {
                    var reason = prompt('Kickban reason:', '');
                    if (reason !== null) {
                        socket.send(JSON.stringify({
                            type: 'console_command',
                            cmd: 'kickban ' + profile.nick + ' ' + reason
                        }));
                        popup.hide();
                    }
                };
                popup.content.appendChild(button);

                button = document.createElement('button');
                appendText(button, 'Warn');
                button.onclick = function (e) {
                    var reason = prompt('Warning reason:', '');
                    if (reason !== null) {
                        socket.send(JSON.stringify({
                            type: 'console_command',
                            cmd: 'warn ' + profile.nick + ' ' + reason
                        }));
                        popup.hide();
                    }
                };
                popup.content.appendChild(button);

                button = document.createElement('button');
                appendText(button, 'List Aliases');
                button.onclick = function (e) {
                    socket.send(JSON.stringify({
                        type: 'console_command',
                        cmd: 'aliases ' + profile.nick
                    }));
                    popup.hide();
                };
                popup.content.appendChild(button);

                button = document.createElement('button');
                appendText(button, 'Last 10 Mod Reports');
                button.onclick = function (e) {
                    socket.send(JSON.stringify({
                        type: 'console_command',
                        cmd: 'modmsgs 10 ' + profile.nick
                    }));
                    popup.hide();
                };
                popup.content.appendChild(button);
            }
        }

        openProfiles[profile.nick] = popup;
    }

    function makePopup(tag, title, moveable, x, y, hideable, onhide, onshow) {
        var popup = {
            container: null,
            titlebar: null,
            title: null,
            closebutton: null,
            content: null,
            visible: true,
            hide: function () {
                if (this.visible) {
                    this.visible = false;
                    this.container.style.display = 'none';
                    if (onhide) {
                        onhide();
                    }
                }
            },
            show: function () {
                if (!this.visible) {
                    this.visible = true;
                    this.container.style.display = 'block';
                    if (onshow) {
                        onshow();
                    }
                }
            },
            destroy: function () {
                container.removeChild(this.container);
                var keys = Object.keys(this);
                for (var i = 0; i < keys.length; i++) {
                    delete this[keys];
                }
            }
        };

        popup.container = document.createElement('div');
        popup.container.className = 'popup';
        if (tag[0] === '.') {
            popup.container.className += ' ' + tag.substr(1);;
        } else if (tag[0] === '#') {
            popup.container.id = tag.substr(1);
        }

        popup.titlebar = document.createElement('div');
        popup.titlebar.className = 'popup-titlebar';
        popup.container.appendChild(popup.titlebar);

        popup.title = document.createElement('h2');
        appendText(popup.title, title);
        popup.titlebar.appendChild(popup.title);

        if (moveable) {
            var oX, oY, popupX, popupY, down = false;

            popup.container.style.left = x + 'px';
            popup.container.style.top = y + 'px';

            popup.titlebar.onmousedown = function (e) {
                down = true;
                oX = e.clientX;
                oY = e.clientY;
                popupX = parseInt(popup.container.style.left);
                popupY = parseInt(popup.container.style.top);
                document.body.onmousemove = popup.titlebar.onmousemove;
            };
            popup.titlebar.onmousemove = function (e) {
                if (down) {
                    popup.container.style.left = (e.clientX - oX) + popupX + 'px';
                    popup.container.style.top = (e.clientY - oY) + popupY + 'px';
                }
            };
            popup.titlebar.onmouseup = function () {
                down = false;
                document.body.onmousemove = null;
            };
        }

        if (hideable) {
            popup.hidebutton = document.createElement('button');
            popup.hidebutton.className = 'popup-hide';
            popup.hidebutton.title = 'Hide popup';
            popup.hidebutton.onclick = function () {
                popup.hide();
            };
            appendText(popup.hidebutton, 'x');
            popup.titlebar.appendChild(popup.hidebutton);
        }

        popup.content = document.createElement('div');
        popup.content.className = 'popup-content';
        popup.container.appendChild(popup.content);

        container.appendChild(popup.container);

        return popup;
    }

    function renderFriendsList() {
        friendslist.content.innerHTML = '';
        if (friends.length) {
            var ul = document.createElement('ul');
            for (var i = 0; i < friends.length; i++) {
                var li = document.createElement('li');
                var a = document.createElement('a');
                a.className = 'friend';
                appendText(a, friends[i]);
                (function (friend) {
                    a.onclick = function () {
                        socket.send(JSON.stringify({
                            type: 'profile_get',
                            nick: friend
                        }));
                    };
                }(friends[i]));
                li.appendChild(a);

                appendText(li, ' (');

                var delbtn = document.createElement('button');
                delbtn.className = 'friend-remove';
                (function (friend) {
                    delbtn.onclick = function () {
                        socket.send(JSON.stringify({
                            type: 'friend_remove',
                            nick: friend
                        }));
                    };
                }(friends[i]));
                appendText(delbtn, 'remove');
                li.appendChild(delbtn);

                appendText(li, ')');

                ul.appendChild(li);
            }
            friendslist.content.appendChild(ul);
        } else {
            appendText(friendslist.content, 'You have no friends.');
        }
    }

    function renderInventoryList() {
        var i, item, elem, list, uploaderbtn;

        inventorylist.content.innerHTML = '';
        uploaderbtn = document.createElement('button');
        appendText(uploaderbtn, 'Upload new asset');
        uploaderbtn.onclick = function () {
            uploader.show();
        };
        inventorylist.content.appendChild(uploaderbtn);

        if (inventory.length) {
            list = document.createElement('ul');
            for (var i = 0; i < inventory.length; i++) {
                item = inventory[i];
                elem = document.createElement('li');
                if (item.type === 'asset') {
                    appendText(elem, 'Asset - ' + item.data.type + ' - ' + item.data.desc);
                    (function (assetID, itemID) {
                        var btn;

                        btn = document.createElement('button');
                        appendText(btn, 'Set as avatar');
                        btn.onclick = function () {
                            var newState = shallowCopy(me);
                            newState.img = assetID;
                            localStorage.setItem('last-avatar', assetID);
                            pushAndUpdateState(newState);
                        };
                        elem.appendChild(btn);

                        btn = document.createElement('button');
                        appendText(btn, 'Delete asset');
                        btn.onclick = function () {
                            if (confirm('Are you sure you want to delete this asset? Once it is deleted, any objects using it may not show up correctly.')) {
                                socket.send(JSON.stringify({
                                    type: 'asset_delete',
                                    id: assetID,
                                    itemID: itemID
                                }));
                            }
                        };
                        elem.appendChild(btn);
                    }(item.data.id, i));
                } else {
                    appendText(elem, 'Unknown item type: ' + item.type);
                }
                list.appendChild(elem);
            }
            inventorylist.content.appendChild(list);
        } else {
            appendText(inventorylist.content, 'You have no inventory items.');
        }
    }

    function refreshObjectList(makeSelected) {
        var i, option;

        objectlist.innerHTML = '';

        option = document.createElement('option');
        option.value = '';
        appendText(option, 'Choose an object...');
        objectlist.appendChild(option);

        if (myRoom) {
            for (i = 0; i < myRoom.objectOrder.length; i++) {
                option = document.createElement('option');
                option.value = myRoom.objectOrder[i];
                appendText(option, myRoom.objectOrder[i]);
                objectlist.appendChild(option);

                if (myRoom.objectOrder[i] === makeSelected) {
                    objectlist.selectedIndex = i + 1;
                    objectlist.onchange();
                }
            }
        }
    }

    function handleChatMessage() {
        var newState;

        // is command
        if (chatbox.value[0] === '/') {
            if (chatbox.value.substr(0, 10) === '/BILLYMAYS') {
                billyMays = !billyMays;
            }
            socket.send(JSON.stringify({
                type: 'console_command',
                cmd: chatbox.value.substr(1)
            }));
            logSentConsoleCommandInChat(chatbox.value.substr(1));
        // is chat message
        } else {
            newState = shallowCopy(me);
            if (billyMays) {
                newState.chat = chatbox.value.toUpperCase();
            } else {
                newState.chat = chatbox.value;
            }
            pushAndUpdateState(newState);
        }
        chatbox.value = '';
    }

    function selectAsset(type, element) {
        var popup, i, item, ul, li;

        popup = makePopup('.asset-chooser', 'Choose asset', true, 200, 200, true, function () {
            popup.destroy();
        });

        ul = document.createElement('ul');

        for (i = 0; i < inventory.length; i++) {
            item = inventory[i];
            if (item.type !== 'asset') {
                continue;
            }
            if (type === 'image' && !(item.data.type === 'image/png' || item.data.type === 'image/gif' || item.data.type === 'image/jpeg')) {
                continue;
            }

            li = document.createElement('li');
            appendText(li, item.data.type + ' - ' + item.data.desc);
            (function (itemID) {
                li.onclick = function () {
                    element.value = itemID;
                    popup.hide();
                };
            }(item.data.id));
            ul.appendChild(li);
        }

        popup.content.appendChild(ul);
    }

    function limitAvatarSize(width, height) {
        if (width > height) {
            if (width > 150) {
                height = height * (150/width);
                width = 150;
            }
        } else {
            if (height > 150) {
                width = width * (150/height);
                height = 150;
            }
        }
        return {
            width: width,
            height: height
        };
    }

    function tween(start, end, t) {
        return start + (end - start) * t;
    }

    function render() {
        var radGrad, i, object, objectName, img, x, y, delta, self, star, starnum, starspeed, now, size;

        worldcanvas.width = window.innerWidth;
        worldcanvas.height = window.innerHeight;

        starnum = Math.floor(Math.sqrt(worldcanvas.width * worldcanvas.height) / 2);
        starspeed = 115;

        if (stars.length < starnum - 1) {
            for (i = stars.length; i < starnum; i += 1) {
                star = {
                    x: Math.random() * worldcanvas.width,
                    y: Math.random() * worldcanvas.height,
                    depth: Math.pow(Math.random(), 2),
                    prev: secs()
                };
                stars.push(star);
            }
        } else if (stars.length > starnum - 1) {
            stars.splice(starnum);
        }

        for (i = 0; i < stars.length; i += 1) {
            now = secs();
            stars[i].x -= stars[i].depth * starspeed * (now - stars[i].prev);
            stars[i].prev = now;

            while (stars[i].x < 0) {
                stars[i].x += worldcanvas.width;
            }

            size = 3 * stars[i].depth;
            ctx.fillStyle = 'white';
            ctx.fillRect(stars[i].x - size / 2, stars[i].y - size / 2, size, size);
        }

        if (myRoom) {
            // tween my user position for camera
            self = userManager.get(myNick);
            delta = secs() - self.lastPosTime;
            if (delta < 0.25) {
                x = tween(self.lastPosX, self.obj.x, delta / 0.25);
                y = tween(self.lastPosY, self.obj.y, delta / 0.25);
            } else {
                x = self.obj.x;
                y = self.obj.y;
            }
            translateViewport(x, y);

            ctx.save();
            ctx.translate(cameraX, cameraY);

            // room background
            ctx.rect(-400, -400, 800, 800);
            radGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 400);
            radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            radGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = radGrad;
            ctx.fill();

            // objects
            for (i = 0; i < myRoom.objectOrder.length; i++) {
                objectName = myRoom.objectOrder[i];
                object = myRoom.objects[objectName];

                ctx.save();
                ctx.translate(object.x, object.y);

                ctx.rotate(object.angle * (Math.PI/180));

                if (editing) {
                    if (selected === objectName) {
                        ctx.strokeStyle = 'red';
                    } else {
                        ctx.strokeStyle = 'lime';
                    }
                    ctx.strokeRect(-object.width/2, -object.height/2, object.width, object.height);
                }

                ctx.globalAlpha = object.alpha / 255;

                img = imageCache.get(object.img);
                if (img) {
                    ctx.drawImage(img.img, -object.width/2, -object.height/2, object.width, object.height);
                }

                ctx.globalAlpha = 1;

                // script
                if (object.script) {
                    ctx.save();
                    ctx.translate(-object.width/2, -object.height/2);
                    ctx.beginPath();
                    ctx.rect(0, 0, object.width, object.height);
                    ctx.clip();
                    fjord.exec(object.script, {
                        playerX: Math.floor(x),
                        playerY: Math.floor(y),
                        playerXRel: Math.floor(x - (object.x - object.width / 2)),
                        playerYRel: Math.floor(y - (object.y - object.height / 2)),
                        playerNick: myNick,
                        objectX: object.x,
                        objectY: object.y,
                        objectWidth: object.width,
                        objectHeight: object.height,
                        msecs: Math.floor(secs() * 1000)
                    }, ctx, object.width, object.height);
                    ctx.restore();
                }

                ctx.restore();
            }

            // users
            userManager.forEach(function (user) {
                var shadows = [
                        [-1, -1],
                        [1, -1],
                        [-1, 1],
                        [1, 1],
                        [0, -1],
                        [0, 1],
                        [-1, 0],
                        [1, 0]
                    ],
                    i, vOffset, dim, nick, measurement;

                ctx.save();

                // tween user positions
                delta = secs() - user.lastPosTime;
                if (delta < 0.25) {
                    x = tween(user.lastPosX, user.obj.x, delta / 0.25);
                    y = tween(user.lastPosY, user.obj.y, delta / 0.25);
                } else {
                    x = user.obj.x;
                    y = user.obj.y;
                }
                ctx.translate(x, y);

                img = imageCache.get(user.obj.img);
                if (img) {
                    dim = limitAvatarSize(img.width, img.height);
                    vOffset = dim.height / 2;
                    ctx.drawImage(img.img, -dim.width / 2, -vOffset, dim.width, dim.height);
                } else {
                    vOffset = 0;
                }
                vOffset += 15;

                ctx.font = 'bold 11pt sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseLine = 'top';
                ctx.fillStyle = 'white';
                ctx.shadowColor = 'black';

                nick = user.nick;

                if (user.special === 'creator') {
                    ctx.fillStyle = 'goldenrod';
                    nick += ' (sV creator)';
                } else if (user.special === 'developer') {
                    ctx.fillStyle = 'orangered';
                    nick += ' (sV developer)';
                } else if (user.special === 'moderator') {
                    ctx.fillStyle = '#7FFF00';
                    nick += ' (sV moderator)';
                } else if (user.special === 'bot') {
                    ctx.fillStyle = 'red';
                    nick += ' (bot)';
                } else {
                    ctx.fillStyle = 'white';
                }

                for (i = 0; i < shadows.length; i++) {
                    ctx.shadowOffsetX = shadows[i][0];
                    ctx.shadowOffsetY = shadows[i][1];
                    ctx.fillText(nick, 0, vOffset);
                }

                if (user.lastMsg) {
                    delta = 5 - (secs() - user.lastMsgTime);
                    if (delta > 0) {
                        ctx.globalAlpha = (delta < 1 ? delta : 1);
                        ctx.shadowColor = 'transparent';
                        ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
                        ctx.font = '10pt sans-serif';

                        measurement = ctx.measureText(user.lastMsg);

                        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                        ctx.fillRect(-measurement.width/2, -(vOffset + 20), measurement.width, 20);

                        ctx.fillStyle = 'black';
                        ctx.font = '10pt sans-serif';
                        ctx.textBaseLine = 'bottom';
                        ctx.fillText(user.lastMsg, 0, -(vOffset+5));
                    }
                }

                ctx.restore();
            });

            ctx.restore();
        }
        
        window.requestAnimationFrame(render);
    }

    function initGUI_chatbar() {
        chatlog = document.createElement('div');
        chatlog.id = 'chatlog';
        chatlog.className = 'unlocked';
        container.appendChild(chatlog);

        chatbar = document.createElement('div');
        chatbar.id = 'chatbar';
        container.appendChild(chatbar);

        chatloglock = document.createElement('button');
        chatloglock.id = 'chatlog-lock';
        appendText(chatloglock, 'Lock log');
        chatloglock.onclick = function () {
            chatloglocked = !chatloglocked;
            chatloglock.innerHTML = '';
            if (chatloglocked) {
                appendText(chatloglock, 'Unlock log');
                chatlog.className = 'locked';
            } else {
                appendText(chatloglock, 'Lock log');
                chatlog.className = 'unlocked';
                chatlog.scrollTop = 0;
            }
        };
        chatbar.appendChild(chatloglock);

        chatboxholder = document.createElement('div');
        chatboxholder.id = 'chatbox-holder';
        chatbar.appendChild(chatboxholder);

        chatbox = document.createElement('input');
        chatbox.type = 'text';
        chatbox.id = 'chatbox';
        chatbox.maxLength = 100;
        chatbox.onfocus = function () {
            blockMovement = true;
        };
        chatbox.onblur = function () {
            blockMovement = false;
        };
        chatbox.onkeypress = function (e) {
            // enter
            if (e.which === 13) {
                handleChatMessage();
                e.preventDefault();
                chatbox.blur();
                return false;
            }
        };
        chatbox.onkeydown = function (e) {
            var kc = e.keyCode || e.which;

            // tab completion
            if (kc === 9) {
                e.preventDefault();
                var parts = chatbox.value.split(' ');
                var lastpart = parts[parts.length - 1];
                userManager.forEach(function (user) {
                    if (user.nick === myNick) {
                        return;
                    }
                    if (user.nick.substr(0, lastpart.length).toLowerCase() === lastpart.toLowerCase()) {
                        if (parts.length === 1) {
                            parts[parts.length - 1] = user.nick + ':';
                        } else {
                            parts[parts.length - 1] = user.nick;
                        }
                        parts.push('');
                        chatbox.value = parts.join(' ');
                        return 'stop';
                    }
                });
                return false;
            }
        };
        chatbox.disabled = true;
        chatboxholder.appendChild(chatbox);

        chatbutton = document.createElement('input');
        chatbutton.type = 'submit';
        chatbutton.value = 'Send';
        chatbutton.id = 'chatbutton';
        chatbutton.onclick = function (e) {
            handleChatMessage();
        };
        chatbutton.disabled = true;
        chatbar.appendChild(chatbutton);

        inventorylistbutton = document.createElement('input');
        inventorylistbutton.id = 'inventory-list-button';
        inventorylistbutton.type = 'submit';
        inventorylistbutton.value = 'Inventory';
        inventorylistbutton.onclick = function () {
            inventorylist.show();
        };
        inventorylistbutton.disabled = true;
        chatbar.appendChild(inventorylistbutton);

        uploader = makePopup('#uploader', 'Upload a new asset', true, 300, 300, true, null, function () {
            var newurl;
            if (window.location.hostname === 'localhost') {
                newurl = 'http://localhost:9002/upload';
            } else {
                newurl = 'http://ajf.me:9002/upload';
            }
            newurl += '?nickname=' + myNick;
            uploaderiframe.src = newurl;
        });
        uploaderiframe = document.createElement('iframe');
        uploader.content.appendChild(uploaderiframe);
        uploader.hide();
    }

    function initGUI_editDlg() {
        var props = [
            {
                property: 'owner',
                type: 'readonly'
            },
            {
                property: 'img',
                type: 'asset_id'
            },
            {
                property: 'angle',
                type: 'number'
            },
            {
                property: 'alpha',
                type: 'number'
            },
            {
                property: 'x',
                type: 'number'
            },
            {
                property: 'y',
                type: 'number'
            },
            {
                property: 'width',
                type: 'number'
            },
            {
                property: 'height',
                type: 'number'
            },
            {
                property: 'script',
                type: 'script'
            }
        ], i, field, prop, btn;

        editbutton = document.createElement('button');
        editbutton.id = 'edit-button';
        appendText(editbutton, 'Edit objects');
        editbutton.onclick = function () {
            editdlg.show();
        };
        editbutton.disabled = true;
        topbuttons.appendChild(editbutton);

        roomsettingsbutton = document.createElement('button');
        roomsettingsbutton.id = 'room-settings-button';
        appendText(roomsettingsbutton, 'Room settings');
        roomsettingsbutton.onclick = function () {
            roomsettings.show();
        };
        roomsettingsbutton.disabled = true;
        topbuttons.appendChild(roomsettingsbutton);

        roomsettings = makePopup('#room-settings', 'Room settings', true, 300, 300, true);
        roomsettings.hide();

        publiceditlabel = document.createElement('label');
        roomsettings.content.appendChild(publiceditlabel);

        publicedit = document.createElement('input');
        publicedit.type = 'checkbox';
        publicedit.onchange = function () {
            socket.send(JSON.stringify({
                type: 'room_setpublicedit',
                enabled: publicedit.checked
            }));
        };
        publiceditlabel.appendChild(publicedit);
        appendText(publiceditlabel, ' enable public editing (other users can create objects)');

        eighteenpluslabel = document.createElement('label');
        roomsettings.content.appendChild(eighteenpluslabel);

        eighteenplus = document.createElement('input');
        eighteenplus.type = 'checkbox';
        eighteenplus.onchange = function () {
            socket.send(JSON.stringify({
                type: 'room_seteighteenplus',
                enabled: eighteenplus.checked
            }));
        };
        eighteenpluslabel.appendChild(eighteenplus);
        appendText(eighteenpluslabel, ' 18+ only');

        editdlg = makePopup('#edit-dlg', 'Edit objects', true, 300, 300, true, function () {
            editing = false;
        }, function () {
            editing = true;
            refreshObjectList();
        });
        editdlg.hide();

        objectlist = document.createElement('select');
        objectlist.onchange = function () {
            var i, prop;
            if (objectlist.value) {
                selected = objectlist.value;
                if (myRoom.owner === myNick || myRoom.objects[selected].owner === myNick || amModerator()) {
                    editprops.disabled = false;
                } else {
                    editprops.disabled = true;
                }

                for (i = 0; i < props.length; i++) {
                    prop = props[i];
                    prop.element.value = myRoom.objects[selected][prop.property] || '';
                }
            } else {
                selected = null;
                editprops.disabled = true;
            }
        };
        refreshObjectList();
        editdlg.content.appendChild(objectlist);

        newobjectbtn = document.createElement('button');
        newobjectbtn.id = 'new-object-btn';
        appendText(newobjectbtn, 'Create new object');
        newobjectbtn.onclick = function () {
            var objectName = prompt('Choose an object name', '');
            if (objectName) {
                socket.send(JSON.stringify({
                    type: 'object_add',
                    name: objectName,
                    data: {
                        img: '',
                        angle: 0,
                        alpha: 255,
                        x: me.x + 200,
                        y: me.y,
                        width: 50,
                        height: 50
                    }
                }));
            }
        };
        editdlg.content.appendChild(newobjectbtn);

        editprops = document.createElement('fieldset');
        editprops.disabled = true;
        editdlg.content.appendChild(editprops);

        editpropshead = document.createElement('legend');
        appendText(editpropshead, 'Properties');
        editprops.appendChild(editpropshead);

        for (i = 0; i < props.length; i++) {
            prop = props[i];

            appendText(editprops, prop.property + ': ');

            if (prop.type === 'readonly') {
                field = document.createElement('input');
                field.type = 'text';
                field.readonly = true;
                editprops.appendChild(field);
            } else if (prop.type == 'asset_id') {
                field = document.createElement('input');
                field.type = 'text';
                field.readonly = true;
                field.onfocus = function () {
                    blockMovement = true;
                };
                field.onblur = function () {
                    blockMovement = false;
                };
                editprops.appendChild(field);
                btn = document.createElement('button');
                appendText(btn, 'Choose asset');
                (function (elem) {
                    btn.onclick = function () {
                        selectAsset('image', elem);
                    };
                }(field));
                editprops.appendChild(btn);
            } else if (prop.type === 'script') {
                field = document.createElement('textarea');
                field.cols = 20;
                field.rows = 10;
                field.onfocus = function () {
                    blockMovement = true;
                };
                field.onblur = function () {
                    blockMovement = false;
                };
                editprops.appendChild(field);
                btn = document.createElement('a');
                btn.href = '/script_help.html';
                btn.target = '_blank';
                appendText(btn, 'script help');
                editprops.appendChild(btn);
            } else {
                field = document.createElement('input');
                field.type = prop.type;
                field.onfocus = function () {
                    blockMovement = true;
                };
                field.onblur = function () {
                    blockMovement = false;
                };
                editprops.appendChild(field);
            }

            editprops.appendChild(document.createElement('br'));

            prop.element = field;
        }

        editpropsupdate = document.createElement('button');
        editpropsupdate.id = 'edit-props-update';
        appendText(editpropsupdate, 'Update');
        editpropsupdate.onclick = function () {
            var i, prop;

            for (i = 0; i < props.length; i++) {
                prop = props[i];
                if (prop.type === 'number') {
                    myRoom.objects[selected][prop.property] = parseInt(prop.element.value || '');
                } else if (prop.type !== 'readonly') {
                    myRoom.objects[selected][prop.property] = prop.element.value || '';
                }
            }

            socket.send(JSON.stringify({
                type: 'object_update',
                name: selected,
                data: myRoom.objects[selected]
            }));
        };
        editprops.appendChild(editpropsupdate);

        editpropsdelete = document.createElement('button');
        editpropsdelete.id = 'edit-props-delete';
        appendText(editpropsdelete, 'Delete');
        editpropsdelete.onclick = function () {
            objectlist.selectedIndex = 0;
            editprops.disabled = true;

            socket.send(JSON.stringify({
                type: 'object_delete',
                name: selected
            }));
        };
        editprops.appendChild(editpropsdelete);
    }

    function initGUI_topbar() {
        topbuttons = document.createElement('div');
        topbuttons.id = 'top-buttons';
        container.appendChild(topbuttons);

        homebutton = document.createElement('button');
        var icon = document.createElement('img');
        icon.src = 'media/icons/house.png';
        icon.alt = icon.title = 'My House';
        homebutton.appendChild(icon);
        homebutton.id = 'home-button';
        homebutton.onclick = function () {
            socket.send(JSON.stringify({
                type: 'home_go',
                nick: myNick
            }));
        };
        homebutton.disabled = true;
        topbuttons.appendChild(homebutton);

        roomlist = makePopup('#room-list', 'Rooms', true, 200, 200, true);
        roomlist.hide();
        roomlistbutton = document.createElement('button');
        roomlistbutton.id = 'room-list-button';
        appendText(roomlistbutton, 'Choose room');
        roomlistbutton.onclick = function () {
            roomlist.show();
        };
        roomlistbutton.disabled = true;
        topbuttons.appendChild(roomlistbutton);

        accountsettingsbutton = document.createElement('input');
        accountsettingsbutton.id = 'account-settings-button';
        accountsettingsbutton.type = 'submit';
        accountsettingsbutton.value = 'My Account';
        accountsettingsbutton.onclick = function () {
            accountsettings.show();
        };
        accountsettingsbutton.disabled = true;
        topbuttons.appendChild(accountsettingsbutton);

        initGUI_editDlg();

        accountsettings = makePopup('#account-settings', 'My Account', true, 300, 300, true);
        accountsettings.hide();

        bitcount = document.createElement('div');
        bitcount.id = 'bit-count';
        bitcount.title = 'bits';
        appendText(bitcount, '???');
        accountsettings.content.appendChild(bitcount);

        friendslistbutton = document.createElement('button');
        friendslistbutton.id = 'friends-list-button';
        appendText(friendslistbutton, 'Friends');
        friendslistbutton.onclick = function () {
            friendslist.show();
        };
        friendslistbutton.disabled = true;
        accountsettings.content.appendChild(friendslistbutton);

        sethomebutton = document.createElement('button');
        sethomebutton.id = 'set-home-button';
        appendText(sethomebutton, 'Set this room as home');
        sethomebutton.onclick = function () {
            socket.send(JSON.stringify({
                type: 'home_set'
            }));
        };
        sethomebutton.disabled = true;
        accountsettings.content.appendChild(sethomebutton);

        changepassbutton = document.createElement('a');
        changepassbutton.href = 'https://login.persona.org';
        changepassbutton.className = 'button';
        changepassbutton.target = '_blank';
        appendText(changepassbutton, 'Change password etc.');
        changepassbutton.onclick = function () {
            accountsettings.hide();
            return true;
        };
        accountsettings.content.appendChild(changepassbutton);

        rmpassbutton = document.createElement('input');
        rmpassbutton.type = 'submit';
        rmpassbutton.value = 'Delete account';
        rmpassbutton.onclick = function () {
            if (confirm("Are you sure you want to delete your schnitzelVerse account?\nYou'll loose all of your bits, items, rooms, and your nickname!\nNote: This will *not* do anything to your Persona ID.")) {
                socket.send(JSON.stringify({
                    type: 'delete_account'
                }));
                accountsettings.hide();
            }
        };
        accountsettings.content.appendChild(rmpassbutton);


        inventorylist = makePopup('.chooser', 'Item inventory', true, 200, 200, true, null, function () {
            renderInventoryList();
        });
        inventorylist.hide();

        friendslist = makePopup('#friends-list', 'Friends', true, 200, 200, true, null, function () {
            renderFriendsList();
        });
        friendslist.hide();
    }

    function translate(x, y) {
        var newState;

        newState = shallowCopy(me);
        newState.x += x;
        newState.y += y;
        pushAndUpdateState(newState);
    }

    function initGUI() {
        document.body.id = 'schnitzelverse';

        container = document.getElementById('main');
        container.className = 'full';
        container.innerHTML = '';

        worldcanvas.outerHTML = '';
        worldcanvas = document.createElement('canvas');
        worldcanvas.id = 'world-canvas';
        container.appendChild(worldcanvas);

        ctx = worldcanvas.getContext('2d');

        worldcanvas.onclick = function (e) {
            var i, object, cur, x, y, x1, x2, y1, y2, newState;

            x = e.layerX - cameraX;
            y = e.layerY - cameraY;
            if (editing) {
                for (i = myRoom.objectOrder.length - 1; i >= 0; i--) {
                    object = myRoom.objects[myRoom.objectOrder[i]];
                    x1 = object.x - object.width / 2;
                    x2 = object.x + object.width / 2;
                    y1 = object.y - object.height / 2;
                    y2 = object.y + object.height / 2;
                    if (x1 <= x && x < x2 && y1 <= y && y < y2) {
                        refreshObjectList(myRoom.objectOrder[i]);
                        return;
                    }
                }
            } else {
                cur = (new Date().getTime());
                if (cur - lastmove > 400) {
                    newState = shallowCopy(me);
                    newState.x = x;
                    newState.y = y;
                    pushAndUpdateState(newState);
                    lastmove = cur;
                } else {
                    chatPrint(['chatlog'], [
                        ['text', 'You are doing that too often.']
                    ], '');
                }
            }
        };

        userManager.initGUI();

        initGUI_topbar();
        initGUI_chatbar();

        window.onfocus = function () {
            pageFocussed = true;
            document.title = 'schnitzelVerse';
            unseenHighlights = 0;
        };
        window.onblur = function () {
            pageFocussed = false;
        };
        document.body.onkeyup = function (e) {
            if (blockMovement) {
                return;
            }
            switch (e.keyCode || e.which) {
                // tab
                case 9:
                    chatbox.focus();
                    return false;
                // left
                case 37:
                // up
                case 38:
                // right
                case 39:
                // down
                case 40:
                    window.clearInterval(moveInterval);
                    moveInterval = null;
                    e.preventDefault();
                    return false;
            }
        };
        document.body.onkeydown = function (e) {
            if (blockMovement) {
                return;
            }
            switch (e.keyCode || e.which) {
                // left
                case 37:
                    if (!moveInterval) {
                        moveInterval = window.setInterval(function () {
                            translate(-100, 0);
                        }, 250);
                        translate(-100, 0);
                    }
                    e.preventDefault();
                    return false;
                // up
                case 38:
                    if (!moveInterval) {
                        moveInterval = window.setInterval(function () {
                            translate(0, -100);
                        }, 250);
                        translate(0, -100);
                    }
                    e.preventDefault();
                    return false;
                // right
                case 39:
                    if (!moveInterval) {
                        moveInterval = window.setInterval(function () {
                            translate(+100, 0);
                        }, 250);
                        translate(+100, 0);
                    }
                    e.preventDefault();
                    return false;
                // down
                case 40:
                    if (!moveInterval) {
                        moveInterval = window.setInterval(function () {
                            translate(0, +100);
                        }, 250);
                        translate(0, +100);
                    }
                    e.preventDefault();
                    return false;
            }
        };
    }

    function initNetwork(newAccount, assertion) {
        var loginform;

        loginform = document.getElementById('login-form');
        loginform.innerHTML = '';
        loginform.appendChild(document.createTextNode('Connecting...'));

        if (window.location.hostname === 'localhost') {
            socket = new WebSocket('ws://localhost:9002', 'schnitzelverse');
        } else {
            socket = new WebSocket('ws://ajf.me:9002', 'schnitzelverse');
        }
        connecting = true;

        socket.onopen = function () {
            connected = true;
            connecting = false;
            me = {
                img: localStorage.getItem('last-avatar', '') || '',
                x: 0,
                y: 0,
                chat: ''
            };
            socket.send(JSON.stringify({
                type: 'login',
                assertion: window.schnitzelVerse.assertion,
                mode: window.schnitzelVerse.mode,
                nick: window.schnitzelVerse.nick || null,
                obj: me
            }));
            initGUI();
        };
        socket.onclose = function (e) {
            if (connecting) {
                loginform.innerHTML = '';
                loginform.appendChild(document.createTextNode('Connecting failed. Server may be down.'));
                connecting = false;
            } else {
                connected = false;
                if (!ignoreDisconnect) {
                    alert('Error, lost connection!\nThis may be because:\n- Server shut down to be updated (try reloading)\n- Failed to connect (server\'s down)\n- Server crashed\n- You were kicked');
                    container.className = 'disconnected';
                    container.innerHTML = '';
                }
            }
        };
        socket.onmessage = function (e) {
            var msg = JSON.parse(e.data);
            switch (msg.type) {
                case 'appear':
                    userManager.add(msg.nick, msg.obj, msg.special, false, msg.joining);
                break;
                case 'update':
                    if (msg.nick !== myNick) {
                        userManager.update(msg.nick, msg.obj);
                    }
                break;
                case 'account_state':
                    chatbox.focus();

                    chatbox.disabled = false;
                    chatbutton.disabled = false;

                    myNick = msg.nick;
                    mySpecialStatus = msg.special;
                    bitcount.innerHTML = '';
                    if (msg.bits !== null) {
                        appendText(bitcount, msg.bits);
                    }
                    inventory = msg.inventory;
                    friends = msg.friends;
                    accountsettingsbutton.disabled = false;
                    changepassbutton.style.display = 'block';
                    rmpassbutton.style.display = 'block';
                    inventorylistbutton.disabled = false;
                    renderInventoryList();
                    friendslistbutton.disabled = false;
                    renderFriendsList();
                    homebutton.disabled = false;

                    if (myRoom === null) {
                        // schnitzelverse.ajf.me/#roomname shortcut
                        if (window.location.hash) {
                            socket.send(JSON.stringify({
                                type: 'room_change',
                                name: window.location.hash.substr(1)
                            }));
                        // otherwise show room chooser popup
                        } else {
                            roomlist.show();
                        }
                    }
                break;
                case 'broadcast':
                    logBroadcastInChat(msg.msg);
                break;
                case 'console_msg':
                    logConsoleMessageInChat(msg.msg);
                break;
                case 'mod_log':
                    var popup = makePopup('.mod-log', '/' + msg.cmd, true, 250, 250, true, function () {
                        popup.destroy();
                    });
                    var ul = document.createElement('ul');
                    for (var i = 0; i < msg.items.length; i++) {
                        var item = msg.items[i];
                        var li = document.createElement('li');
                        var pre = document.createElement('pre');
                        appendText(li, {
                            ban: 'Ban',
                            unban: 'Unban',
                            kick: 'Kick',
                            warn: 'Warning',
                            move: 'Move room',
                            broadcast: 'Broadcast message',
                            bits_change: 'Bits balance change'
                        }[item.type] + ' by ' + item.mod + ' at ' + (new Date(item.date)).toLocaleString());
                        delete item.type;
                        delete item.date;
                        delete item.mod;
                        appendText(pre, JSON.stringify(item, null, 2));
                        li.appendChild(pre);
                        ul.appendChild(li);
                    }
                    popup.content.appendChild(ul);
                break;
                case 'mod_msgs':
                    var popup = makePopup('.mod-log', '/' + msg.cmd, true, 250, 250, true, function () {
                        popup.destroy();
                    });
                    var ul = document.createElement('ul');
                    for (var i = 0; i < msg.messages.length; i++) {
                        var message = msg.messages[i];
                        var li = document.createElement('li');
                        if (message.type === 'user_report') {
                            appendText(li, 'At ' + (new Date(message.date)).toLocaleString() +' "' + message.nick + '" was reported by "' + message.from + '" because: "' + message.reason + '"');
                        } else if (message.type === 'warn') {
                            appendText(li, 'At ' + (new Date(message.date)).toLocaleString() +' "' + message.nick + '" was warned by "' + message.from + '" because: "' + message.reason + '"');
                        }
                        ul.appendChild(li);
                    }
                    popup.content.appendChild(ul);
                break;
                case 'help':
                    var popup = makePopup('.mod-log', 'Help', true, 250, 250, true, function () {
                        popup.destroy();
                    });
                    var ul = document.createElement('ul');
                    for (var i = 0; i < msg.lines.length; i++) {
                        var li = document.createElement('li');
                        appendText(li, msg.lines[i]);
                        ul.appendChild(li);
                    }
                    popup.content.appendChild(ul);
                break;
                case 'mod_warning':
                    var popup = makePopup('.mod-warning', 'Moderator Warning', true, 250, 250, true, function () {
                        popup.destroy();
                    });
                    appendText(popup.content, 'You have been warned by ');
                    appendNickname(popup.content, msg.mod_nick, msg.mod_special);
                    appendText(popup.content, ' because: "' + msg.reason + '"');
                break;
                case 'profile':
                    showProfile(msg.data, msg.moderator_mode);
                break;
                case 'priv_msg':
                    logPrivmsgInChat(msg.from_nick, msg.msg, msg.from_special);
                break;
                case 'priv_msg_fail':
                    logPrivmsgFailInChat(msg.nick);
                break;
                case 'die':
                    userManager.kill(msg.nick, true);
                break;
                case 'room_list':
                    updateRoomList(msg.list);
                    globalUserCount = msg.user_count;
                    globalModCount = msg.mod_count;
                    userManager.showUserCounter();
                    userManager.updateCounter();
                break;
                case 'room_change':
                    changeRoom(msg.data);
                break;
                case 'object_add':
                    myRoom.objects[msg.name] = msg.data;
                    myRoom.objectOrder.push(msg.name);
                    if (msg.mine) {
                        refreshObjectList(msg.name);
                    } else {
                        refreshObjectList();
                    }
                break;
                case 'object_update':
                    myRoom.objects[msg.name] = msg.data;
                break;
                case 'object_delete':
                    myRoom.objectOrder.splice(myRoom.objectOrder.indexOf(msg.name), 1);
                    delete myRoom.objects[msg.name];
                    refreshObjectList();
                break;
                case 'room_setpublicedit':
                    myRoom.publicEdit = msg.enabled;
                    userManager.updateCounter();
                    // check if I own this room or I'm a mod
                    if (myRoom.owner === myNick || amModerator() || myRoom.publicEdit) {
                        // enable edit button
                        editbutton.disabled = false;
                    } else {
                        // disable edit button
                        editbutton.disabled = true;

                        // hide edit dialog
                        editdlg.hide();
                    }
                break;
                case 'room_seteighteenplus':
                    myRoom.eighteenPlus = msg.enabled;
                    userManager.updateCounter();
                break;
                case 'kick_notice':
                    logKickNoticeInChat(msg.mod_nick, msg.mod_special, msg.kickee_nick, msg.kickee_special, msg.reason);
                break;
                case 'kickban_notice':
                    logKickBanNoticeInChat(msg.mod_nick, msg.mod_special, msg.kickee_nick, msg.kickee_special, msg.reason);
                break;
                case 'kick':
                    if (msg.reason === 'account_in_use') {
                        alert('You are already logged in somewhere else. Log out from there first.');
                    } else if (msg.reason === 'bad_nick') {
                        alert('Bad nickname.\nNicknames must be between 3 and 18 characters long, and contain only letters, digits, and underscores (_).');
                    } else if (msg.reason === 'bad_login') {
                        alert('Login with Persona failed.');
                    } else if (msg.reason === 'no_assoc_account') {
                        alert('There is no account associated with this email address.\nAre you sure you have a schnitzelVerse account? This is separate from your Persona account, which you log in to to sign in to schnitzelVerse or create a schnitzelVerse account.');
                    } else if (msg.reason === 'already_email') {
                        alert('There is already an account associated with this email address. You can only have one schnitzelVerse account for one email address.');
                    } else if (msg.reason === 'already_account') {
                        alert('There is already an account with this nickname. Choose a different one.');
                    } else if (msg.reason === 'account_deleted') {
                        alert('Your account was deleted.');
                        navigator.id.logout();
                        // erase last avatar
                        localStorage.setItem('last-avatar', '');
                        window.location.reload();
                    } else if (msg.reason === 'protocol_error') {
                        alert('There was a protocol error. This usually means your client sent a malformed packet. Your client is probably out of date, try clearing your cache and refreshing.');
                    } else if (msg.reason === 'no_such_room') {
                        alert("No such room. You tried to join a room that doesn't exist.");
                    } else if (msg.reason === 'dont_have_item') {
                        alert("You do not have the item you tried to wear. This is probably a bug.");
                    } else if (msg.reason === 'dont_have_avatar') {
                        alert("You do not have the avatar you tried to wear. This is probably a bug.");
                        // erase last avatar
                        localStorage.setItem('last-avatar', '');
                    } else if (msg.reason === 'dont_have_item') {
                        alert("You do not have the item you tried to use. This is probably a bug.");
                    } else if (msg.reason === 'kick') {
                        if (msg.msg) {
                            alert('You were kicked!\nReason: "' + msg.msg + '"');
                        } else {
                            alert('You were kicked!');
                        }
                    } else if (msg.reason === 'ban') {
                        if (msg.msg) {
                            alert('You were banned!\nReason: "' + msg.msg + '"');
                        } else {
                            alert('You were banned!');
                        }
                    } else if (msg.reason === 'update') {
                        ignoreDisconnect = true;
                        window.setTimeout(function () {
                            alert('schnitzelVerse update happening - page will reload');
                            window.location.reload();
                        }, (5+Math.floor(Math.random() * 5)) * 1000);
                    } else {
                        alert('You were disconnected for an unrecognised reason: "' + msg.reason + '"');
                    }
                break;
                default:
                    alert('There was a protocol error. This usually means the server sent a malformed packet. Your client is probably out of date, try clearing your cache and refreshing.');
                    socket.close();
                break;
            }
        };
    }

    function clearForm(div) {
        div.innerHTML = '';
        div.appendChild(document.createTextNode('Loading schnitzelVerse...'));
    }

    function fetchStats(div) {
        var xhr, stats;

        xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                div.innerHTML = '';
                if (xhr.status === 200) {
                    stats = JSON.parse(xhr.responseText);
                    div.appendChild(document.createTextNode(stats.users_online + ' users online'));
                } else {
                    div.appendChild(document.createTextNode('Loading stats failed - sv may be down'));
                }
            }
        };
        if (window.location.hostname === 'localhost') {
            xhr.open('GET', 'http://localhost:9002/stats', true);
        } else {
            xhr.open('GET', 'http://ajf.me:9002/stats', true);
        }
        xhr.send();

        div.innerHTML = '';
        div.appendChild(document.createTextNode('loading stats...'));
    }

    function makeLoginForm(div) {
        var desc1, desc2, loginbtn, nickerrors, nick, signupbtn;

        desc1 = document.createElement('p');
        desc1.appendChild(document.createTextNode('Log in with Persona below, if you already have a schnitzelVerse account.'));
        div.appendChild(desc1);

        loginbtn = document.createElement('button');
        loginbtn.appendChild(document.createTextNode('Sign in to sV (using Persona login)'));
        loginbtn.onclick = function () {
            navigator.id.watch({
                loggedInUser: null,
                onlogin: function (assertion) {
                    window.schnitzelVerse = {
                        assertion: assertion,
                        mode: 'existing'
                    };
                    initNetwork();
                    clearForm(div);
                },
                onlogout: function () {}
            });
            navigator.id.request();
        };
        div.appendChild(loginbtn);

        desc2 = document.createElement('p');
        desc2.appendChild(document.createTextNode('Or create a new schnitzelVerse account with your Persona account. Nickname must be 3-18 characters, letters, digits and underscores (_) only.'));
        div.appendChild(desc2);

        nickerrors = document.createElement('div');
        nickerrors.className = 'field-errors';
        div.appendChild(nickerrors);

        nick = document.createElement('input');
        nick.type = 'text';
        nick.placeholder = 'Nickname';
        /^[a-zA-Z0-9_]+$/g
        nick.onkeyup = function () {
            nickerrors.innerHTML = '';
            if (nick.value.length < 3) {
                nickerrors.appendChild(document.createTextNode('Nickname is too short, must be at least 3 characters'));
                nick.className = 'field-invalid';
            } else if (nick.value.length > 18) {
                nickerrors.appendChild(document.createTextNode('Nickname is too long, must be a maximum of 18 characters'));
                nick.className = 'field-invalid';
            } else if (!nick.value.match(/^[a-zA-Z0-9_]+$/g)) {
                nickerrors.appendChild(document.createTextNode('Nickname must only contain letters, digits and underscores (_)'));
                nick.className = 'field-invalid';
            } else {
                nick.className = 'field-valid';
            }
        };
        div.appendChild(nick);

        signupbtn = document.createElement('button');
        signupbtn.appendChild(document.createTextNode('Create sV Account (using Persona login)'));
        signupbtn.onclick = function () {
            var nickname;

            if (!nick.value) {
                return;
            }
            nickname = nick.value.replace(/^\s+|\s+$/g, '');
            navigator.id.watch({
                loggedInUser: null,
                onlogin: function (assertion) {
                    window.schnitzelVerse = {
                        assertion: assertion,
                        mode: 'create',
                        nick: nickname
                    };
                    initNetwork();
                    clearForm(div);
                },
                onlogout: function () {}
            });
            navigator.id.request();
        };
        div.appendChild(signupbtn);
    }

    window.onload = function () {
        var star, i, stats, main, formdiv, nofeature;

        main = document.getElementById('main');
        stats = document.getElementById('stats');

        if (!Object.prototype.hasOwnProperty.call(window, 'WebSocket')) {
            nofeature = document.createElement('p');
            nofeature.appendChild(document.createTextNode('schnitzelVerse requires WebSocket to work, but your browser does not appear to support it. Use a modern browser like Internet Explorer 10, Mozilla Firefox, Google Chrome, or Safari.'));
            main.appendChild(nofeature);
            return;
        }

        worldcanvas = document.createElement('canvas');
        worldcanvas.id = 'bg';
        worldcanvas.width = window.innerWidth;
        worldcanvas.height = window.innerHeight;
        document.body.appendChild(worldcanvas);

        ctx = worldcanvas.getContext('2d');
        if (!(worldcanvas.getContext && worldcanvas.getContext('2d'))) {
            nofeature = document.createElement('p');
            nofeature.appendChild(document.createTextNode('schnitzelVerse requires HTML5 Canvas support to work, but your browser does not appear to support it. Use a modern browser like Internet Explorer 10, Mozilla Firefox, Google Chrome, or Safari.'));
            main.appendChild(nofeature);
            return;
        }

        render();

        fetchStats(stats);

        formdiv = document.createElement('div');
        formdiv.id = 'login-form';
        makeLoginForm(formdiv);
        main.appendChild(formdiv);
    };
}());
