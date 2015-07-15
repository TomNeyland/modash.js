module.exports = function(config) {
    config.set({

        frameworks: ['mocha', 'browserify','chai'],

        files: [
            // Per test imports...?
            'tests/**/*.spec.js',
            'tests/*.spec.js',
        ],

        exclude: [
        ],

        preprocessors: {
            'src/modash.js': ['browserify'],
            'tests/*.spec.js': ['browserify'],
            'tests/**/*.spec.js': ['browserify']
        },

        reporters: ['progress'],
        port: 9876,
        colors: true,

        // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_INFO,
        autoWatch: false,
        browsers: ['PhantomJS'],
        singleRun: true,

        browserify: {
            extensions: ['.js'],
            debug: true,
            transform: ['babelify', 'partialify']
        }
    });
};
