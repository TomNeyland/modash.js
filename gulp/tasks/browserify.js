import config from '../config';

import gulp from 'gulp';
import gutil from 'gulp-util';

import filter from 'gulp-filter';
import sourcemaps from 'gulp-sourcemaps';
import plumber from 'gulp-plumber';
import uglify from 'gulp-uglify';

import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';

import watchify from 'watchify';
import browserify from 'browserify';

// transforms
import babelify from 'babelify';
import partialify from 'partialify';
import stripify from 'stripify';


gulp.task('browserify:dev', function() {
    var bundler = watchify(browserify({
        entries: [config.browserify.in],
        exclude: ['lodash'],
        cache: {},
        packageCache: {},
        fullPaths: true
    }))
    .exclude('lodash');

    var bundle = function() {
        return bundler.bundle()
            .pipe(plumber())
            .on('error', gutil.log.bind(gutil, 'Browserify Error'))
            .pipe(source(config.browserify.out))
            .pipe(buffer())
            .pipe(sourcemaps.init({
                loadMaps: true
            }))
            .pipe(sourcemaps.write('./'))
            .pipe(filter('*.min.js'))
            .pipe(gulp.dest(config.build));
    };

    bundler.on('error', gutil.log.bind(gutil, 'Browserify Error'));

    bundler.on('update', bundle);

    // bundler.on('log', function(msg) {
    //     gutil.log('Browserify build: ', gutil.colors.magenta(msg));
    // });

    return bundle();
});

gulp.task('browserify:build', function() {

    var bundler = browserify({
        entries: [config.browserify.in]
    })
    .exclude('lodash');

    var bundle = function() {
        bundler
            .bundle()
            .pipe(source(config.browserify.out))
            .pipe(buffer())
            .pipe(gulp.dest(config.build));

        return bundler
            .bundle()
            .pipe(source(config.browserify.minOut))
            .pipe(buffer())
            .pipe(uglify())
            .pipe(gulp.dest(config.build));
    };

    return bundle();
});
