// this is needed because it *looks* like karma wants an absolute
// path to the conf file
var karmaConfigPath = require('path').resolve('.') + '/karma.conf.js';

module.exports = {
    app: './src',
    build: './dist',
    js: {
        files: [
            './src/**/*.js',
            '!./tests/**/*.spec.js',
        ]
    },
    browserify: { 
        in : './src/modash.js',
        out: 'modash.min.js'
    },
    test: {
        karma: karmaConfigPath
    }

};
