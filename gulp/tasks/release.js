import gulp from 'gulp';
import bump from 'gulp-bump';
import git from 'gulp-git';
import filter from 'gulp-filter';
import tag from 'gulp-tag-version';
import runSequence from 'run-sequence';

runSequence.use(gulp);

var config = {
    releaseImportance: 'patch'
};

function getImportance() {
    return config.releaseImportance;
}

function release() {
    return runSequence(
        'test:once',
        'jshint',
        'clean',
        'browserify:build',
        'dobump',
        'changelog',
        'commit-release'
    );
}

gulp.task('dobump', function() {
    return gulp.src(['./bower.json', './package.json'])
        .pipe(bump({
            type: getImportance()
        }))
        .pipe(gulp.dest('./'));
});

gulp.task('commit-release', function() {
    return gulp.src(['./bower.json', './package.json', './CHANGELOG.md', './dist', './dist/*.*', './dist/*'])
        .pipe(git.add({
            args: '-f -A'
        }))
        .pipe(git.commit('chore(release): New ' + getImportance() + ' release'))
        .pipe(filter('bower.json'))
        .pipe(tag());
});

gulp.task('release:patch', function() {
    config.releaseImportance = 'patch';
    return release();
});

gulp.task('release:minor', function() {
    config.releaseImportance = 'minor';
    return release();
});

gulp.task('release:major', function() {
    config.releaseImportance = 'major';
    return release();
});
