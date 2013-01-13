(function () {
    'use strict';

    var fjord = {}, numRegex = /^[0-9]+$/g;
    window.fjord = fjord;

    function split(str) {
        var tokens = [], in_string, curtok = '';

        while (str) {
            if (str[0] <= ' ') {
                str = str.substr(1);
            } else {
                curtok = '';
                if (str[0] === '"') {
                    str = str.substr(1);
                    while (str[0] !== '"' && str) {
                        if (str[0] === '\\') {
                            curtok += str[1];
                            str = str.substr(2);
                        } else {
                            curtok += str[0];
                            str = str.substr(1);
                        }
                    }
                    str = str.substr(1);
                    tokens.push({
                        type: 'string',
                        val: curtok
                    });
                } else {
                    while (str[0] !== ' ' && str) {
                        curtok += str[0];
                        str = str.substr(1);
                    }
                    if (!!curtok.match(numRegex)) {
                        tokens.push({
                            type: 'number',
                            val: parseInt(curtok)
                        });
                    } else {
                        tokens.push({
                            type: 'var',
                            val: curtok
                        });
                    }
                }
            }
        }

        return tokens;
    }

    fjord.exec = function (script, vars, ctx, maxWidth, maxHeight) {
        var tokens, tok, i, stack = [], vars = {}, val1, val2, y = 0;

        ctx.fillStyle = 'white';
        ctx.font = 'bold 12pt monospace';

        function print(text) {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            if (y + 10 < maxHeight) {
                ctx.fillText(text, 0, y);
                y += 20;
                console.log('!print: ' + text);
            } else {
                console.log('!print ERROR: Exceeded object height');
            }
        }

        function popNum() {
            var val = stack.pop();
            if (val.type === 'number') {
                return val.val;
            } else if (val.type === 'string') {
                return parseInt(val.val);
            } else {
                return parseInt(vars[val.val].val);
            }
        }
        function pushNum(val) {
            stack.push({
                type: 'number',
                val: val
            });
        }

        function popString() {
            var val = stack.pop();
            if (val.type === 'number') {
                return val.val.toString();
            } else if (val.type === 'var') {
                return vars[val.val].val.toString();
            } else {
                return val.val;
            }
        }
        function pushString(val) {
            stack.push({
                type: 'string',
                val: val
            });
        }

        function popVar() {
            var val = stack.pop();
            if (val.type === 'var') {
                return val.val;
            }
        }

        tokens = split(script);

        for (i = 0; i < tokens.length; i++) {
            tok = tokens[i];
            if (tok.type === 'number') {
                pushNum(tok.val);
            } else {
                try {
                    if (tok.val === '*') {
                        pushNum(popNum() * popNum());
                    } else if (tok.val === '/') {
                        val1 = popNum();
                        val2 = popNum();
                        pushNum(Math.floor(val2 / val1));
                    } else if (tok.val === '+') {
                        pushNum(popNum() + popNum());
                    } else if (tok.val === '-') {
                        pushNum(popNum() - popNum());
                    } else if (tok.val === '.') {
                        val1 = popString();
                        val2 = popString();
                        pushString(val1 + val2);
                    } else if (tok.val === '=') {
                        val1 = popVar();
                        val2 = stack.pop();
                        vars[val1] = val2;
                    } else if (tok.val === '!print') {
                        print(popString());
                    } else if (tok.val === '!colour') {
                        ctx.fillStyle = popString();
                    } else {
                        stack.push(tok);
                    }
                } catch (e) {
                    print('ERROR: ' + e);
                }
            }
        }

        return vars;
    };
}());
