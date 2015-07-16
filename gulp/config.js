// this is needed because it *looks* like karma wants an absolute
// path to the conf file
import {resolve} from 'path';

export default {
    app: './src',
    build: './dist',
    js: {
        files: [
            './src/**/*.js',
            '!./tests/**/*.spec.js'
        ]
    },
    browserify: {
        in: './src/modash.js',
        out: 'modash.js',
        minOut: 'modash.min.js'
    },
    test: {
        karma: `${resolve('.')}/karma.conf.js`
    }
};
