#!/bin/bash

if [[ $TRAVIS_BRANCH =~ (contracts?(\/[a-zA-Z0-9/._-]*)?) ]]; then
  echo "Detected a CONTRACT(S) branch - running Truffle Test"

  truffle compile --all && truffle network --clean &&
  truffle migrate --reset && truffle test &&
  npm run coverage 
  #&& cat coverage/lcov.info | coveralls;
else
  echo "Detected a NON-CONTRACT(S) branch - compiling contracts and testing App compile"

  if [[ $TRAVIS_BRANCH = "master" ]]; then
    echo "MASTER branch detected, running PRODUCTION BUILD"

    truffle compile --all && npm run build:prod; 
  else 
    echo "NON-MASTER branch detected, running PRODUCTION DEVELOPMENT"

    truffle compile --all && npm run build:dev;
  fi;
fi;

#RUBY /contrac[ts?\/\S?]+/i
#JS /contracts?(\/[a-zA-Z0-9/._-]*)?/giu