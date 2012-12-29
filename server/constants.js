module.exports = {
    DEBUG_MODE: (process.argv.hasOwnProperty('2') && process.argv[2] === '--debug'),
    DEFAULT_PORT: 9002
};
