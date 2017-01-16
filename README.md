README
======

schnitzelVerse is a WIP 2d online world powered by HTML5, node.js and WebSocket.

Configuration
-------------

1. Make sure you have a `special-users.json` file in the `server/data` directory. Make sure the usernames listed have accounts attached, otherwise anyone can create one with that name and use mod powers. Should be of format:

        {
            "tomiko": "creator",
            "saki": "moderator",
            "satoru": "moderator",
            "mamoru": "bot"
        }


2. You'll also need a `bypass.json` file in `server/data`. You can leave it empty (`{}`), but if you have any bots, this allows them to bypass login via Persona, and instead use a password, e.g.:

        {
            "somebot": "password123"
        }

Running Server
--------------

1. Obviously, make sure you have node.js.
2. Run `npm install`. This will install the dependencies.
3. Run `server.js` (add `--debug` switch if running locally)
4. Run a web server at the same hostname. When debugging, run one at `localhost:8000`. Note that it expects, for login verification purposes, the production server to always be called `schnitzelverse.ajf.me` and be on port 80.
