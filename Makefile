
dependencies:
	npm --loglevel error install

clean:
	rm -rf node_modules/
	rm -rf bower_components/

build:
	make clean
	make dependencies
	npm run build
	npm run test-once


.PHONY : build
