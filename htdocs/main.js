(function () {
    'use strict';

    var socket, loginform;

    loginform = document.getElementById('login-form');
    loginform.innerHTML = '';
    loginform.appendChild(document.createTextNode('Connecting...'));

    if (window.location.hostname === 'localhost') {
        socket = new WebSocket('ws://localhost:9002', 'schnitzelVerse');
    } else {
        socket = new WebSocket('ws://ajf.me:9002', 'schnitzelVerse');
    }

    socket.onopen = function () {
        socket.send(JSON.stringify({
            type: 'login',
            assertion: window.ponyplace.assertion,
            mode: window.ponyplace.mode,
            nick: window.ponyplace.nick || null
        }));
    };
    socket.onclose = function (e) {
        console.log('Lost connection.');
        console.dir(e);
        loginform.innerHTML = '';
        loginform.appendChild(document.createTextNode('Connecting failed.'));
    };
}());
