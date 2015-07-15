# modash.js

[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Tag](https://img.shields.io/github/tag/TomNeyland/modash.js.svg?style=flat)](https://github.com/TomNeyland/modash.js)
[![Build](https://travis-ci.org/TomNeyland/modash.js.svg)](https://travis-ci.org/TomNeyland/modash.js)
[![Dependency Status](https://david-dm.org/TomNeyland/modash.js.svg)](https://david-dm.org/TomNeyland/modash.js)
[![devDependency Status](https://david-dm.org/TomNeyland/modash.js/dev-status.svg)](https://david-dm.org/TomNeyland/modash.js#info=devDependencies)
## Usage

1. `make dependencies`
2. `gulp`

## Build

1. `make build`

## Style

### JavaScript
#### TBD

### Modules

Code is divided into logical ES6 modules. A typical module will look something like this:

```javascript
import _ from 'lodash';

/* TODO: Create Example */

class ExampleClass {
    constructor(data) {
        _.extend(this, data);
    }
}

export default ExampleClass;
```

### Commit Message Format

**[Follow the angular conventional changelog format](https://github.com/ajoslin/conventional-changelog/blob/master/conventions/angular.md)**

Each commit message consists of a **header**, a **body** and a **footer**.  The header has a special
format that includes a **type**, a **scope** and a **subject**:

```<type>(<scope>): <subject>```

Or more verbose:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

Any line of the commit message cannot be longer 100 characters! This allows the message to be easier
to read on github as well as in various git tools.

### Revert

If the commit reverts a previous commit, it should begin with `revert: `, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

### Type

Must be one of the following:

* **feat**: A new feature
* **fix**: A bug fix
* **docs**: Documentation only changes
* **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing
  semi-colons, etc)
* **refactor**: A code change that neither fixes a bug or adds a feature
* **perf**: A code change that improves performance
* **test**: Adding missing tests
* **chore**: Changes to the build process or auxiliary tools and libraries such as documentation
  generation

