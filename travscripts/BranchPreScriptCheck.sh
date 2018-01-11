#!/bin/bash

if [[ $TRAVIS_BRANCH =~ (contracts?(\/[a-zA-Z0-9/._-]*)?) ]]; then
  echo " ==> Detected a CONTRACT(S) branch - initiating GanacheRPC"

  cd $TRAVIS_BUILD_DIR
  ganache-cli > /dev/null & sleep 5
else
  echo " ==> Detected a NON-CONTRACT(S) branch - continuing normally"

  cd $TRAVIS_BUILD_DIR
fi;

#RUBY /contrac[ts?\/\S?]+/i
#JS /contracts?(\/[a-zA-Z0-9/._-]*)?/giu