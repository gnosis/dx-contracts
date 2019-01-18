#!/bin/bash

function run_tests {  
  #jump back to root
  cd $TRAVIS_BUILD_DIR
  echo " ==> JUMPING LOCATIONS: NOW IN $TRAVIS_BUILD_DIR"

  # running contracts tests
  echo " ==> RUNNING test"
  npm test;
}

if [[ $TRAVIS_BRANCH = "master" || $TRAVIS_BRANCH = "develop" ]]; then
  echo " ==> Detected PRINCIPAL branch - compiling and testing contracts"
  run_tests
else
  # echo " ==> No execution for branches other than MASTER or DEVELOP"
  echo " ==> Detected BRANCH branch - compiling and testing contracts"
  run_tests
fi;
