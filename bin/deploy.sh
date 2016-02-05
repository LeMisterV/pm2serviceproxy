#!/bin/bash

if [ -d "$JENKINS_BUILD_DIR" ]
then
    echo ""
    echo ""
    echo "Copy files to jenkins-build/server folder"
    echo ""
    rsync -a --exclude=.git* ./ $JENKINS_BUILD_DIR/server/ && \
    echo "OK" || \
    echo "KO"

    cd $JENKINS_BUILD_DIR/server
fi

echo ""
echo ""
echo "Setup server folder"
echo ""
# TODO: We should probably have an init.sh script in our GIT repo
echo "npm install"
npm install > ../server-npm-install
[[ $? = 0 ]] && echo "OK" || echo "KO"
echo ""

BUILD_ID=dontKillMe \
pm2 ping

echo ""
echo ""
echo "Stop previous server version"
echo ""
pm2 delete $SERVER_NAME

echo ""
echo ""
echo "Start server"
echo ""
pm2 start server.js -n $SERVER_NAME

echo ""
echo ""
