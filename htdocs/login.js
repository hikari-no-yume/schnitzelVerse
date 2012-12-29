(function () {
    'use strict';

    function secs() {
        return new Date().getTime() / 1000;
    }

    function loadStageTwo() {
        var script;

        script = document.createElement('script');
        script.src = 'main.js';
        document.body.appendChild(script);
    }

    function fetchStats(div) {
        var xhr, stats;

        xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                stats = JSON.parse(xhr.responseText);
                div.innerHTML = '';
                div.appendChild(document.createTextNode(stats.users_online + ' users offline | ' + stats.requests + ' requests since reboot'));
            }
        }
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
        var desc1, desc2, loginbtn, nick, signupbtn;

        desc1 = document.createElement('p');
        desc1.appendChild(document.createTextNode('Log in with Persona below, if you already have a schnitzelVerse account.'));
        div.appendChild(desc1);

        loginbtn = document.createElement('button');
        loginbtn.appendChild(document.createTextNode('Log in with Persona'));
        loginbtn.onclick = function () {
            navigator.id.watch({
                loggedInUser: null,
                onlogin: function (assertion) {
                    window.ponyplace = {
                        assertion: assertion,
                        mode: 'login'
                    };
                    loadStageTwo();
                },
                onlogout: function () {}
            });
            navigator.id.request();
        };
        div.appendChild(loginbtn);

        desc2 = document.createElement('p');
        desc2.appendChild(document.createTextNode('Or create a new schnitzelVerse account with your Persona account. Nickname must be 3-18 characters, letters, digits and underscores (_) only.'));
        div.appendChild(desc2);

        nick = document.createElement('input');
        nick.type = 'text';
        nick.placeholder = 'Nickname';
        div.appendChild(nick);

        signupbtn = document.createElement('button');
        signupbtn.appendChild(document.createTextNode('Sign up with Persona'));
        signupbtn.onclick = function () {
            if (!nick.value) {
                return;
            }
            navigator.id.watch({
                loggedInUser: null,
                onlogin: function (assertion) {
                    window.ponyplace = {
                        assertion: assertion,
                        mode: 'signup',
                        nick: nick.value
                    };
                    loadStageTwo();
                },
                onlogout: function () {}
            });
            navigator.id.request();
        };
        div.appendChild(signupbtn);
    }

    window.onload = function () {
        var canvas, ctx, stars, star, i, render, stats, main, formdiv;

        main = document.getElementById('main');
        stats = document.getElementById('stats');

        canvas = document.createElement('canvas');
        canvas.id = 'bg';
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        document.body.appendChild(canvas);

        ctx = canvas.getContext('2d');

        stars = [];

        render = function render() {
            var starnum, starspeed, now, size;

            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            starnum = Math.floor(Math.sqrt(canvas.width * canvas.height) / 2);
            starspeed = 115;

            if (stars.length < starnum - 1) {
                for (i = stars.length; i < starnum; i += 1) {
                    star = {
                        x: Math.random() * canvas.width,
                        y: Math.random() * canvas.height,
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
                    stars[i].x += canvas.width;
                }

                size = 3 * stars[i].depth;
                ctx.fillStyle = 'white';
                ctx.fillRect(stars[i].x - size / 2, stars[i].y - size / 2, size, size);
            }

            window.requestAnimationFrame(render, canvas);
        };
        render();

        fetchStats(stats);

        formdiv = document.createElement('div');
        formdiv.id = 'login-form';
        makeLoginForm(formdiv);
        main.appendChild(formdiv);
    };
}());
