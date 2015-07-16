import gulp from 'gulp';
import runSequence from 'run-sequence';

gulp.task('build', function() {
    return runSequence(
        'test:once',
        'lint',
        'clean',
        'browserify:build'
    );
});
