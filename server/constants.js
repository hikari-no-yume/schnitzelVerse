module.exports = {
    DEBUG_MODE: (process.argv.hasOwnProperty('2') && process.argv[2] === '--debug'),
    DEFAULT_PORT: 9002,
    DEFAULT_ORIGIN: 'http://ponyplace.ajf.me',
    DEBUG_ORIGIN: 'http://localhost:8000',
    SITE_NAME: 'schnitzelVerse'
};
