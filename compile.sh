#!/bin/bash
# this script compiles bundler itself.
# it's somehow gruesome, but let's just deal with it.

cd `dirname "$0"`
rm ./main.js
./node_modules/typescript/bin/tsc --project tsconfig.json --outFile ./main.js
cat ./parts/bundler_launcher.js > /tmp/bundler.compiled.js.partial
cat ./main.js >> /tmp/bundler.compiled.js.partial
mv /tmp/bundler.compiled.js.partial ./main.js