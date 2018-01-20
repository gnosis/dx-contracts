#!/bin/bash

if [[ $TRAVIS_BRANCH =~ (contracts?(\/[a-zA-Z0-9/._-]*)?) ]]; then
  echo " ==> Detected a CONTRACT(S) branch"
  #jump back to root
  cd $TRAVIS_BUILD_DIR
  echo " ==> JUMPING LOCATIONS: NOW IN $TRAVIS_BUILD_DIR"
  #run solcover
  echo " ==> RUNNING solidity-coverage" && 
  ./node_modules/.bin/solidity-coverage
  #run codecov
  echo " ==> RUNNING codecov" &&
  ./node_modules/.bin/codecov 

  #&& cat coverage/lcov.info | coveralls;
else
  echo " ==> Detected a NON-CONTRACT(S) branch - compiling contracts and testing App compile"
  cd $TRAVIS_BUILD_DIR

  if [[ $TRAVIS_BRANCH = "master" ]]; then
    echo " ==> MASTER branch detected, running PRODUCTION BUILD"

    truffle compile --all && npm run build:prod; 
  else 
    echo " ==> NON-MASTER branch detected, running PRODUCTION DEVELOPMENT"

    truffle compile --all && npm run build:dev;
  fi;
fi;

#RUBY /contrac[ts?\/\S?]+/i
#JS /contracts?(\/[a-zA-Z0-9/._-]*)?/giu