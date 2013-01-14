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
                    while (str[0] > ' ' && str) {
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
        var tokens, tok, i, stack = [], val1, val2, val3, val4, y = 0, name;

        for (name in vars) {
            if (vars.hasOwnProperty(name)) {
                if (typeof name === 'number') {
                    vars[name] = {
                        type: 'number',
                        val: vars[name]
                    };
                } else {
                    vars[name] = {
                        type: 'string',
                        val: (vars[name] || '').toString()
                    };
                }
            }
        }

        ctx.fillStyle = 'white';
        ctx.font = 'bold 12pt monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        function print(text) {
            ctx.fillText(text, 0, y);
            y += 20;
        }

        function textAt(text, x, y) {
            ctx.fillText(text, x, y);
        }

        function boxAt(x, y, w, h) {
            ctx.fillRect(x, y, w, h);
        }

        function clear() {
            y = 0;
            ctx.fillRect(0, 0, maxWidth, maxHeight);
        }

        function getVar(name) {
            if (vars.hasOwnProperty(name)) {
                return vars[name];
            } else {
                throw new Error('ERROR: unknown variable "' + name + '"');
            }
        }

        function popNum() {
            var val = stack.pop();
            if (val.type === 'number') {
                return val.val;
            } else if (val.type === 'string') {
                return parseInt(val.val);
            } else {
                return parseInt(getVar(val.val).val);
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
                return getVar(val.val).val.toString();
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
        function pushVar(val) {
            stack.push({
                type: 'var',
                val: val
            });
        }

        tokens = split(script);

        for (i = 0; i < tokens.length; i++) {
            tok = tokens[i];
            if (tok.type === 'number') {
                pushNum(tok.val);
            } else if (tok.type === 'string') {
                pushString(tok.val);
            } else if (tok.type === 'var') {
                try {
                    if (tok.val === '*') {
                        pushNum(popNum() * popNum());
                    } else if (tok.val === '/') {
                        val1 = popNum();
                        val2 = popNum();
                        pushNum(Math.floor(val2 / val1));
                    } else if (tok.val === '%') {
                        val1 = popNum();
                        val2 = popNum();
                        pushNum(Math.floor(val2 % val1));
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
                    } else if (tok.val === '&') {
                        pushVar(popString());
                    } else if (tok.val === '!sin') {
                        pushNum(Math.floor(1000 * Math.sin(popNum() * Math.PI/180)));
                    } else if (tok.val === '!cos') {
                        pushNum(Math.floor(1000 * Math.cos(popNum() * Math.PI/180)));
                    } else if (tok.val === '!print') {
                        print(popString());
                    } else if (tok.val === '!colour') {
                        ctx.fillStyle = popString();
                    } else if (tok.val === '!font') {
                        ctx.font = popString();
                    } else if (tok.val === '!clear') {
                        clear();
                    } else if (tok.val === '!boxat') {
                        val1 = popNum();
                        val2 = popNum();
                        val3 = popNum();
                        val4 = popNum();
                        boxAt(val1, val2, val3, val4);
                    } else if (tok.val === '!textat') {
                        val1 = popString();
                        val2 = popNum();
                        val3 = popNum();
                        textAt(val1, val2, val3);
                    } else {
                        pushVar(tok.val);
                    }
                } catch (e) {
                    print('ERROR: ' + e);
                    return vars;
                }
            }
        }

        return vars;
    };
}());
