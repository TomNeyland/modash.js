var gulp = require('gulp');
var runSequence = require('run-sequence');

gulp.task('build', function() {
    return runSequence('test:once', 'jshint', 'clean',
        // these are done async
        'browserify:build',
        'uglify');
});
